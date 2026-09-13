import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { buildModel, type VoxelModelSource } from './voxelgen.ts';

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

/** Every outward face of a model, as a voxel and the way it faces. */
function facesOf(source: VoxelModelSource): Set<string> {
  const model = buildModel(source);
  const solid = new Set(model.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const faces = new Set<string>();
  for (const voxel of model.voxels) {
    for (const [dx, dy, dz] of STEPS) {
      if (dy < 0 && voxel.y === 0) continue;
      if (solid.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      faces.add(`${voxel.x},${voxel.y},${voxel.z}|${dx},${dy},${dz}`);
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
