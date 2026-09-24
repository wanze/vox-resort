import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Two layers, not three: PAVING_VOXELS is two, so a taller slab would step up out of
// the path beside it. Sand rather than stone to match the paths and trees around it.
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// 12 of the 16 voxels across, so neighbouring tiles join into one run.
const BLOCK = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

// Five is 1.25 m, low enough to see a bench over.
const COURSES = 5;

export default defineModel({
  id: 'hedge',
  label: 'Hedge',
  category: 'grounds',
  scenery: 0.3,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage } = PALETTE;

    plinth(b, SLAB);

    // Deliberately plain: hedges are placed about a thousand times a plot. A full-width
    // crown keeps each flank to two rectangles for the mesher.
    const top = GROUND + COURSES - 1;
    box(BLOCK.x0, BLOCK.x1, GROUND, top - 1, BLOCK.z0, BLOCK.z1, foliage.shade);
    box(BLOCK.x0, BLOCK.x1, top, top, BLOCK.z0, BLOCK.z1, foliage.base);
  },
});
