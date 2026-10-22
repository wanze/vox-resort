import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { oleander, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// The terrace chairs are declared against this; `build` checks it matches `plinth`.
const GROUND = 3;

const BACK = 2;
const KITCHEN = { x: 10, z: BACK + 1, w: 44, d: 12 } as const;
const KITCHEN_FRONT = KITCHEN.z + KITCHEN.d - 1;
// The dining room is the loggia itself, open to the terrace between the stone piers. Kept
// shallow: under one storey of eaves, a deep one reads as a carport.
const LOGGIA = { z0: KITCHEN_FRONT + 1, z1: KITCHEN_FRONT + 8 } as const;

const PIERS = [
  { x0: 4, x1: 9, z0: BACK },
  { x0: 22, x1: 25, z0: LOGGIA.z1 - 3 },
  { x0: 38, x1: 41, z0: LOGGIA.z1 - 3 },
  { x0: 54, x1: 59, z0: BACK },
] as const;
const BAYS = [
  { x0: 10, x1: 21 },
  { x0: 26, x1: 37 },
  { x0: 42, x1: 53 },
] as const;

const TERRACE = { z0: LOGGIA.z1 + 4, z1: 38 } as const;
// A vine pergola over each half of the terrace shades the tables where the original has parasols.
const PERGOLAS = [
  { x0: 4, x1: 26 },
  { x0: 37, x1: 59 },
] as const;
const CHIMNEY = { x: 46, z: 6 } as const;
const TABLE_Z = TERRACE.z0 + 3;
const OUTDOORS = [8, 17, 42, 51] as const;
const PATH = { x0: 28, x1: 35 } as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'restaurant-c',
  label: 'Restaurant C',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  // Terrace only, as the original's: the walk network reaches chairs out on the paving.
  seats: OUTDOORS.flatMap(
    (x) =>
      [
        { x: x + 1, y: GROUND + 2, z: TABLE_Z - 1, facing: 0 },
        { x: x + 1, y: GROUND + 2, z: TABLE_Z + 4, facing: 2 },
      ] as const,
  ),
  windows: WINDOW_GLASS,
  lights: [
    { x: 32, y: 10, z: LOGGIA.z0 + 5, color: LANTERN, intensity: 90, distance: 50 },
    { x: 32, y: GROUND + 8, z: TABLE_Z + 2, color: LANTERN, intensity: 90, distance: 56 },
  ],
  venue: {
    role: 'food',
    sign: 'restaurant',
    names: [
      'The Salty Spoon',
      'Trattoria Sole',
      'Casa Marina',
      'The Driftwood Table',
      'La Terrazza',
      'Olive & Vine',
      'The Blue Shutter',
      'Osteria del Porto',
      'The Lemon Grove',
      'Taverna Kima',
      'The Fig Tree',
      'Sea Salt Kitchen',
      'Il Pescatore',
      'The Long Lunch',
    ],
    satisfies: [
      { need: 'hunger', amount: 1 },
      { need: 'thirst', amount: 0.5 },
    ],
    capacity: 32,
    dwellSeconds: { min: 1800, max: 3600 },
    price: 8,
    doors: [{ x: (PATH.x0 + PATH.x1 + 1) / 2, z: LOGGIA.z1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, grass, sand, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 48 });
    if (ground !== GROUND) throw new Error('The plinth and the chairs must agree on its surface');

    const eaves = stuccoWall(b, {
      ...KITCHEN,
      y: ground,
      storeys: 1,
      wall: stucco,
      trim: stucco,
      skirting: 1,
      quoins: false,
    });
    for (const { x0, x1, z0 } of PIERS) {
      const stoneBox = { x: x0, z: z0, w: x1 - x0 + 1, d: LOGGIA.z1 - z0 + 1 };
      rubble(b, { ...stoneBox, y: ground, h: eaves - ground, stone: sand });
    }
    const inside = { x0: PIERS[0].x1 + 1, x1: PIERS[3].x0 - 1 } as const;
    // Pale, because a dark floor turns an open front into a cave mouth.
    box(inside.x0, inside.x1, ground - 1, ground - 1, LOGGIA.z0, LOGGIA.z1, stone.light);
    box(inside.x0, inside.x1, eaves - 2, eaves - 1, LOGGIA.z1, LOGGIA.z1 + 1, stucco.light);

    const roof = {
      x: PIERS[0].x0,
      z: BACK,
      w: PIERS[3].x1 - PIERS[0].x0 + 1,
      d: LOGGIA.z1 + 2 - BACK + 1,
    };
    const ridge = hipRoof(b, { ...roof, y: eaves, step: 3, gutter: teak });
    for (const x of [PIERS[0].x0 - 1, PIERS[3].x1 + 1]) {
      box(x, x, ground, eaves - 2, LOGGIA.z1, LOGGIA.z1, teak.deep);
    }
    // The wood oven's flue, which no house has.
    const flue = { x0: CHIMNEY.x, x1: CHIMNEY.x + 3, z0: CHIMNEY.z, z1: CHIMNEY.z + 3 } as const;
    rubble(b, { x: flue.x0, z: flue.z0, w: 4, d: 4, y: eaves, h: ridge - eaves + 3, stone: sand });
    box(flue.x0 - 1, flue.x1 + 1, ridge + 3, ridge + 3, flue.z0 - 1, flue.z1 + 1, stone.light);
    box(flue.x0 + 1, flue.x1 - 1, ridge + 3, ridge + 3, flue.z0 + 1, flue.z1 - 1, teak.deep);

    const front = { face: 'z+', at: KITCHEN_FRONT, trim: stucco } as const;
    doorway(b, { ...front, along: 30, y: ground, w: 4, timber: LOUVRES });
    for (const along of [13, 46]) {
      shutteredWindow(b, { ...front, along, y: ground + 4, w: 5, h: 4, shutters: false });
    }
    // The pass from the kitchen, so the room reads as a restaurant and not a porch.
    const pass = {
      x0: BAYS[1].x0 + 1,
      x1: BAYS[1].x1 - 1,
      z0: LOGGIA.z0,
      z1: LOGGIA.z0 + 1,
    } as const;
    box(pass.x0, pass.x1, ground, ground + 2, pass.z0, pass.z1, teak.shade);
    box(pass.x0, pass.x1, ground + 3, ground + 3, pass.z0, pass.z1, stone.light);

    const louvred = { w: 3, y: ground + 4, trim: stucco, timber: LOUVRES } as const;
    for (const [face, at] of [
      ['x-', PIERS[0].x0],
      ['x+', PIERS[3].x1],
    ] as const) {
      for (const along of [BACK + 5, LOGGIA.z0 + 2]) {
        shutteredWindow(b, { ...louvred, face, at, along });
      }
    }
    for (const along of [14, 30, 46]) {
      shutteredWindow(b, { ...louvred, face: 'z-', at: KITCHEN.z, along });
    }

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
    for (const { x0 } of [BAYS[0], BAYS[2]]) {
      for (const x of [x0 + 1, x0 + 7]) table(x, LOGGIA.z0 + 2);
    }

    for (const { x0, x1 } of BAYS) {
      for (const x of [x0 + 2, x1 - 2]) {
        box(x, x, eaves - 5, eaves - 4, LOGGIA.z1 - 1, LOGGIA.z1 - 1, LANTERN);
        box(x, x, eaves - 3, eaves - 1, LOGGIA.z1 - 1, LOGGIA.z1 - 1, teak.shade);
      }
    }

    box(1, 62, ground - 1, ground - 1, roof.z + roof.d + 2, 46, grass.base);
    box(3, 60, ground - 1, ground - 1, roof.z + roof.d, TERRACE.z1, sand.base);
    box(PATH.x0, PATH.x1, ground - 1, ground - 1, LOGGIA.z1 + 1, 47, stone.light);
    for (const x of OUTDOORS) table(x, TABLE_Z);

    const beam = ground + 10;
    const span = { z0: TERRACE.z0 - 1, z1: TERRACE.z1 } as const;
    for (const { x0, x1 } of PERGOLAS) {
      for (const x of [x0, x1]) {
        for (const z of [span.z0, span.z1]) box(x, x, ground, beam - 1, z, z, teak.base);
      }
      for (const z of [span.z0, span.z1]) box(x0, x1, beam, beam, z, z, teak.shade);
      for (let x = x0; x <= x1; x += 4) box(x, x, beam + 1, beam + 1, span.z0, span.z1, teak.base);
      // Vines along the front and up one side only, so the tables still show from above.
      box(x0, x1, beam + 2, beam + 2, span.z1 - 2, span.z1, foliage.base);
      box(x0, x0 + 3, beam + 2, beam + 2, span.z0, span.z1 - 3, foliage.base);
      for (let x = x0 + 2; x < x1; x += 5) b.set(x, beam + 3, span.z1 - 1, bloom.light);
    }

    for (const x of [PATH.x0 - 4, PATH.x1 + 2]) {
      pottedPlant(b, { x, z: TERRACE.z1 + 2, y: ground, size: 3 });
    }
    for (const x of [6, 52]) oleander(b, { x, z: 40, y: ground });
  },
});
