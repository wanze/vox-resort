// The slab is two layers to match PAVING_VOXELS, so there is no step up from the paving beside it.
// On the amenities shelf, not grounds: dressing grows no spur, and a table nobody can walk to is useless.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

const TOP = PLANK + 2;

const TABLE = { x: 8, x1: 23, z: 6, z1: 9 } as const;
const BENCH = { x: 7, x1: 24, north: 3, south: 11 } as const;

const PEDESTALS = [
  [10, 11],
  [20, 21],
] as const;

// A figure is three voxels wide and centred on its column, so these are 4 apart.
const SITTERS = [9, 13, 17, 21] as const;

const NORTH_HIPS = BENCH.north + 1;
const SOUTH_HIPS = BENCH.south;

export default defineModel({
  id: 'picnic-table-b',
  label: 'Picnic Table B',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  seats: [
    ...SITTERS.map((x) => ({ x, y: HIPS, z: NORTH_HIPS, facing: 0 as const })),
    ...SITTERS.map((x) => ({ x, y: HIPS, z: SOUTH_HIPS, facing: 2 as const })),
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, SLAB);

    for (const [x, x1] of PEDESTALS) {
      box(x, x1, GROUND, TOP - 1, TABLE.z + 1, TABLE.z1 - 1, stucco.base);
      for (const z of [BENCH.north, BENCH.south]) {
        box(x, x1, GROUND, PLANK - 1, z, z + 1, stucco.base);
      }
    }

    for (const z of [BENCH.north, BENCH.south]) {
      box(BENCH.x, BENCH.x1, PLANK, PLANK, z, z + 1, teak.base);
    }

    box(TABLE.x, TABLE.x1, TOP, TOP, TABLE.z, TABLE.z1, stone.light);

    // Low and wide: a standard pot stands taller than the table and turns the ends into towers.
    for (const x of [1, 28]) {
      box(x, x + 2, GROUND, GROUND, 6, 8, terracotta.shade);
      box(x, x + 2, GROUND + 1, GROUND + 1, 6, 8, terracotta.base);
      box(x, x + 2, GROUND + 2, GROUND + 2, 6, 8, foliage.base);
      // A cross rather than a cube on top, so the shrub reads round.
      box(x, x + 2, GROUND + 3, GROUND + 3, 7, 7, foliage.base);
      box(x + 1, x + 1, GROUND + 3, GROUND + 3, 6, 8, foliage.base);
    }
  },
});
