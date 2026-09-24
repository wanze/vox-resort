import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Two layers of sand, level with the two-layer paving and its sandy path, so the
// bench is no step up from the walk.
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

const SEAT = { x: 1, x1: 14, z: 6, z1: 8 } as const;

const BACK = SEAT.z - 1;

// A figure is three voxels wide and centred on its column, so 4 apart keeps the
// outer two clear of the arms.
const SITTERS = [4, 8, 12] as const;

export default defineModel({
  id: 'bench',
  label: 'Bench',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  seats: SITTERS.map((x) => ({ x, y: HIPS, z: SEAT.z + 1, facing: 0 as const })),
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    plinth(b, SLAB);

    for (const x of [SEAT.x + 1, SEAT.x1 - 1]) {
      box(x, x + 1, GROUND, GROUND, SEAT.z, SEAT.z1, teak.deep);
    }

    // One course rather than slats: a slat stripe would mesh as many quads instead of one plane.
    box(SEAT.x, SEAT.x1, PLANK, PLANK, SEAT.z, SEAT.z1, teak.base);

    box(SEAT.x, SEAT.x1, HIPS, HIPS + 1, BACK, BACK, teak.shade);
    box(SEAT.x, SEAT.x1, HIPS + 2, HIPS + 2, BACK, BACK, teak.light);

    for (const x of [SEAT.x, SEAT.x1]) box(x, x, HIPS, HIPS, SEAT.z, SEAT.z1, teak.light);
  },
});
