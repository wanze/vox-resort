import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 4, z: 3, w: 56, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// Two deep: an arcade you are meant to see through reads as a tunnel when deeper.
const ARCADE = { z: 23, d: 2, bays: 5 } as const;

// Genuinely hollow: an arcade you cannot see through is a row of painted arches.
const HALL = { x: 7, x1: 56, z: 12, z1: 22 } as const;

// The terrace chairs are declared against this; `build` checks it matches `plinth`.
const GROUND = 3;

const TERRACE = { z: 27, d: 14 } as const;

const BRINK = TERRACE.z + TERRACE.d;
const APRON = { z: BRINK + 1, d: 6 } as const;

const FLIGHT = { x: 28, w: 8 } as const;

const COVERS = [9, 19, 30, 40, 51] as const;
const OUTDOORS = [COVERS[0], COVERS[1], COVERS[3], COVERS[4]] as const;

// Read back off the arcade's own layout: five bays on piers of three over a run of 56.
const PIERS = [5, 16, 26, 37, 47, 58] as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'restaurant',
  label: 'Restaurant',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  // Terrace only: an indoor chair is out of reach of any paving, so the walk network
  // would drop it.
  seats: OUTDOORS.flatMap(
    (x) =>
      [
        { x: x + 1, y: GROUND + 2, z: TERRACE.z + 6, facing: 0 },
        { x: x + 1, y: GROUND + 2, z: TERRACE.z + 11, facing: 2 },
      ] as const,
  ),
  windows: WINDOW_GLASS,
  // Two lamps: a single one in the hall leaves the terrace dark at night.
  lights: [
    { x: 32, y: 10, z: 16, color: LANTERN, intensity: 90, distance: 50 },
    // Two courses clear of the canvas: at canopy height the lamp grazes the parasols
    // instead of lighting the paving.
    { x: 32, y: 13, z: 33, color: LANTERN, intensity: 90, distance: 56 },
  ],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 1 },
      { need: 'thirst', amount: 0.5 },
    ],
    capacity: 40,
    dwellSeconds: { min: 1800, max: 3600 },
    doors: [{ x: FLIGHT.x + FLIGHT.w / 2 - 1, z: APRON.z, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: BRINK + 1 });
    if (ground !== GROUND) throw new Error('The plinth and the chairs must agree on its surface');
    const apron = plinth(b, { x: 0, z: APRON.z, w: 64, d: APRON.d, height: 2 });

    box(1, 62, ground - 1, ground - 1, TERRACE.z, BRINK, terracotta.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    // Must come out on the wall's course so that one gable covers both.
    const cornice = arcade(b, {
      x: BODY.x,
      z: ARCADE.z,
      w: BODY.w,
      d: ARCADE.d,
      y: ground,
      along: 'x',
      bays: ARCADE.bays,
      pier: 3,
      // An arch sprung lower reads as a slot on a room you are meant to see into.
      height: 9,
      rise: 2,
    });
    if (cornice !== eaves) throw new Error('The arcade and the wall must reach the same eaves');
    for (const x of [LEFT, RIGHT]) box(x, x, ground, eaves - 2, FRONT, FRONT, stucco.light);

    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    for (let x = HALL.x; x <= HALL.x1; x++) {
      for (let z = HALL.z; z <= HALL.z1; z++) {
        for (let y = ground; y <= eaves - 2; y++) b.del(x, y, z);
      }
    }
    // Pale, because a dark floor turns the arches into cave mouths.
    box(HALL.x, HALL.x1, ground - 1, ground - 1, HALL.z, HALL.z1, stone.shade);

    box(12, 50, ground, ground + 2, HALL.z, HALL.z + 2, teak.shade);
    box(12, 50, ground + 3, ground + 3, HALL.z, HALL.z + 2, stone.light);

    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 4, y: ground + 4 });
      shutteredWindow(b, {
        face,
        at,
        along: HALL.z + 1,
        y: ground + 3,
        w: 8,
        h: 7,
        shutters: false,
      });
    }
    for (const along of [10, 18, 43, 51]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }
    doorway(b, { face: 'z-', at: BODY.z, along: 30, y: ground });
    steps(b, { x: 30, z: BODY.z - 1, w: 4, y: ground, treads: 1, descends: 'z-' });

    const table = (x: number, z: number): void => {
      box(x + 1, x + 2, ground, ground + 2, z + 1, z + 2, teak.shade);
      box(x, x + 3, ground + 3, ground + 3, z, z + 3, teak.light);
      for (const seat of [z - 2, z + 4]) {
        box(x + 1, x + 2, ground, ground + 1, seat, seat + 1, teak.base);
      }
      for (const back of [z - 2, z + 5]) {
        box(x + 1, x + 2, ground + 2, ground + 3, back, back, teak.base);
      }
    };

    for (const x of COVERS) table(x, HALL.z + 5);

    for (const x of OUTDOORS) {
      table(x, TERRACE.z + 7);
      parasol(b, { x: x + 1, z: TERRACE.z + 8, y: ground });
    }

    const lantern = (x: number, y: number, z: number): void => {
      box(x, x, y, y + 1, z, z, LANTERN);
      b.set(x, y + 2, z, teak.shade);
    };

    // Lit from both sides so the hall is not a black mouth behind a lit front.
    for (const x of PIERS) {
      lantern(x, ground + 6, FRONT + 1);
      if (x > HALL.x && x < HALL.x1) lantern(x, ground + 6, HALL.z1);
    }

    // Pitch three rather than the villa's two: balusters do not merge, and this
    // building stands on the plot nine times.
    for (const x of [1, 62]) {
      balustrade(b, { x, z: TERRACE.z, y: ground, w: TERRACE.d + 1, along: 'z', pitch: 3 });
    }
    for (const [x, w] of [
      [1, FLIGHT.x - 1],
      [FLIGHT.x + FLIGHT.w, 62 - FLIGHT.x - FLIGHT.w],
    ] as const) {
      balustrade(b, { x, z: BRINK, y: ground, w, along: 'x', pitch: 3 });
    }
    steps(b, { ...FLIGHT, z: APRON.z, y: ground - 1, treads: 1, descends: 'z+' });

    for (const x of [2, 15, 48, 60]) pottedPlant(b, { x, z: BRINK - 3, y: ground });
    for (const x of [FLIGHT.x - 4, FLIGHT.x + FLIGHT.w + 1]) {
      pottedPlant(b, { x, z: APRON.z + 2, y: apron });
    }
    for (const x of [9, 37]) flowerBox(b, { x, z: BODY.z - 1, y: ground, w: 15, along: 'x' });
    for (const x of [2, 61]) {
      flowerBox(b, {
        x,
        z: BODY.z + 2,
        y: ground,
        w: 18,
        along: 'z',
        blooms: [foliage.base, foliage.light],
      });
    }
  },
});
