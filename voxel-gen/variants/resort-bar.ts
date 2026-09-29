import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 47;
const Z = 31;

// Written down because the seats are declared against it; `build` checks the two agree.
const FLOOR = 3;

const BAR = { x: 4, z: 2, w: 40, d: 10 } as const;
const BACK = { z0: BAR.z, z1: BAR.z + 3, top: FLOOR + 13 } as const;
const NICHE = { x0: 6, x1: 41, y0: FLOOR + 4, y1: FLOOR + 10 } as const;
const COUNTER = BAR.z + BAR.d - 2;

const STOOLS = [6, 12, 18, 24, 30, 36, 42] as const;

const TABLES = [
  [7, 27],
  [23, 27],
  [40, 27],
] as const;

// Slats with gaps rather than a roof: the counter shows through from above, and a bar that
// closes in the rain has no reason to look covered.
const PERGOLA = { y: FLOOR + 13, front: COUNTER + 4, posts: [2, 44] as const } as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'resort-bar-b',
  label: 'Resort Bar B',
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
    price: 4,
    doors: [{ x: 23, z: COUNTER, facing: 0 }],
    litter: 0.015,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, stone, stucco, teak, terracotta } = PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    if (floor !== FLOOR) throw new Error('The deck and its stools must agree on its surface');
    box(1, X - 1, floor - 1, floor - 1, 1, Z - 1, teak.light);

    const bx1 = BAR.x + BAR.w - 1;
    box(BAR.x, bx1, floor, BACK.top, BACK.z0, BACK.z1, stucco.base);
    box(BAR.x, bx1, floor, floor + 1, BACK.z0, BACK.z1, stone.base);
    gableRoof(b, {
      x: BAR.x,
      z: BACK.z0,
      w: BAR.w,
      d: BACK.z1 - BACK.z0 + 1,
      y: BACK.top + 1,
      ridge: 'x',
      overhang: 1,
      tile: terracotta,
    });

    // The bottles stand in a niche cut into the back wall, lit from the bar side.
    for (let x = NICHE.x0; x <= NICHE.x1; x++) {
      for (let y = NICHE.y0; y <= NICHE.y1; y++) b.del(x, y, BACK.z1);
    }
    box(NICHE.x0, NICHE.x1, NICHE.y0, NICHE.y1, BACK.z1 - 1, BACK.z1 - 1, teak.shade);
    const BOTTLES = [foliage.light, amber.base, bloom.base, glass.light] as const;
    for (const shelf of [NICHE.y0, NICHE.y0 + 3]) {
      box(NICHE.x0, NICHE.x1, shelf, shelf, BACK.z1, BACK.z1, teak.light);
      for (let x = NICHE.x0 + 1, n = 0; x < NICHE.x1; x += 2, n++) {
        const tall = n % 3 === 0 ? 2 : 1;
        b.box(x, x, shelf + 1, shelf + tall, BACK.z1, BACK.z1, BOTTLES[(n + shelf) % 4]!);
      }
    }
    box(NICHE.x0, NICHE.x1, NICHE.y1 + 1, NICHE.y1 + 1, BACK.z1, BACK.z1 + 1, stone.light);

    box(BAR.x, bx1, floor, floor + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, bx1, floor + 1, floor + 1, COUNTER + 1, COUNTER + 1, teak.deep);
    box(BAR.x - 1, bx1 + 1, floor + 4, floor + 4, COUNTER, COUNTER + 1, stone.light);
    for (const [x, drink] of [
      [9, bloom.light],
      [20, amber.light],
      [31, foliage.light],
      [38, glass.light],
    ] as const) {
      b.set(x, floor + 5, COUNTER, drink);
    }

    const stool = (x: number, z: number): void => {
      box(x, x + 1, floor, floor + 1, z, z + 1, teak.deep);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, bloom.base);
    };
    for (const x of STOOLS) stool(x, COUNTER + 3);

    for (const x of PERGOLA.posts) {
      box(x, x + 1, floor, PERGOLA.y - 1, PERGOLA.front - 1, PERGOLA.front, teak.shade);
    }
    box(1, X - 1, PERGOLA.y, PERGOLA.y, PERGOLA.front - 1, PERGOLA.front, teak.shade);
    for (let x = 2; x <= X - 2; x += 3) {
      box(x, x, PERGOLA.y + 1, PERGOLA.y + 1, BACK.z1 + 2, PERGOLA.front + 1, teak.base);
    }
    // Vine only along some slats, so it reads as growing rather than as a second roof.
    for (let x = 2, n = 0; x <= X - 2; x += 3, n++) {
      const z0 = BACK.z1 + 3 + ((n * 5) % 4);
      if (n % 4 !== 3) box(x, x, PERGOLA.y + 2, PERGOLA.y + 2, z0, z0 + 4 + (n % 3), foliage.base);
    }

    const cord = PERGOLA.front + 1;
    box(2, X - 2, PERGOLA.y - 1, PERGOLA.y - 1, cord, cord, teak.deep);
    for (let x = 3; x < X - 2; x += 3) b.set(x, PERGOLA.y - 2, cord, LANTERN);

    for (const [x, z] of TABLES) {
      box(x - 1, x + 1, floor, floor + 3, z - 1, z + 1, teak.shade);
      box(x - 2, x + 2, floor + 4, floor + 4, z - 2, z + 2, teak.light);
      parasol(b, { x, z, y: floor, canvas: stucco });
      for (const at of [x - 5, x + 4]) stool(at, z - 1);
    }

    for (const x of [0, X - 1]) pottedPlant(b, { x, z: COUNTER + 3, y: floor });
    for (const x of [0, X]) {
      flowerBox(b, { x, z: 17, y: floor, w: 12, along: 'z', blooms: [foliage.base, bloom.base] });
    }
  },
});
