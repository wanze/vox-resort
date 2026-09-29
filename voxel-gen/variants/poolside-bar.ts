import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const ROOF = { x: 4, z: 3, w: 24, d: 18 } as const;
const BACK = { x: 4, z: 3, w: 24, d: 7 } as const;
const COUNTER = { x0: 6, x1: 25, z0: 11, z1: 19 } as const;

const FLOOR = 3;
const EAVES = FLOOR + 12;

const STOOLS = [7, 11, 15, 19, 23] as const;
const STOOL_Z = COUNTER.z1 + 2;

const TABLES = [
  [7, 26],
  [23, 26],
] as const;

// One stool either side of each table, legs pointing at it.
const TABLE_SEATS = TABLES.flatMap(([x, z]) => [
  { x: x - 3, y: FLOOR + 3, z, facing: 1 } as const,
  { x: x + 4, y: FLOOR + 3, z, facing: 3 } as const,
]);

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'poolside-bar-b',
  label: 'Poolside Bar B',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: STOOL_Z, facing: 2 }) as const),
    ...TABLE_SEATS,
  ],
  lights: [
    { x: 15, y: EAVES - 2, z: COUNTER.z1 + 2, color: LANTERN, intensity: 100, distance: 52 },
  ],
  venue: {
    shelter: 'open',
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.2 },
    ],
    capacity: 12,
    dwellSeconds: { min: 600, max: 1800 },
    price: 3,
    doors: [{ x: 15, z: COUNTER.z1, facing: 0 }],
    litter: 0.02,
  },
  build: (b: VoxelBuilder) => {
    const { amber, bloom, foliage, glass, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32, height: 2 });
    b.box(1, 30, ground, ground, 1, 30, teak.light);
    const floor = ground + 1;
    if (floor !== FLOOR) throw new Error('The deck and the stools must agree on its surface');

    stuccoWall(b, { ...BACK, y: floor, storeys: 1, trim: teak, skirting: 1 });
    shutteredWindow(b, { face: 'x-', at: BACK.x, along: BACK.z + 2, y: floor + 4 });
    shutteredWindow(b, { face: 'x+', at: BACK.x + BACK.w - 1, along: BACK.z + 2, y: floor + 4 });

    const shelf = BACK.z + BACK.d;
    const BOTTLES = [foliage.base, amber.base, bloom.base, glass.light] as const;
    for (const y of [floor + 5, floor + 8]) {
      b.box(COUNTER.x0 + 1, COUNTER.x1 - 1, y - 1, y - 1, shelf, shelf, teak.shade);
      for (let bottle = 0; bottle < 6; bottle++) {
        const x = COUNTER.x0 + 2 + bottle * 3 + (y % 2);
        b.box(x, x, y, y + 1, shelf, shelf, BOTTLES[(bottle + y) % BOTTLES.length]!);
      }
    }

    // A U with its outer corners cut, which is as round as a counter this size gets.
    const top = floor + 4;
    const counterRun = (x0: number, x1: number, z0: number, z1: number): void => {
      b.box(x0, x1, floor, top - 1, z0, z1, teak.shade);
      b.box(x0, x1, top, top, z0, z1, teak.light);
    };
    counterRun(COUNTER.x0 + 1, COUNTER.x1 - 1, COUNTER.z1 - 1, COUNTER.z1);
    counterRun(COUNTER.x0, COUNTER.x0 + 1, COUNTER.z0, COUNTER.z1 - 2);
    counterRun(COUNTER.x1 - 1, COUNTER.x1, COUNTER.z0, COUNTER.z1 - 2);
    b.box(COUNTER.x0 + 2, COUNTER.x1 - 2, top, top, COUNTER.z1 + 1, COUNTER.z1 + 1, teak.light);
    b.box(COUNTER.x0 + 1, COUNTER.x1 - 1, floor, floor, COUNTER.z1 + 1, COUNTER.z1 + 1, teak.deep);

    for (const [x, drink] of [
      [10, bloom.light],
      [17, amber.light],
      [21, foliage.light],
    ] as const) {
      b.set(x, top + 1, COUNTER.z1, glass.light);
      b.set(x, top + 2, COUNTER.z1, drink);
    }
    b.box(13, 14, top + 1, top + 3, COUNTER.z1 - 1, COUNTER.z1 - 1, stucco.light);

    const stool = (x: number, z: number): void => {
      b.box(x, x, floor, floor + 1, z, z, teak.deep);
      b.box(x, x + 1, floor + 2, floor + 2, z, z + 1, teak.base);
    };
    for (const x of STOOLS) stool(x, STOOL_Z);

    const front = ROOF.z + ROOF.d - 1;
    for (const x of [ROOF.x, ROOF.x + ROOF.w - 1]) {
      b.box(x, x, floor, EAVES - 1, front, front, teak.base);
    }
    const crest = gableRoof(b, { ...ROOF, y: EAVES, ridge: 'x', tile: PALETTE.thatch });
    const ridge = ROOF.z + ROOF.d / 2;
    b.box(ROOF.x - 3, ROOF.x + ROOF.w + 2, crest, crest, ridge - 1, ridge, teak.base);

    // Bulbs on a cord under the front eave, drawn lit so the bar reads after dark.
    const cord = front + 1;
    b.box(ROOF.x, ROOF.x + ROOF.w - 1, EAVES - 1, EAVES - 1, cord, cord, teak.deep);
    for (let x = ROOF.x + 2; x < ROOF.x + ROOF.w - 1; x += 3) b.set(x, EAVES - 2, cord, LANTERN);

    // The blank board swings off the corner post, where it is seen before the bar is.
    b.box(ROOF.x - 3, ROOF.x - 1, EAVES - 2, EAVES - 2, front, front, teak.shade);
    b.box(ROOF.x - 4, ROOF.x - 1, EAVES - 7, EAVES - 3, front, front, teak.shade);
    b.box(ROOF.x - 3, ROOF.x - 2, EAVES - 6, EAVES - 4, front, front, stucco.light);

    for (const [x, z] of TABLES) {
      b.box(x, x + 1, floor, floor + 3, z, z + 1, teak.shade);
      b.box(x - 1, x + 2, floor + 4, floor + 4, z - 1, z + 2, teak.light);
    }
    for (const seat of TABLE_SEATS) stool(seat.x, seat.z);

    for (const [x, z] of [
      [1, 28],
      [29, 28],
      [1, 1],
      [29, 1],
    ] as const) {
      pottedPlant(b, { x, z, y: floor, size: 2 });
    }
  },
});
