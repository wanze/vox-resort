import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Two layers, level with PAVING_VOXELS, so the slab does not step up out of the path.
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// The original's extents, so a run of either hedge lines up with the other.
const KERB = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

const BODY = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

// Kerb plus four courses of hedge is still 1.25 m, low enough to see a bench over.
const COURSES = 4;

export default defineModel({
  id: 'hedge-b',
  label: 'Hedge B',
  category: 'grounds',
  scenery: 0.3,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone } = PALETTE;

    plinth(b, SLAB);

    box(KERB.x0, KERB.x1, GROUND, GROUND, KERB.z0, KERB.z1, stone.light);
    const top = GROUND + COURSES;
    box(BODY.x0, BODY.x1, GROUND + 1, top - 1, BODY.z0, BODY.z1, foliage.shade);
    // Fresh growth on the clipped top, full width so each flank stays one rectangle.
    box(BODY.x0, BODY.x1, top, top, BODY.z0, BODY.z1, foliage.light);
  },
});
