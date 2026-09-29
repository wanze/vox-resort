import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Narrower than the original's pad: a figure is three voxels wide.
const LOUNGER = { x: 5, x1: 9, z: 3, z1: 12 } as const;

const GROUND = 2;
const FRAME = GROUND + 1;
const PAD = FRAME + 1;

export default defineModel({
  id: 'sun-lounger-b',
  label: 'Sun Lounger B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // z is the hips: the figure runs four voxels back and three forward, so at 8
  // the head lands on the raised back and the feet at the end of the pad.
  seats: [{ x: 7, y: PAD + 1, z: 8, facing: 0, pose: 'lie' }],
  build: (b: VoxelBuilder) => {
    const { sand, stucco, teak } = PALETTE;
    plinth(b, { x: 0, z: 0, w: 16, d: 16, height: GROUND, stone: sand });

    for (const x of [LOUNGER.x, LOUNGER.x1]) {
      for (const z of [LOUNGER.z + 1, LOUNGER.z1]) b.set(x, GROUND, z, teak.deep);
    }
    // One course rather than slats: a slat stripe would mesh as many quads instead of one plane.
    b.box(LOUNGER.x, LOUNGER.x1, FRAME, FRAME, LOUNGER.z, LOUNGER.z1, teak.base);
    b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD, LOUNGER.z + 1, LOUNGER.z1 - 1, stucco.light);

    // The back steps up towards the head, so it reads as reclined rather than as a bed.
    b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 2, LOUNGER.z, LOUNGER.z, teak.base);
    b.box(LOUNGER.x, LOUNGER.x1, PAD + 3, PAD + 3, LOUNGER.z, LOUNGER.z, stucco.light);
    b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 2, LOUNGER.z + 1, LOUNGER.z + 1, stucco.light);
    b.box(LOUNGER.x, LOUNGER.x1, PAD, PAD + 1, LOUNGER.z + 2, LOUNGER.z + 2, stucco.light);
  },
});
