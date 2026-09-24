// The slab is two layers to match PAVING_VOXELS, so there is no step up from the paving beside it.
// On the amenities shelf, not grounds: dressing grows no spur, and a table nobody can walk to is useless.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

const TOP = PLANK + 2;

const TABLE = { x: 8, x1: 23, z: 6, z1: 9 } as const;
const BENCH = { x: 7, x1: 24, north: 3, south: 11 } as const;

const LEGS = [
  [10, 11],
  [20, 21],
] as const;

// A figure is three voxels wide and centred on its column, so these are 4 apart.
const SITTERS = [9, 13, 17, 21] as const;

const NORTH_HIPS = BENCH.north + 1;
const SOUTH_HIPS = BENCH.south;

export default defineModel({
  id: 'picnic-table',
  label: 'Picnic Table',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  seats: [
    ...SITTERS.map((x) => ({ x, y: HIPS, z: NORTH_HIPS, facing: 0 as const })),
    ...SITTERS.map((x) => ({ x, y: HIPS, z: SOUTH_HIPS, facing: 2 as const })),
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { teak } = PALETTE;

    plinth(b, SLAB);

    for (const [x, x1] of LEGS) {
      box(x, x1, GROUND, TOP - 1, TABLE.z, TABLE.z1, teak.deep);
      box(x, x1, GROUND, PLANK - 1, BENCH.north, BENCH.north + 1, teak.deep);
      box(x, x1, GROUND, PLANK - 1, BENCH.south, BENCH.south + 1, teak.deep);
    }

    for (const z of [BENCH.north, BENCH.south]) {
      box(BENCH.x, BENCH.x1, PLANK, PLANK, z, z + 1, teak.base);
    }

    box(TABLE.x, TABLE.x1, TOP - 1, TOP - 1, TABLE.z + 1, TABLE.z1 - 1, teak.shade);
    box(TABLE.x, TABLE.x1, TOP, TOP, TABLE.z, TABLE.z1, teak.light);

    // A planter rather than pots: a pot stands taller than the table and would turn the ends into towers.
    for (const x of [3, 28]) {
      // Two greens: three colours on eight voxels reads as bunting.
      flowerBox(b, {
        x,
        z: 4,
        y: GROUND,
        w: 8,
        along: 'z',
        blooms: [PALETTE.foliage.base, PALETTE.foliage.light],
      });
    }
  },
});
