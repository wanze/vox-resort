import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { oleander, parasol } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { plankRail, SLATS } from '../parts/veranda.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BACK = 6;
const LOGGIA = 8;

// The main block's loggias face the garden; the wing steps forward of them as the far end of the
// reference does, with a balcony of its own between two stone masses.
const MAIN = { x: 4, w: 42, rooms: 24 } as const;
const MAIN_FRONT = BACK + MAIN.rooms;
const MAIN_PIERS = [
  { x0: 4, x1: 9 },
  { x0: 24, x1: 27 },
] as const;
const MAIN_BAYS = [
  { x0: 10, x1: 23 },
  { x0: 28, x1: 41 },
] as const;

const WING = { x: 42, w: 20, rooms: 34 } as const;
const WING_FRONT = BACK + WING.rooms;
const WING_PIERS = [
  { x0: 42, x1: 47 },
  { x0: 56, x1: 61 },
] as const;
const WING_BAY = { x0: 48, x1: 55 } as const;

const DOOR_W = 4;
const ENTRANCE = MAIN_BAYS[1].x0 + 8;

// A metre of plinth, so the pool has two courses of water above its floor.
const PLINTH = 4;
const POOL = { x: 8, z: 49, w: 24, d: 8 } as const;

export default defineModel({
  id: 'villa-c',
  label: 'Villa C',
  category: 'lodging',
  tiles: { x: 4, z: 4 },
  placement: { perResort: { min: 1, max: 12 } },
  windows: WINDOW_GLASS,
  water: [PALETTE.water.base],
  venue: {
    role: 'lodging',
    capacity: 8,
    beds: 8,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 35,
    doors: [{ x: ENTRANCE + 2, z: MAIN_FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { amber, grass, sand, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 64, height: PLINTH });
    const upper = ground + STOREY_VOXELS + 1;

    const shutters = { trim: stucco, timber: LOUVRES } as const;
    const rail = { along: 'x', rail: SLATS, pitch: 64 } as const;
    const wall = { trim: stucco, wall: stucco, skirting: 1, quoins: false, storeys: 2 } as const;

    const blocks = [
      { x: MAIN.x, w: MAIN.w, front: MAIN_FRONT, piers: MAIN_PIERS, bays: MAIN_BAYS },
      { x: WING.x, w: WING.w, front: WING_FRONT, piers: WING_PIERS, bays: [WING_BAY] },
    ] as const;

    let eaves = ground;
    for (const block of blocks) {
      const brink = block.front + LOGGIA;
      const body = { x: block.x, z: BACK + 1, w: block.w, d: block.front - BACK };
      eaves = stuccoWall(b, { ...body, ...wall, y: ground });
      for (const { x0, x1 } of block.piers) {
        const stoneBox = { x: x0, z: BACK, w: x1 - x0 + 1, d: brink - BACK + 1 };
        rubble(b, { ...stoneBox, y: ground, h: eaves - ground, stone: sand });
      }

      for (const { x0, x1 } of block.bays) {
        const width = x1 - x0 + 1;
        b.box(x0, x1, ground, ground, block.front + 1, brink + 1, stucco.light);
        b.box(x0, x1, upper - 2, upper - 1, block.front + 1, brink + 1, stucco.light);
        b.box(x0, x1, eaves - 2, eaves - 1, brink, brink + 1, stucco.light);
        plankRail(b, { ...rail, x: x0, z: brink + 1, y: upper, w: width });

        const door = width > 8 ? x0 + 8 : x0 + 2;
        const front = { face: 'z+', at: block.front } as const;
        for (const y of [ground + 1, upper]) {
          doorway(b, { ...front, along: door, y, w: DOOR_W, trim: stucco, timber: LOUVRES });
          if (width > 8) {
            shutteredWindow(b, { ...shutters, ...front, along: x0 + 2, y: y + 3, w: 3 });
          }
        }
        const gate = width > 8 ? door - 1 : 0;
        if (gate > 0) plankRail(b, { ...rail, x: x0, z: brink, y: ground + 1, w: gate - x0 });
      }

      const roof = { x: block.x, z: BACK, w: block.w, d: brink + 2 - BACK + 1 };
      hipRoof(b, { ...roof, y: eaves, step: 3, gutter: teak });
    }

    for (const y of [ground + 4, upper + 3]) {
      for (const along of [BACK + 6, BACK + 16, MAIN_FRONT + 3]) {
        shutteredWindow(b, { ...shutters, face: 'x-', at: MAIN.x, along, y, w: 3 });
      }
      for (const along of [BACK + 6, BACK + 16, BACK + 26, WING_FRONT + 3]) {
        shutteredWindow(b, { ...shutters, face: 'x+', at: WING.x + WING.w - 1, along, y, w: 3 });
      }
      for (const along of [14, 32, 50]) {
        shutteredWindow(b, { ...shutters, face: 'z-', at: BACK + 1, along, y, w: 3 });
      }
    }
    b.box(
      MAIN.x - 1,
      MAIN.x - 1,
      ground,
      eaves - 2,
      MAIN_FRONT + LOGGIA + 1,
      MAIN_FRONT + LOGGIA + 1,
      teak.deep,
    );

    const garden = MAIN_FRONT + LOGGIA + 5;
    b.box(1, WING.x - 1, ground - 1, ground - 1, garden, 62, grass.base);
    b.box(WING.x, 62, ground - 1, ground - 1, WING_FRONT + LOGGIA + 5, 62, grass.base);
    b.box(
      POOL.x - 2,
      POOL.x + POOL.w + 1,
      ground - 1,
      ground - 1,
      POOL.z - 2,
      POOL.z + POOL.d + 4,
      stone.light,
    );
    poolWater(b, { ...POOL, deck: ground - 1 });
    b.box(
      ENTRANCE,
      ENTRANCE + DOOR_W - 1,
      ground - 1,
      ground - 1,
      MAIN_FRONT + LOGGIA + 2,
      63,
      stone.light,
    );

    const loungers = POOL.z + POOL.d + 1;
    for (const x of [POOL.x + 2, POOL.x + 8, POOL.x + 14]) {
      b.box(x, x + 2, ground, ground, loungers, loungers + 3, teak.base);
      b.box(x, x + 2, ground + 1, ground + 1, loungers, loungers + 3, stucco.light);
      b.box(x, x + 2, ground + 2, ground + 2, loungers + 3, loungers + 3, stucco.light);
    }
    parasol(b, { x: POOL.x + 6, z: loungers + 1, y: ground, reach: 2, canvas: amber });

    // Oleanders kept low so they hide no loggia, as in the reference.
    for (const [x, z] of [
      [46, 55],
      [55, 57],
    ] as const) {
      oleander(b, { x, z, y: ground });
    }
  },
});
