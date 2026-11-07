import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 31;
const Z = 31;

// Written down because the seats are declared against it; `build` checks the two agree.
const FLOOR = 3;

// An island bar: an octagonal counter served from its middle, under one round canopy.
const C = { x: 16, z: 13 } as const;
const COUNTER = { reach: 7, chamfer: 3, ring: 2 } as const;
const CANOPY = { y: FLOOR + 13, reach: 9, chamfer: 4 } as const;

const FRONT_STOOLS = [13, 16, 19] as const;
const SIDE_STOOLS = [10, 13, 16] as const;
const STOOL_Z = C.z + COUNTER.reach + 1;
const STOOL_WEST = C.x - COUNTER.reach - 3;
const STOOL_EAST = C.x + COUNTER.reach + 1;

const TABLES = [
  [6, 26],
  [24, 26],
] as const;

const TABLE_SEATS = TABLES.flatMap(([x, z]) => [
  { x: x - 3, y: FLOOR + 3, z, facing: 1 } as const,
  { x: x + 4, y: FLOOR + 3, z, facing: 3 } as const,
]);

const LANTERN = PALETTE.amber.light;

// Blue tile: the shade step, since only the water's base tone is drawn as water.
const TILE = PALETTE.water.shade;

export default defineModel({
  id: 'poolside-bar-c',
  label: 'Poolside Bar C',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  emissive: [LANTERN],
  seats: [
    ...FRONT_STOOLS.map((x) => ({ x, y: FLOOR + 3, z: STOOL_Z, facing: 2 }) as const),
    ...SIDE_STOOLS.map((z) => ({ x: STOOL_WEST, y: FLOOR + 3, z, facing: 1 }) as const),
    ...SIDE_STOOLS.map((z) => ({ x: STOOL_EAST, y: FLOOR + 3, z, facing: 3 }) as const),
    ...TABLE_SEATS,
  ],
  lights: [{ x: C.x, y: FLOOR + 10, z: C.z + 2, color: LANTERN, intensity: 100, distance: 52 }],
  venue: {
    shelter: 'open',
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.2 },
    ],
    capacity: 10,
    dwellSeconds: { min: 600, max: 1800 },
    price: 3,
    doors: [{ x: C.x, z: C.z + COUNTER.reach - 1, facing: 0 }],
    litter: 0.02,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, stone, stucco } = PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    if (floor !== FLOOR) throw new Error('The terrace and its stools must agree on its surface');
    box(1, X - 1, floor - 1, floor - 1, 1, Z - 1, stucco.light);

    // An octagon: its flats merge into single rectangles, and from 30 degrees it reads as round.
    const inside = (x: number, z: number, reach: number, chamfer: number): boolean => {
      const dx = Math.abs(x + 0.5 - C.x);
      const dz = Math.abs(z + 0.5 - C.z);
      return dx <= reach && dz <= reach && dx + dz <= reach + chamfer;
    };
    const each = (paint: (x: number, z: number) => void): void => {
      for (let x = 0; x <= X; x++) {
        for (let z = 0; z <= Z; z++) paint(x, z);
      }
    };

    const top = floor + 4;
    each((x, z) => {
      if (!inside(x, z, COUNTER.reach, COUNTER.chamfer)) return;
      if (inside(x, z, COUNTER.reach - COUNTER.ring, COUNTER.chamfer)) return;
      box(x, x, floor, top - 1, z, z, TILE);
      b.set(x, floor, z, stucco.base);
      b.set(x, top, z, stucco.light);
    });

    // The back bar in the middle: a column of shelves the canopy's mast rises out of.
    const BOTTLES = [foliage.light, amber.base, bloom.base, glass.light] as const;
    box(C.x - 2, C.x + 1, floor, floor + 7, C.z - 2, C.z + 1, stucco.base);
    for (const [y, shift] of [
      [floor + 4, 0],
      [floor + 6, 1],
    ] as const) {
      box(C.x - 2, C.x + 1, y - 1, y - 1, C.z - 2, C.z + 1, stucco.light);
      for (let n = 0; n < 4; n++) {
        b.set(C.x - 2 + n, y, C.z + 1, BOTTLES[(n + shift) % 4]!);
        b.set(C.x - 2, y, C.z - 2 + n, BOTTLES[(n + shift + 2) % 4]!);
      }
    }
    box(C.x - 1, C.x, floor + 8, CANOPY.y - 1, C.z - 1, C.z, metal.light);

    for (const [x, drink] of [
      [12, bloom.light],
      [19, amber.light],
    ] as const) {
      b.set(x, top + 1, C.z + COUNTER.reach - 1, glass.light);
      b.set(x, top + 2, C.z + COUNTER.reach - 1, drink);
    }

    // A sail stretched round the mast, stepped in once so it reads as a shallow cone.
    each((x, z) => {
      if (inside(x, z, CANOPY.reach, CANOPY.chamfer)) b.set(x, CANOPY.y, z, stucco.light);
      if (inside(x, z, CANOPY.reach - 4, CANOPY.chamfer - 2))
        b.set(x, CANOPY.y + 1, z, stucco.base);
      if (inside(x, z, 2, 1)) b.set(x, CANOPY.y + 2, z, TILE);
    });
    each((x, z) => {
      const rim =
        inside(x, z, CANOPY.reach, CANOPY.chamfer) &&
        !inside(x, z, CANOPY.reach - 1, CANOPY.chamfer);
      if (rim) b.set(x, CANOPY.y - 1, z, TILE);
    });
    for (const [x, z] of [
      [C.x - 5, C.z + 6],
      [C.x + 4, C.z + 6],
      [C.x - 8, C.z],
      [C.x + 7, C.z],
    ] as const) {
      b.set(x, CANOPY.y - 1, z, metal.deep);
      b.set(x, CANOPY.y - 2, z, LANTERN);
    }

    const stool = (x: number, z: number): void => {
      box(x, x, floor, floor + 1, z, z, metal.light);
      box(x, x + 1, floor + 2, floor + 2, z, z + 1, TILE);
    };
    for (const x of FRONT_STOOLS) stool(x, STOOL_Z);
    for (const z of SIDE_STOOLS) {
      stool(STOOL_WEST, z);
      stool(STOOL_EAST, z);
    }

    for (const [x, z] of TABLES) {
      box(x, x + 1, floor, floor + 3, z, z + 1, stucco.base);
      box(x - 1, x + 2, floor + 4, floor + 4, z - 1, z + 2, stone.light);
      parasol(b, { x, z, y: floor + 5, height: 6, canvas: stucco });
    }
    for (const seat of TABLE_SEATS) stool(seat.x, seat.z);

    for (const [x, z] of [
      [1, 1],
      [29, 1],
      [1, 29],
      [29, 29],
    ] as const) {
      pottedPlant(b, { x, z, y: floor, size: 2, pot: stucco });
    }
  },
});
