import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { rampPlanksAt } from './parts/span.ts';
import { buildModel, TILE_VOXELS, type VoxelModelSource } from './voxelgen.ts';

// A rail shares its tile with the paving under it, so an outward face in the same
// plane as the paving would z-fight. Bottom faces are culled and exempt.
const PAIRS: readonly (readonly [string, string])[] = [
  ['stairs', 'stair-railing'],
  ['path', 'railing'],
  ['boardwalk', 'railing'],
  ['jetty', 'railing'],
  ['jetty', 'pier-railing'],
  ['bridge', 'bridge-railing'],
];

const byId = new Map(MODEL_SOURCES.map((source) => [source.id, source]));

const STEPS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

type Turn = 0 | 1 | 2 | 3;

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

function voxelsOnEdge(source: VoxelModelSource, turn: Turn = 0): Map<string, number> {
  const model = buildModel(source);
  const voxels = new Map<string, number>();
  for (const voxel of model.voxels) {
    const [x, z] = onEdge(voxel.x, voxel.z, model.depth, turn);
    voxels.set(`${x},${voxel.y},${z}`, voxel.color);
  }
  return voxels;
}

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
