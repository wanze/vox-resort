import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = 32;

const BODY = { x: 3, z: 3, w: 20, d: 16 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;

const GROUND = 3;

const DISPLAY = { along: 13, w: 8, h: 6 } as const;
const OVEN = { x0: 24, x1: 30, z0: 4, z1: 12 } as const;

const TABLES = [19, 26] as const;
const TOP = 23;
const near = TOP - 3;
const far = TOP + 5;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'bakery-b',
  label: 'Bakery B',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: [{ x: 11, y: GROUND + 7, z: FRONT + 2, color: LANTERN, intensity: 60, distance: 36 }],
  seats: TABLES.flatMap((x) => [
    { x, y: GROUND + 2, z: near, facing: 0 as const },
    { x, y: GROUND + 2, z: far, facing: 2 as const },
  ]),
  venue: {
    role: 'food',
    satisfies: [{ need: 'hunger', amount: 0.5 }],
    capacity: 8,
    dwellSeconds: { min: 240, max: 480 },
    price: 3,
    doors: [{ x: 8, z: FRONT, facing: 0 }],
    litter: 0.035,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, foliage, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    if (ground !== GROUND) throw new Error('The terrace and its chairs must agree on its surface');
    box(1, PLOT - 2, ground - 1, ground - 1, FRONT + 1, PLOT - 2, stone.shade);

    // The baker lives over the shop: a second storey is what sets this apart from a kiosk.
    const upper = ground + STOREY_VOXELS;
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 2 });
    hipRoof(b, { ...BODY, y: eaves });

    doorway(b, { face: 'z+', at: FRONT, along: 6, y: ground, w: 4, h: 9, timber: PALETTE.glass });
    steps(b, { x: 5, z: FRONT + 1, w: 6, y: ground, treads: 1, descends: 'z+' });
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: DISPLAY.along,
      y: ground + 2,
      w: DISPLAY.w,
      h: DISPLAY.h,
      shutters: false,
    });
    for (let x = DISPLAY.along; x < DISPLAY.along + DISPLAY.w; x += 2) {
      box(x, x, ground + 2, ground + 3, FRONT - 1, FRONT - 1, amber.shade);
    }

    box(11, 11, ground + 6, ground + 7, FRONT + 1, FRONT + 1, LANTERN);
    b.set(11, ground + 8, FRONT + 1, teak.shade);

    for (const along of [5, 11, 17]) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: upper + 2,
        w: 3,
        h: 6,
        timber: foliage,
      });
      flowerBox(b, { x: along, z: FRONT + 1, y: upper - 1, w: 3, along: 'x' });
    }
    for (const y of [ground + 4, upper + 2]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along: 9, y, timber: foliage });
    }
    shutteredWindow(b, { face: 'z-', at: BODY.z, along: 10, y: upper + 2, timber: foliage });

    // The bread oven stands outside, domed in stone, its mouth glowing towards the terrace.
    box(OVEN.x0, OVEN.x1, ground, ground + 2, OVEN.z0, OVEN.z1, stone.shade);
    box(OVEN.x0, OVEN.x1, ground + 3, ground + 5, OVEN.z0, OVEN.z1, stone.base);
    box(OVEN.x0 + 1, OVEN.x1 - 1, ground + 6, ground + 7, OVEN.z0 + 1, OVEN.z1 - 1, stone.base);
    box(OVEN.x0 + 2, OVEN.x1 - 2, ground + 8, ground + 8, OVEN.z0 + 2, OVEN.z1 - 2, stone.light);
    for (let x = 26; x <= 28; x++) {
      for (let y = ground + 3; y <= ground + 4; y++) b.del(x, y, OVEN.z1);
    }
    b.del(27, ground + 5, OVEN.z1);
    box(26, 28, ground + 3, ground + 4, OVEN.z1 - 1, OVEN.z1 - 1, LANTERN);
    b.set(27, ground + 5, OVEN.z1 - 1, LANTERN);
    box(27, 28, ground + 9, ground + 16, 6, 7, stucco.base);
    box(26, 29, ground + 17, ground + 17, 5, 8, stone.light);
    box(OVEN.x0, OVEN.x0 + 2, ground, ground, OVEN.z1 + 2, OVEN.z1 + 4, teak.base);
    box(OVEN.x0, OVEN.x0 + 2, ground + 1, ground + 1, OVEN.z1 + 2, OVEN.z1 + 3, teak.light);

    // No parasols: a canopy on a 2x2 plot would stand over the shopfront.
    for (const x of TABLES) {
      box(x, x + 1, ground, ground + 2, TOP + 1, TOP + 2, teak.shade);
      box(x - 1, x + 2, ground + 3, ground + 3, TOP, TOP + 3, stucco.light);
      for (const [z, rail] of [
        [near, near - 1],
        [far, far + 2],
      ] as const) {
        box(x - 1, x + 1, ground, ground + 1, z, z + 1, teak.base);
        box(x - 1, x + 1, ground + 2, ground + 3, rail, rail, teak.base);
      }
    }

    box(12, 16, ground, ground + 1, FRONT + 1, FRONT + 2, teak.base);
    for (const x of [12, 14, 16]) b.set(x, ground + 2, FRONT + 1, amber.base);
    pottedPlant(b, { x: 1, z: FRONT + 3, y: ground });
    pottedPlant(b, { x: 1, z: FRONT - 2, y: ground });
  },
});
