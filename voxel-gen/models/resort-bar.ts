import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 47;
const Z = 31;

// Written down because the seats are declared against it and a declaration cannot read a local;
// `build` checks the two still agree.
const FLOOR = 3;

const BAR = { x: 4, z: 2, w: 40, d: 10 } as const;

// The stools stand clear of the eave: from a camera 30 degrees down, everything inside the eave
// line of a roof this deep is roof.
const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

const STOOLS = [6, 12, 18, 24, 30, 36, 42] as const;

// At the front corners: a canopy 2 m up hides the line behind it at 30 degrees, so a centred
// parasol would cover the counter.
const TABLES = [
  [7, 27],
  [23, 27],
  [40, 27],
] as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'resort-bar',
  label: 'Resort Bar',
  category: 'amenities',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...TABLES.flatMap(
      ([x, z]) =>
        [
          { x: x - 5, y: FLOOR + 3, z: z - 1, facing: 1 },
          { x: x + 4, y: FLOOR + 3, z: z - 1, facing: 3 },
        ] as const,
    ),
  ],
  // Two rather than the beach club's one: one lamp on a 10 m front leaves both ends darker.
  lights: [
    { x: 15, y: 12, z: 12, color: LANTERN, intensity: 90, distance: 52 },
    { x: 33, y: 12, z: 12, color: LANTERN, intensity: 90, distance: 52 },
  ],
  venue: {
    shelter: 'open',
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.3 },
    ],
    capacity: 24,
    dwellSeconds: { min: 900, max: 2400 },
    doors: [{ x: 23, z: COUNTER, facing: 0 }],
    litter: 0.015,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, stucco, teak } = PALETTE;

    // One flat colour: tones alternating voxel by voxel are the one pattern the mesher cannot merge.
    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, stone: teak });
    if (floor !== FLOOR) throw new Error('The deck and its stools must agree on its surface');
    const deck = floor - 1;

    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, 1, COUNTER + 6, teak.light);

    const wall = floor + 8;
    box(BAR.x, BAR.x + BAR.w - 1, floor, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, floor, floor + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, floor + 4, floor + 4, BAR.z + 2, BAR.z + 2, teak.shade);

    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 12; bottle++) {
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

    const lantern = (x: number): void => {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    };
    for (const x of [5, 15, 25, 35]) lantern(BAR.x + x);

    for (const [x, z] of TABLES) {
      box(x - 1, x + 1, floor, floor + 3, z - 1, z + 1, teak.shade);
      box(x - 2, x + 2, floor + 4, floor + 4, z - 2, z + 2, stone.light);
      parasol(b, { x, z, y: floor });
      for (const at of [x - 5, x + 4]) stool(at, z - 1);
    }

    for (const x of [0, X - 1]) {
      pottedPlant(b, { x, z: COUNTER + 3, y: floor });
      pottedPlant(b, { x, z: Z - 1, y: floor });
    }
    for (const x of [0, X]) {
      flowerBox(b, { x, z: 17, y: floor, w: 12, along: 'z', blooms: [foliage.base] });
    }
  },
});
