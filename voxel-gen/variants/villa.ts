import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { poolWater } from '../parts/pool.ts';
import { gableRoof, hipRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const MAIN = { x: 22, z: 6, w: 36, d: 22 } as const;
const MAIN_FRONT = MAIN.z + MAIN.d - 1;
const WING = { x: 42, z: MAIN_FRONT + 1, w: 16, d: 14 } as const;
const WING_FRONT = WING.z + WING.d - 1;
const RIGHT = MAIN.x + MAIN.w - 1;

const LOGGIA = { x: MAIN.x, z: MAIN_FRONT + 1, w: WING.x - MAIN.x, d: 3 } as const;
const PAVILION = { x: 4, z: 12, w: 16, d: 22 } as const;
const POOL = { x: 7, z: 38, w: 24, d: 11 } as const;

const DOOR = WING.x + 6;

// A metre of plinth, so the plunge pool has two courses of water above its floor.
const PLINTH = 4;

export default defineModel({
  id: 'villa-b',
  label: 'Villa B',
  category: 'lodging',
  tiles: { x: 4, z: 4 },
  placement: { perResort: { min: 1, max: 12 } },
  venue: {
    role: 'lodging',
    capacity: 8,
    beds: 8,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 35,
    doors: [{ x: DOOR + 2, z: WING_FRONT, facing: 0 }],
  },
  windows: WINDOW_GLASS,
  water: [PALETTE.water.base],
  build: (b: VoxelBuilder) => {
    const { bloom, foliage, grass, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 64, height: PLINTH });
    const upper = ground + STOREY_VOXELS;

    const eaves = stuccoWall(b, { ...MAIN, y: ground, storeys: 2 });
    stuccoWall(b, { ...WING, y: ground, storeys: 2 });
    const crest = gableRoof(b, { ...MAIN, y: eaves, ridge: 'x' });
    // The wing's roof starts back inside the main one, where that is already higher,
    // so the cross gable meets a slope instead of showing its back.
    const valley = MAIN.z + MAIN.d / 2 - 2;
    gableRoof(b, { ...WING, z: valley, d: WING_FRONT - valley + 1, y: eaves, ridge: 'z' });
    b.box(28, 30, eaves, crest + 2, 10, 12, stucco.base);
    b.box(27, 31, crest + 3, crest + 3, 9, 13, stone.light);

    const balcony = arcade(b, { ...LOGGIA, y: ground, along: 'x', bays: 3, pier: 2 });
    b.box(
      LOGGIA.x,
      LOGGIA.x + LOGGIA.w - 1,
      balcony - 1,
      balcony - 1,
      LOGGIA.z,
      LOGGIA.z + 3,
      stone.light,
    );
    const brink = LOGGIA.z + 3;
    balustrade(b, { x: LOGGIA.x, z: brink, y: balcony, w: LOGGIA.w, along: 'x' });
    balustrade(b, { x: LOGGIA.x, z: LOGGIA.z, y: balcony, w: 3, along: 'z' });

    doorway(b, { face: 'z+', at: MAIN_FRONT, along: 30, y: ground, w: 4 });
    for (const along of [24, 37]) {
      shutteredWindow(b, { face: 'z+', at: MAIN_FRONT, along, y: ground + 3 });
    }
    for (const along of [25, 31, 37]) {
      shutteredWindow(b, { face: 'z+', at: MAIN_FRONT, along, y: upper, w: 3, h: 8 });
    }

    doorway(b, { face: 'z+', at: WING_FRONT, along: DOOR, y: ground, w: 4 });
    for (const along of [WING.x + 2, WING.x + 12]) {
      shutteredWindow(b, { face: 'z+', at: WING_FRONT, along, y: ground + 3 });
    }
    for (const along of [WING.x + 2, WING.x + 7, WING.x + 12]) {
      shutteredWindow(b, { face: 'z+', at: WING_FRONT, along, y: upper + 3 });
    }
    for (const y of [ground + 3, upper + 3]) {
      shutteredWindow(b, { face: 'x-', at: WING.x, along: WING.z + 8, y });
      for (const along of [WING.z + 3, WING.z + 9]) {
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y });
      }
      for (const along of [MAIN.z + 4, MAIN.z + 13]) {
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y });
        shutteredWindow(b, { face: 'x-', at: MAIN.x, along, y });
      }
      for (const along of [26, 34, 42, 50]) {
        shutteredWindow(b, { face: 'z-', at: MAIN.z, along, y });
      }
    }

    // The side terrace is open on posts, so the pool deck reads as running in under it.
    const pavilionFront = PAVILION.z + PAVILION.d - 1;
    const pavilionRight = PAVILION.x + PAVILION.w - 1;
    balustrade(b, {
      x: PAVILION.x,
      z: PAVILION.z + 2,
      y: ground,
      w: PAVILION.d - 4,
      along: 'z',
    });
    for (const x of [PAVILION.x, pavilionRight - 1]) {
      for (const z of [PAVILION.z, PAVILION.z + 10, pavilionFront - 1]) {
        b.box(x, x + 1, ground, upper - 1, z, z + 1, stucco.light);
      }
    }
    b.box(PAVILION.x, pavilionRight, upper - 1, upper - 1, PAVILION.z, pavilionFront, teak.base);
    hipRoof(b, { ...PAVILION, y: upper, overhang: 1 });
    b.box(9, 14, ground, ground + 3, 20, 25, teak.shade);
    b.box(8, 15, ground + 4, ground + 4, 19, 26, teak.light);
    for (const z of [18, 27]) b.box(10, 13, ground, ground + 2, z, z, teak.base);

    poolWater(b, { ...POOL, deck: ground - 1 });

    const lounger = (x: number, z: number): void => {
      b.box(x, x + 3, ground, ground, z, z + 7, teak.shade);
      b.box(x, x + 3, ground + 1, ground + 1, z + 2, z + 7, stucco.light);
      b.box(x, x + 3, ground + 1, ground + 3, z, z + 1, stucco.light);
    };
    lounger(POOL.x + 2, POOL.z + POOL.d + 1);
    lounger(POOL.x + 8, POOL.z + POOL.d + 1);
    lounger(POOL.x + 18, POOL.z + POOL.d + 1);
    parasol(b, { x: POOL.x + 15, z: POOL.z + POOL.d + 4, y: ground, reach: 3 });

    // Lawn along the front, cut by the path to the door, is where the planting goes.
    const lawn = WING_FRONT + 3;
    b.box(40, 61, ground - 1, ground - 1, lawn, 61, grass.base);
    b.box(2, 39, ground - 1, ground - 1, 59, 61, grass.base);
    b.box(DOOR - 1, DOOR + 4, ground - 1, ground - 1, WING_FRONT + 1, 63, stone.light);
    for (const x of [DOOR - 3, DOOR + 5]) pottedPlant(b, { x, z: WING_FRONT + 1, y: ground });
    for (const [x0, x1] of [
      [3, DOOR - 3],
      [DOOR + 6, 60],
    ] as const) {
      b.box(x0, x1, ground, ground + 1, 60, 61, foliage.base);
    }
    for (let x = 41; x < DOOR - 3; x += 2) b.set(x, ground, lawn + 1, bloom.base);
    for (let x = DOOR + 7; x < 60; x += 2) b.set(x, ground, lawn + 1, bloom.base);
    b.box(56, 59, ground, ground + 2, lawn + 5, lawn + 8, foliage.base);
    b.box(57, 58, ground + 3, ground + 3, lawn + 6, lawn + 7, foliage.light);
    flowerBox(b, { x: 2, z: 36, y: ground, w: 14, along: 'x' });
  },
});
