import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const KIOSK = { x: 2, z: 1, w: 18, d: 10 } as const;
const FRONT = KIOSK.z + KIOSK.d - 1;
const RIGHT = KIOSK.x + KIOSK.w - 1;
const HATCH = { along: KIOSK.x + 2, w: KIOSK.w - 4 } as const;

// Both tones of the awning are whole courses: stripes running down the slope would be
// a quad per stripe per step, stripes across it are one plane each.
const AWNING = [PALETTE.bloom.base, PALETTE.stucco.light] as const;

export default defineModel({
  id: 'snack-bar-b',
  label: 'Snack Bar B',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'food',
    satisfies: [{ need: 'hunger', amount: 0.6 }],
    capacity: 10,
    dwellSeconds: { min: 300, max: 720 },
    price: 3,
    doors: [{ x: HATCH.along + HATCH.w / 2, z: 12, facing: 0 }],
    litter: 0.05,
  },
  build: (b: VoxelBuilder) => {
    const { amber, bloom, foliage, glass, metal, stone, stucco, teak, water } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 16, height: 2 });

    const eaves = stuccoWall(b, {
      ...KIOSK,
      y: ground,
      storeys: 1,
      wall: teak,
      trim: teak,
      skirting: 0,
    });
    // A painted fascia under the roof: the kiosk's colour, and the blank board sits on it.
    b.box(KIOSK.x, RIGHT, eaves - 3, eaves - 1, KIOSK.z, FRONT, water.shade);
    b.box(KIOSK.x + 6, RIGHT - 6, eaves - 3, eaves - 1, FRONT + 1, FRONT + 1, stucco.light);
    flatRoof(b, { ...KIOSK, y: eaves });

    const sill = ground + 4;
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along,
      y: sill,
      w: HATCH.w,
      h: 4,
      glass: metal,
      shutters: false,
    });
    b.box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      ground,
      sill - 2,
      FRONT + 1,
      FRONT + 1,
      teak.shade,
    );
    b.box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      sill - 1,
      sill - 1,
      FRONT + 1,
      FRONT + 2,
      stone.light,
    );

    const wares = [amber.base, bloom.light, foliage.light, amber.light, bloom.base] as const;
    wares.forEach((color, index) => {
      const x = HATCH.along + 1 + index * 3;
      b.box(x, x, sill, sill + 1, FRONT, FRONT, color);
    });

    // Kept to three courses: any deeper and, seen from above, it hides the hatch it shades.
    for (let course = 0; course < 3; course++) {
      const y = sill + 6 - course;
      const z = FRONT + 1 + course;
      b.box(HATCH.along - 2, HATCH.along + HATCH.w + 1, y, y, z, z, AWNING[course % 2]!);
    }

    shutteredWindow(b, { face: 'x-', at: KIOSK.x, along: KIOSK.z + 3, y: ground + 4, w: 4 });

    const fridge = { x: RIGHT + 2, z: KIOSK.z + 1 } as const;
    b.box(fridge.x, fridge.x + 4, ground, ground + 10, fridge.z, fridge.z + 4, stucco.light);
    b.box(fridge.x, fridge.x + 4, ground + 9, ground + 10, fridge.z, fridge.z + 4, bloom.base);
    b.box(
      fridge.x + 1,
      fridge.x + 3,
      ground + 1,
      ground + 8,
      fridge.z + 5,
      fridge.z + 5,
      glass.light,
    );
    for (const y of [ground + 3, ground + 6]) {
      b.box(fridge.x + 1, fridge.x + 3, y, y, fridge.z + 5, fridge.z + 5, stucco.light);
    }

    pottedPlant(b, { x: 0, z: 13, y: ground });
    pottedPlant(b, { x: 29, z: 13, y: ground });
    b.box(RIGHT + 1, RIGHT + 1, ground, eaves - 4, FRONT - 1, FRONT - 1, metal.base);
  },
});
