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

// The backrest is the front wall of a planter, like a bench built into a garden terrace.
const PLANTER = { x: 1, x1: 14, z: 1, z1: SEAT.z - 1, top: HIPS + 2 } as const;

// A figure is three voxels wide and centred on its column, so 4 apart keeps the
// outer two clear of the end blocks.
const SITTERS = [4, 8, 12] as const;

export default defineModel({
  id: 'bench-b',
  label: 'Bench B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  seats: SITTERS.map((x) => ({ x, y: HIPS, z: SEAT.z + 1, facing: 0 as const })),
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, stone, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    box(PLANTER.x, PLANTER.x1, GROUND, PLANTER.top, PLANTER.z, PLANTER.z1, stucco.base);
    box(PLANTER.x, PLANTER.x1, PLANTER.top, PLANTER.top, PLANTER.z, PLANTER.z1, stone.light);
    const bed = { x: PLANTER.x + 1, x1: PLANTER.x1 - 1, z: PLANTER.z + 1, z1: PLANTER.z1 - 1 };
    box(bed.x, bed.x1, PLANTER.top, PLANTER.top + 1, bed.z, bed.z1, foliage.base);
    // Blooms set flush into the leaves, each clump one flat patch; scattered
    // flowers would mesh voxel by voxel.
    box(3, 5, PLANTER.top + 1, PLANTER.top + 1, bed.z, bed.z + 1, bloom.base);
    box(9, 10, PLANTER.top + 1, PLANTER.top + 1, bed.z + 1, bed.z1, bloom.base);

    for (const x of [SEAT.x, SEAT.x1]) box(x, x, GROUND, HIPS, SEAT.z, SEAT.z1, stucco.base);
    // Recessed a voxel under the seat so the teak reads as a slab laid on the stucco.
    box(SEAT.x + 1, SEAT.x1 - 1, GROUND, GROUND, SEAT.z, SEAT.z1 - 1, stucco.base);
    box(SEAT.x + 1, SEAT.x1 - 1, PLANK, PLANK, SEAT.z, SEAT.z1, teak.base);
  },
});
