import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { rampPlanksAt } from './parts/span.ts';
import { buildModel, TILE_VOXELS, type VoxelModelSource } from './voxelgen.ts';

/**
 * A rail claims no ground: it stands on the tile it guards, alongside whatever
 * paving is already there (see `features/layout/domain/railings.ts`). So a rail
 * and its paving are two models in the same cubic metre of world, and the one
 * thing they must never do is put an outward face in the same plane as the
 * other's: two faces at the same depth facing the same way are two the depth
 * buffer cannot choose between, which is a stippled band up the side of every
 * pier and staircase on the plot, swimming as the camera moves.
 *
 * Both keep the feet they need, because a model is shifted onto its own origin
 * and a rail that painted nothing at ground level would sink into the paving; and
 * both draw them a voxel in from the tile's edge, which is what this pins.
 *
 * Undersides are exempt: a face at the very bottom of a model points down, is
 * culled before it is ever drawn, and has the ground under it besides.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['stairs', 'stair-railing'],
  ['path', 'railing'],
  ['boardwalk', 'railing'],
  ['jetty', 'railing'],
  ['jetty', 'pier-railing'],
  ['bridge', 'bridge-railing'],
];

const byId = new Map(MODEL_SOURCES.map((source) => [source.id, source]));

/** The six ways out of a voxel. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

type Turn = 0 | 1 | 2 | 3;

/**
 * Where a voxel of a 16-by-`depth` edge rail lands on its tile once it is turned
 * and stood flush against the edge — the mapping `rotatePoint` and `placeOnEdge`
 * in `src/` perform between them, spelled out cell by cell.
 */
function onEdge(x: number, z: number, depth: number, turn: Turn): [number, number] {
  const N = TILE_VOXELS - 1;
  switch (turn) {
    case 1:
      return [z, N - x];
    case 2:
      return [N - x, TILE_VOXELS - depth + (depth - 1 - z)];
    case 3:
      return [TILE_VOXELS - depth + (depth - 1 - z), x];
    default:
      return [x, z];
  }
}

/** The voxels of a model stood on an edge of its tile, keyed by where they land. */
function voxelsOnEdge(source: VoxelModelSource, turn: Turn = 0): Map<string, number> {
  const model = buildModel(source);
  const voxels = new Map<string, number>();
  for (const voxel of model.voxels) {
    const [x, z] = onEdge(voxel.x, voxel.z, model.depth, turn);
    voxels.set(`${x},${voxel.y},${z}`, voxel.color);
  }
  return voxels;
}

/** Every outward face of a model, as a voxel and the way it faces. */
function facesOf(source: VoxelModelSource, turn: Turn = 0): Set<string> {
  const solid = new Set(voxelsOnEdge(source, turn).keys());
  const faces = new Set<string>();
  for (const key of solid) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of STEPS) {
      if (dy < 0 && y === 0) continue;
      if (solid.has(`${x + dx},${y + dy},${z + dz}`)) continue;
      faces.add(`${x},${y},${z}|${dx},${dy},${dz}`);
    }
  }
  return faces;
}

describe('rails against the paving they stand on', () => {
  it.each(PAIRS)('%s and %s share no face plane', (pavingId, railId) => {
    const paving = facesOf(byId.get(pavingId)!);
    const shared = [...facesOf(byId.get(railId)!)].filter((face) => paving.has(face));
    expect(shared).toEqual([]);
  });
});

/**
 * A bridge ramp and the parapets `railings.ts` stands on it, turned the way it
 * turns them: the right-hand railing a quarter turn on from the ramp's bank, the
 * left-hand one three quarters on, and the deck's railing across its head.
 */
const RAMP_RAILS: readonly (readonly [string, Turn])[] = [
  ['bridge-ramp-railing-right', 1],
  ['bridge-ramp-railing-left', 3],
  ['bridge-railing', 2],
];

describe('the parapets on a bridge ramp', () => {
  const ramp = byId.get('bridge-ramp')!;

  it.each(RAMP_RAILS)('%s turned %i shares no face plane with the ramp', (railId, turn) => {
    const paving = facesOf(ramp);
    const shared = [...facesOf(byId.get(railId)!, turn)].filter((face) => paving.has(face));
    expect(shared).toEqual([]);
  });

  it.each([
    ['bridge-ramp-railing-right', 1, 0],
    ['bridge-ramp-railing-left', 3, TILE_VOXELS - 1],
  ] as const)('%s climbs with the treads up the flank it is turned to', (railId, turn, x) => {
    // Mirrored the wrong way round, the kick rail would stand in the planks at
    // one end of the ramp and a metre over them at the other.
    const planks = voxelsOnEdge(ramp);
    const rail = voxelsOnEdge(byId.get(railId)!, turn);
    for (let z = 0; z < TILE_VOXELS; z++) {
      const y = rampPlanksAt(z);
      expect({
        z,
        plank: planks.has(`${x},${y},${z}`),
        kick: rail.has(`${x},${y + 1},${z}`),
      }).toEqual({ z, plank: true, kick: true });
    }
  });
});
