import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof, hipRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const HALL = { x: 2, z: 3, w: 40, d: 28 } as const;
const HALL_FRONT = HALL.z + HALL.d - 1;
const HALL_RIGHT = HALL.x + HALL.w - 1;
const LOGGIA = { x: HALL.x, z: HALL_FRONT + 1, w: HALL.w, d: 6 } as const;
const LOGGIA_FRONT = LOGGIA.z + LOGGIA.d - 1;

const STORE = { x: HALL_RIGHT + 1, z: 3, w: 20, d: 16 } as const;
const STORE_FRONT = STORE.z + STORE.d - 1;
const STORE_RIGHT = STORE.x + STORE.w - 1;
const SHED = {
  x0: STORE.x,
  x1: STORE_RIGHT + 1,
  z0: STORE_FRONT + 2,
  z1: LOGGIA_FRONT + 2,
} as const;

// The loggia's three bays, as `arcade` spaces them along this run.
const BAYS = [5, 17, 30] as const;
const BAY_W = 9;
const DOOR = { along: 18, w: 7, h: 8 } as const;

// The hall rises a clerestory above the loggia so the sign and the high windows read over its
// coping; at one storey the hip's eave would sit on the arches and hide them.
const CLERESTORY = 6;

// The only emissive colour: emissive splits a second geometry off every placement, costing
// a draw call and a night-bake lamp each.
const SIGN = PALETTE.amber.light;

export default defineModel({
  id: 'supermarket-b',
  label: 'Supermarket B',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  lights: [{ x: 21, y: 17, z: LOGGIA_FRONT + 2, color: SIGN, intensity: 90, distance: 50 }],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 0.8 },
      { need: 'thirst', amount: 0.8 },
    ],
    capacity: 20,
    dwellSeconds: { min: 480, max: 1200 },
    price: 4,
    doors: [{ x: DOOR.along + (DOOR.w - 1) / 2, z: HALL_FRONT, facing: 0 }],
    litter: 0.03,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, slate, stone, stucco, teak, terracotta, water } =
      PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 48 });

    const storeEaves = stuccoWall(b, { ...STORE, y: ground, storeys: 1 });
    flatRoof(b, { x: STORE.x + 1, z: STORE.z, w: STORE.w - 1, d: STORE.d, y: storeEaves });
    box(51, 55, storeEaves + 1, storeEaves + 2, 8, 12, slate.shade);
    doorway(b, { face: 'x+', at: STORE_RIGHT, along: 6, y: ground, w: 5, h: 8, timber: teak });

    const string = stuccoWall(b, { ...HALL, y: ground, storeys: 1, quoins: false });
    const cornice = string + CLERESTORY - 1;
    box(HALL.x, HALL_RIGHT, string, cornice - 1, HALL.z, HALL_FRONT, stucco.base);
    box(HALL.x, HALL_RIGHT, cornice, cornice, HALL.z, HALL_FRONT, stucco.light);
    hipRoof(b, { ...HALL, y: cornice + 1 });

    const coping = arcade(b, {
      ...LOGGIA,
      y: ground,
      along: 'x',
      bays: 3,
      height: 8,
      rise: 2,
      skirting: 0,
    });
    if (coping !== string - 1) throw new Error('The loggia must top out at the hall string course');
    box(LOGGIA.x - 1, HALL_RIGHT + 1, coping, coping, LOGGIA.z, LOGGIA_FRONT, terracotta.shade);
    const rim = LOGGIA_FRONT + 1;
    box(LOGGIA.x - 1, HALL_RIGHT + 1, coping, coping, rim, rim, stone.light);

    doorway(b, {
      face: 'z+',
      at: HALL_FRONT,
      along: DOOR.along,
      y: ground,
      w: DOOR.w,
      h: DOOR.h,
      timber: glass,
    });
    // The loggia is the reveal, so the glazing lies flush in its back wall: sills and lintels
    // behind the arches would be hidden by the piers and double what a pane costs.
    for (const along of [BAYS[0], BAYS[2]]) {
      box(along, along + BAY_W - 1, ground, ground + 7, HALL_FRONT, HALL_FRONT, glass.base);
    }

    const high = string + 1;
    for (const along of [5, 31]) {
      shutteredWindow(b, {
        face: 'z+',
        at: HALL_FRONT,
        along,
        y: high,
        w: 8,
        h: 3,
        shutters: false,
      });
    }
    shutteredWindow(b, {
      face: 'x-',
      at: HALL.x,
      along: 11,
      y: ground + 3,
      w: 10,
      h: 6,
      shutters: false,
    });
    doorway(b, { face: 'z-', at: HALL.z, along: 10, y: ground, w: 5, h: 8, timber: teak });

    const board = HALL_FRONT + 1;
    box(15, 28, string, cornice - 1, board, board, metal.base);
    box(16, 27, string + 1, cornice - 2, board, board, SIGN);

    // A lean-to off the store, one course a step so it falls to the street as the hip does.
    const COURSES = [
      [SHED.z0, SHED.z0 + 5, storeEaves - 1],
      [SHED.z0 + 6, SHED.z0 + 11, storeEaves - 2],
      [SHED.z0 + 12, SHED.z1, storeEaves - 3],
    ] as const;
    for (const [i, [z0, z1, y]] of COURSES.entries()) {
      const tone = i === COURSES.length - 1 ? terracotta.deep : terracotta.base;
      box(SHED.x0, SHED.x1, y, y, z0, z1, tone);
    }
    for (const x of [51, STORE_RIGHT - 1]) {
      box(x, x + 1, ground, storeEaves - 4, LOGGIA_FRONT - 1, LOGGIA_FRONT, teak.shade);
    }

    // Fruit in long runs per colour, not crate by crate: each crate is ten quads of its own.
    const FRUIT = [bloom.base, amber.base, foliage.base] as const;
    const TABLE = { x: 48, z: 30 } as const;
    box(TABLE.x, TABLE.x + 11, ground, ground + 3, TABLE.z, TABLE.z + 3, teak.shade);
    for (const [i, fruit] of FRUIT.entries()) {
      const x = TABLE.x + i * 4;
      box(x, x + 3, ground + 4, ground + 4, TABLE.z, TABLE.z + 3, fruit);
    }

    const CABINET = { x: STORE.x + 2, z: STORE_FRONT + 4 } as const;
    box(CABINET.x, CABINET.x + 4, ground, ground + 7, CABINET.z - 3, CABINET.z, stone.light);
    box(CABINET.x + 1, CABINET.x + 3, ground + 1, ground + 6, CABINET.z, CABINET.z, glass.deep);
    for (const y of [ground + 2, ground + 4]) {
      box(CABINET.x + 1, CABINET.x + 3, y, y, CABINET.z, CABINET.z, water.base);
    }

    box(DOOR.along - 1, DOOR.along + DOOR.w, ground - 1, ground - 1, LOGGIA.z, 47, stone.light);
    for (const x of [DOOR.along - 5, DOOR.along + DOOR.w + 2]) {
      pottedPlant(b, { x, z: LOGGIA_FRONT + 2, y: ground, size: 3 });
    }
    for (const [x, w] of [
      [3, 11],
      [29, 12],
    ] as const) {
      flowerBox(b, { x, z: 45, y: ground, w, along: 'x', blooms: [bloom.base] });
    }
    flowerBox(b, { x: 47, z: 44, y: ground, w: 14, along: 'x', blooms: [foliage.base] });
  },
});
