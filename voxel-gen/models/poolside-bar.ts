import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 31;
const Z = 31;

const FLOOR = 3;

const BAR = { x: 6, z: 4, w: 20, d: 10 } as const;

const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

const STOOLS = [8, 13, 18, 23] as const;

// The inner side: a stool on the outer side would stand off the paving.
const tableStool = (x: number): number => (x < X / 2 ? x + 4 : x - 5);

const TABLES = [
  [5, 27],
  [26, 27],
] as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'poolside-bar',
  label: 'Poolside Bar',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...TABLES.map(
      ([x, z]) =>
        ({
          x: tableStool(x),
          y: FLOOR + 3,
          z: z - 1,
          facing: tableStool(x) > x ? 3 : 1,
        }) as const,
    ),
  ],
  lights: [{ x: 15, y: 12, z: 14, color: LANTERN, intensity: 100, distance: 52 }],
  venue: {
    shelter: 'open',
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.2 },
    ],
    capacity: 12,
    dwellSeconds: { min: 600, max: 1800 },
    doors: [{ x: 15, z: COUNTER, facing: 0 }],
    litter: 0.02,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, stucco, teak } = PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    if (floor !== FLOOR) throw new Error('The terrace and its stools must agree on its surface');
    const deck = floor - 1;

    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, 1, COUNTER + 6, teak.light);

    const wall = floor + 8;
    box(BAR.x, BAR.x + BAR.w - 1, floor, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, floor + 4, floor + 4, BAR.z + 2, BAR.z + 2, teak.shade);

    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 6; bottle++) {
      const x = BAR.x + 3 + bottle * 3;
      box(x, x, floor + 5, floor + 6, BAR.z + 2, BAR.z + 2, BOTTLES[bottle % BOTTLES.length]!);
    }

    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, BAR.x + BAR.w - 1, floor + 4, floor + 4, COUNTER, COUNTER + 1, stone.light);

    const stool = (x: number, z: number): void => {
      box(x, x + 1, floor, floor + 1, z, z + 1, teak.deep);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, amber.base);
    };
    for (const x of STOOLS) stool(x, COUNTER + 3);

    const eaves = floor + 12;
    for (const x of [BAR.x, BAR.x + BAR.w - 1]) {
      for (const z of [BAR.z, BAR.z + BAR.d - 1]) box(x, x, floor, eaves - 1, z, z, teak.base);
    }
    thatchRoof(b, { ...BAR, y: eaves, ridge: 'x', overhang: EAVE_OVERHANG });

    for (const x of [BAR.x + 4, BAR.x + 15]) {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    }

    for (const [x, z] of TABLES) {
      box(x - 1, x + 1, floor, floor + 3, z - 1, z + 1, teak.shade);
      box(x - 2, x + 2, floor + 4, floor + 4, z - 2, z + 2, stone.light);
      parasol(b, { x, z, y: floor });
      stool(tableStool(x), z - 1);
    }

    // One green rather than three: three alternating voxel by voxel reads as bunting.
    for (const x of [0, X - 1]) {
      pottedPlant(b, { x, z: COUNTER + 3, y: floor });
      pottedPlant(b, { x, z: Z - 1, y: floor });
    }
    for (const x of [0, X]) {
      flowerBox(b, { x, z: 19, y: floor, w: 10, along: 'z', blooms: [foliage.base] });
    }
  },
});
