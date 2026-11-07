import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { picnicTable, pottedPlant } from '../parts/props.ts';
import { leanTo } from '../parts/roof.ts';
import { shutteredWindow } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 47;
const Z = 31;

// Written down because the seats are declared against it; `build` checks the two agree.
const FLOOR = 3;

// A boathouse: a clapboard store at the back, its tin roof running on over the bar.
const SHACK = { x0: 4, x1: 43, z0: 2, z1: 6 } as const;
const ROOF = { x: 2, z: 1, w: 44, d: 11, fall: 3, y: FLOOR + 15 } as const;
const HATCH = { along: 7, w: 34, y: FLOOR + 4, h: 5 } as const;
const COUNTER = 10;

const STOOLS = [6, 12, 18, 24, 30, 36, 42] as const;

const TABLE_Z = 20;
const TABLES = [3, 19, 35] as const;
const BENCH_SEATS = TABLES.flatMap((x) =>
  [x + 2, x + 6].flatMap(
    (at) =>
      [
        { x: at, y: FLOOR + 2, z: TABLE_Z, facing: 0 },
        { x: at, y: FLOOR + 2, z: TABLE_Z + 4, facing: 2 },
      ] as const,
  ),
);

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'resort-bar-c',
  label: 'Resort Bar C',
  category: 'amenities',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: FLOOR + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...BENCH_SEATS,
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
    capacity: 14,
    dwellSeconds: { min: 900, max: 2400 },
    price: 4,
    doors: [{ x: 23, z: COUNTER, facing: 0 }],
    litter: 0.015,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, sand, slate, stone, stucco, teak, water } =
      PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    if (floor !== FLOOR) throw new Error('The deck and its stools must agree on its surface');
    box(1, X - 1, floor - 1, floor - 1, 1, Z - 1, sand.light);
    box(ROOF.x, ROOF.x + ROOF.w - 1, floor - 1, floor - 1, 1, COUNTER + 5, teak.light);

    // Courses alternate two blues: each is its own plane, so the clapboard costs a quad a course.
    const roofAt = (z: number): number => ROOF.y - Math.floor((z - ROOF.z) / ROOF.fall);
    for (let z = SHACK.z0; z <= SHACK.z1; z++) {
      for (let y = floor; y < roofAt(z); y++) {
        const course = y < floor + 2 ? stone.shade : (y - floor) % 2 ? water.shade : water.deep;
        box(SHACK.x0, SHACK.x1, y, y, z, z, course);
      }
    }
    for (const x of [SHACK.x0, SHACK.x1]) {
      for (const z of [SHACK.z0, SHACK.z1]) box(x, x, floor + 2, roofAt(z) - 1, z, z, stucco.light);
    }
    const lip = leanTo(b, { ...ROOF, sheet: slate });

    shutteredWindow(b, {
      face: 'z+',
      at: SHACK.z1,
      along: HATCH.along,
      y: HATCH.y,
      w: HATCH.w,
      h: HATCH.h,
      glass: metal,
      trim: stucco,
      shutters: false,
    });
    const BOTTLES = [foliage.light, amber.base, bloom.base, glass.light] as const;
    for (let x = HATCH.along + 1, n = 0; x < HATCH.along + HATCH.w - 1; x += 2, n++) {
      const tall = n % 3 === 0 ? 2 : 1;
      box(x, x, HATCH.y + 1, HATCH.y + tall, SHACK.z1 - 1, SHACK.z1 - 1, BOTTLES[n % 4]!);
    }
    box(
      HATCH.along,
      HATCH.along + HATCH.w - 1,
      HATCH.y,
      HATCH.y,
      SHACK.z1 - 1,
      SHACK.z1 - 1,
      teak.light,
    );

    // A lifebuoy on the gable end, where the camera meets the shack first.
    const buoy = { y: floor + 6, z: SHACK.z0 } as const;
    for (let dy = 0; dy < 5; dy++) {
      for (let dz = 0; dz < 5; dz++) {
        const edge = dy === 0 || dy === 4 || dz === 0 || dz === 4;
        const corner = (dy === 0 || dy === 4) && (dz === 0 || dz === 4);
        if (!edge || corner) continue;
        const band = dy === 0 || dy === 4 ? bloom.base : stucco.light;
        b.set(SHACK.x0 - 1, buoy.y + dy, buoy.z + dz, band);
      }
    }

    box(SHACK.x0, SHACK.x1, floor, floor + 3, COUNTER, COUNTER + 1, teak.shade);
    box(SHACK.x0, SHACK.x1, floor + 1, floor + 1, COUNTER + 1, COUNTER + 1, teak.deep);
    box(SHACK.x0 - 1, SHACK.x1 + 1, floor + 4, floor + 4, COUNTER, COUNTER + 1, teak.light);
    for (const [x, drink] of [
      [9, bloom.light],
      [20, amber.light],
      [31, foliage.light],
      [38, glass.light],
    ] as const) {
      b.set(x, floor + 5, COUNTER, drink);
    }

    const stool = (x: number, z: number): void => {
      box(x, x + 1, floor, floor + 1, z, z + 1, teak.shade);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, water.shade);
    };
    for (const x of STOOLS) stool(x, COUNTER + 3);

    const front = ROOF.z + ROOF.d - 1;
    for (const x of [ROOF.x + 1, ROOF.x + ROOF.w - 2]) {
      box(x, x, floor, lip - 1, front, front, teak.shade);
    }
    for (let x = ROOF.x + 3; x < ROOF.x + ROOF.w - 2; x += 4) b.set(x, lip - 1, front, LANTERN);

    for (const x of TABLES) picnicTable(b, { x, z: TABLE_Z, y: floor });

    // Rope strung between posts along the front, broken for the way in.
    for (const [x0, x1] of [
      [1, 18],
      [29, X - 1],
    ] as const) {
      for (let x = x0; x <= x1; x += 6) box(x, x, floor, floor + 3, Z - 1, Z - 1, teak.base);
      box(x0, x1, floor + 2, floor + 2, Z - 1, Z - 1, sand.shade);
    }

    for (const z of [14, 18]) {
      box(X - 3, X - 1, floor, floor + 3, z, z + 2, teak.base);
      box(X - 3, X - 1, floor + 1, floor + 1, z, z + 2, metal.base);
    }
    pottedPlant(b, { x: 0, z: 13, y: floor, size: 2 });
    pottedPlant(b, { x: 0, z: 26, y: floor, size: 2 });
  },
});
