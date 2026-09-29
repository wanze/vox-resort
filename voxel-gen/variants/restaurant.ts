import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof, hipRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// The hall runs into the wing, so the wing's walls and roof are drawn over its end.
const HALL = { x: 3, z: 3, w: 42, d: 16 } as const;
const WING = { x: 43, z: 3, w: 18, d: 31 } as const;
const HALL_FRONT = HALL.z + HALL.d - 1;
const WING_FRONT = WING.z + WING.d - 1;
const WING_LEFT = WING.x;
const WING_RIGHT = WING.x + WING.w - 1;

// The terrace chairs are declared against this; `build` checks it matches `plinth`.
const GROUND = 3;

const TERRACE = { x0: 1, x1: WING_LEFT - 1, z0: HALL_FRONT + 1, z1: 45 } as const;
const PERGOLA = { z1: 30, piers: [3, 14, 25, 36] } as const;
const GAP = { x0: 12, x1: 17 } as const;
const DOOR = 50;

// Only the table under the pergola sits by the west edge: further in, a chair is a
// whole tile from any paving and the walk network drops it.
const TABLES = [
  [7, 22],
  [6, 37],
  [20, 37],
  [33, 37],
] as const;
const SHADED = TABLES.slice(1);

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'restaurant-b',
  label: 'Restaurant B',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  seats: TABLES.flatMap(
    ([x, z]) =>
      [
        { x: x - 1, y: GROUND + 2, z: z + 1, facing: 1 },
        { x: x + 4, y: GROUND + 2, z: z + 1, facing: 3 },
      ] as const,
  ),
  windows: WINDOW_GLASS,
  lights: [
    // Under the joists, since vines on top would shade a lamp hung above them.
    { x: 20, y: GROUND + 8, z: 25, color: LANTERN, intensity: 90, distance: 50 },
    // Two courses clear of the canvas, or the lamp grazes the parasols, not the paving.
    { x: 21, y: GROUND + 10, z: 39, color: LANTERN, intensity: 90, distance: 56 },
  ],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 1 },
      { need: 'thirst', amount: 0.5 },
    ],
    capacity: 40,
    dwellSeconds: { min: 1800, max: 3600 },
    price: 8,
    doors: [{ x: DOOR + 1, z: WING_FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, grass, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 48 });
    if (ground !== GROUND) throw new Error('The plinth and the chairs must agree on its surface');

    const { x0, x1, z0, z1 } = TERRACE;
    box(x0 + 1, x1, ground - 1, ground - 1, z0, z1 - 1, terracotta.shade);

    const eaves = stuccoWall(b, { ...HALL, y: ground, storeys: 1 });
    stuccoWall(b, { ...WING, y: ground, storeys: 1 });
    const crest = hipRoof(b, { ...HALL, y: eaves });
    gableRoof(b, { ...WING, y: eaves, ridge: 'z' });

    // A stucco pediment on the verge: stepped tile ends alone read as the back of a roof.
    const verge = WING_FRONT + 2;
    for (let course = 1; WING_LEFT + 2 * course < WING_RIGHT - 2 * course; course++) {
      const y = eaves + course;
      box(WING_LEFT + 2 * course, WING_RIGHT - 2 * course, y, y, verge, verge, stucco.base);
    }
    box(DOOR + 1, DOOR + 2, eaves + 2, eaves + 3, verge, verge, teak.deep);

    // The kitchen flue, set back where the hip hides its foot from the terrace.
    box(9, 11, eaves, crest + 2, 8, 10, stucco.base);
    box(8, 12, crest + 3, crest + 3, 7, 11, stone.light);
    b.set(10, crest + 3, 9, teak.deep);

    for (const along of [5, 10]) {
      shutteredWindow(b, { face: 'z+', at: HALL_FRONT, along, y: ground + 4 });
    }
    doorway(b, { face: 'z+', at: HALL_FRONT, along: 15, y: ground });
    shutteredWindow(b, {
      face: 'z+',
      at: HALL_FRONT,
      along: 24,
      y: ground + 5,
      w: 12,
      h: 4,
      shutters: false,
    });
    for (const along of [6, 13]) {
      shutteredWindow(b, { face: 'x-', at: HALL.x, along, y: ground + 4 });
    }
    for (const along of [8, 18, 28, 38]) {
      shutteredWindow(b, { face: 'z-', at: HALL.z, along, y: ground + 4 });
    }
    doorway(b, { face: 'z-', at: WING.z, along: 50, y: ground });
    for (const along of [8, 17, 26]) {
      shutteredWindow(b, { face: 'x+', at: WING_RIGHT, along, y: ground + 4 });
    }

    doorway(b, { face: 'z+', at: WING_FRONT, along: DOOR, y: ground });
    for (const along of [45, 56]) {
      shutteredWindow(b, { face: 'z+', at: WING_FRONT, along, y: ground + 4, h: 6 });
    }
    awning(b, { face: 'z+', at: WING_FRONT, along: DOOR - 2, w: 8, y: ground + 11 });
    doorway(b, { face: 'x-', at: WING_LEFT, along: 26, y: ground });
    shutteredWindow(b, { face: 'x-', at: WING_LEFT, along: 21, y: ground + 4 });

    const beam = ground + 9;
    for (const x of PERGOLA.piers) {
      box(x, x + 1, ground, beam - 2, PERGOLA.z1 - 1, PERGOLA.z1, stucco.light);
      box(x, x + 1, beam - 1, beam - 1, PERGOLA.z1 - 1, PERGOLA.z1, stone.light);
    }
    box(PERGOLA.piers[0], x1, beam, beam, PERGOLA.z1 - 1, PERGOLA.z1, teak.base);
    for (let x = PERGOLA.piers[0]; x <= x1; x += 4) {
      box(x, x, beam + 1, beam + 1, z0, PERGOLA.z1 + 1, teak.shade);
    }
    // Trained along the beam and out along a few joists, never a full cover: a vine
    // laid on as a slab reads as a green roof.
    for (const [vx0, vx1, vz0, vz1] of [
      [2, 21, 28, 31],
      [27, 41, 28, 31],
      [6, 8, 21, 27],
      [15, 20, 24, 27],
      [34, 36, 20, 27],
    ] as const) {
      box(vx0, vx1, beam + 2, beam + 2, vz0, vz1, foliage.base);
    }
    for (const [vx0, vx1] of [
      [5, 7],
      [17, 18],
      [31, 33],
    ] as const) {
      box(vx0, vx1, beam - 1, beam + 1, PERGOLA.z1 + 1, PERGOLA.z1 + 1, foliage.base);
    }
    box(PERGOLA.piers[0] - 1, PERGOLA.piers[0] - 1, ground + 3, beam, 27, 30, foliage.base);

    const lantern = (x: number, y: number, z: number): void => {
      box(x, x, y, y + 1, z, z, LANTERN);
      b.set(x, y + 2, z, teak.shade);
    };
    for (const x of [19, 30]) lantern(x, beam - 3, PERGOLA.z1);
    for (const x of [DOOR - 1, DOOR + 4]) lantern(x, ground + 6, WING_FRONT + 1);
    lantern(WING_LEFT - 1, ground + 6, 25);

    box(21, 38, ground, ground + 3, z0, z0 + 1, teak.shade);
    box(21, 38, ground + 4, ground + 4, z0, z0 + 2, stone.light);
    for (const [x, jug] of [
      [23, glass.light],
      [29, bloom.light],
      [34, glass.light],
    ] as const) {
      b.set(x, ground + 5, z0 + 1, jug);
    }

    const table = (x: number, z: number): void => {
      box(x + 1, x + 2, ground, ground + 2, z + 1, z + 2, teak.shade);
      box(x, x + 3, ground + 3, ground + 3, z, z + 3, teak.light);
      for (const [seat, back] of [
        [x - 2, x - 2],
        [x + 4, x + 5],
      ] as const) {
        box(seat, seat + 1, ground, ground + 1, z + 1, z + 2, teak.base);
        box(back, back, ground + 2, ground + 3, z + 1, z + 2, teak.base);
      }
    };
    for (const [x, z] of TABLES) table(x, z);
    for (const [x, z] of SHADED) {
      parasol(b, { x: x + 1, z: z + 1, y: ground, reach: 3, canvas: stucco });
    }

    // Stucco, not balusters: a solid wall merges to a few quads on a model placed often.
    const parapet = (px0: number, px1: number, pz0: number, pz1: number): void => {
      box(px0, px1, ground, ground + 2, pz0, pz1, stucco.base);
      box(px0, px1, ground + 3, ground + 3, pz0, pz1, stone.light);
    };
    parapet(x0, GAP.x0 - 1, z1, z1);
    parapet(GAP.x1 + 1, x1, z1, z1);
    parapet(x1, x1, WING_FRONT + 1, z1 - 1);
    box(x0, x0 + 1, ground, ground + 1, z0, z1 - 1, stucco.base);
    box(x0, x0 + 1, ground + 2, ground + 3, z0 + 1, z1 - 2, foliage.base);

    box(GAP.x0, GAP.x1, ground - 1, ground - 1, z1, z1, terracotta.shade);
    for (let x = GAP.x0; x <= GAP.x1; x++) {
      for (let z = z1 + 1; z <= 47; z++) b.del(x, ground - 1, z);
    }
    for (const x of [GAP.x0 - 2, GAP.x1 + 1]) pottedPlant(b, { x, z: z1 - 2, y: ground });
    pottedPlant(b, { x: x1 - 3, z: z1 - 3, y: ground });

    box(DOOR - 1, DOOR + 4, ground - 1, ground - 1, WING_FRONT + 1, 46, stone.light);
    for (const [lx0, lx1] of [
      [WING_LEFT, DOOR - 3],
      [DOOR + 6, 62],
    ] as const) {
      box(lx0, lx1, ground - 1, ground - 1, WING_FRONT + 5, 46, grass.base);
      box(lx0, lx1, ground, ground + 1, 45, 46, foliage.base);
      flowerBox(b, { x: lx0 + 1, z: WING_FRONT + 6, y: ground, w: lx1 - lx0 - 1, along: 'x' });
    }
    for (const x of [DOOR - 3, DOOR + 5]) pottedPlant(b, { x, z: WING_FRONT + 2, y: ground });

    box(61, 62, ground, ground + 2, WING.z + 2, WING_FRONT - 2, foliage.base);
    flowerBox(b, { x: 4, z: 1, y: ground, w: 36, along: 'x' });
    for (const [x, z] of [
      [46, 1],
      [56, 1],
    ] as const) {
      box(x, x + 1, ground, ground + 2, z, z + 1, teak.base);
    }
  },
});
