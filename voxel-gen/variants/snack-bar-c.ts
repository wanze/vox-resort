import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { shutteredWindow } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const GROUND = 2;

// A food truck parked side-on, the cab towards x-, where the camera sees its face.
const BOX = { x0: 11, x1: 27, z0: 2, z1: 10, top: GROUND + 14 } as const;
const CAB = { x0: 4, x1: 10 } as const;
const BED = GROUND + 2;
const HATCH = { along: 13, w: 13, y: GROUND + 7, h: 4 } as const;
const QUEUE = [0, 1, 2, 3].map((place) => HATCH.along + 1 + place * 4);

export default defineModel({
  id: 'snack-bar-c',
  label: 'Snack Bar C',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  venue: {
    role: 'food',
    satisfies: [{ need: 'hunger', amount: 0.6 }],
    capacity: 10,
    dwellSeconds: { min: 300, max: 720 },
    price: 3,
    spots: QUEUE.map((x) => ({ x, y: GROUND, z: 14, facing: 2 as const })),
    doors: [{ x: HATCH.along + Math.floor(HATCH.w / 2), z: BOX.z1 + 2, facing: 0 }],
    litter: 0.05,
  },
  build: (b: VoxelBuilder) => {
    const { amber, bloom, foliage, glass, metal, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 16, height: 2 });
    if (ground !== GROUND) throw new Error('The plinth moved under the queue');

    b.box(CAB.x0 + 1, BOX.x1, BED, BED, BOX.z0 + 1, BOX.z1 - 1, metal.deep);
    b.box(BOX.x0, BOX.x1, BED + 1, BOX.top, BOX.z0, BOX.z1, amber.base);
    b.box(BOX.x0 - 1, BOX.x1 + 1, BOX.top + 1, BOX.top + 1, BOX.z0, BOX.z1, stucco.light);
    b.box(BOX.x1 - 4, BOX.x1 - 2, BOX.top + 2, BOX.top + 2, BOX.z0 + 2, BOX.z0 + 4, metal.light);

    // The bonnet sits lower than the cab roof, so the truck reads nose-first, not as a box.
    b.box(CAB.x0, CAB.x1, BED + 1, BED + 6, BOX.z0, BOX.z1, amber.base);
    b.box(CAB.x0 + 3, CAB.x1, BED + 7, BOX.top - 3, BOX.z0, BOX.z1, amber.base);
    b.box(CAB.x0 + 3, CAB.x1, BOX.top - 2, BOX.top - 2, BOX.z0, BOX.z1, stucco.light);
    b.box(CAB.x0 + 3, CAB.x0 + 3, BED + 7, BOX.top - 3, BOX.z0 + 1, BOX.z1 - 1, glass.base);
    b.box(CAB.x0 + 4, CAB.x1 - 1, BED + 7, BOX.top - 3, BOX.z1, BOX.z1, glass.base);
    b.box(CAB.x0, CAB.x0, BED + 2, BED + 4, BOX.z0 + 2, BOX.z1 - 2, metal.light);
    for (const z of [BOX.z0 + 1, BOX.z1 - 1]) b.set(CAB.x0, BED + 5, z, stucco.light);
    b.box(CAB.x0 - 1, CAB.x0 - 1, BED + 1, BED + 1, BOX.z0, BOX.z1, metal.base);

    // A cream band at the waist, one course, so it costs a quad a side.
    b.box(CAB.x0, BOX.x1, BED + 4, BED + 4, BOX.z0, BOX.z1, stucco.light);
    b.box(CAB.x0, CAB.x0 + 2, BED + 6, BED + 6, BOX.z0, BOX.z1, stucco.light);

    for (const x of [CAB.x0 + 2, BOX.x1 - 6]) {
      for (const z of [BOX.z0, BOX.z1]) {
        b.box(x, x + 3, ground, BED + 2, z, z, metal.deep);
        b.box(x + 1, x + 2, ground + 1, BED + 1, z, z, stone.light);
      }
    }

    shutteredWindow(b, {
      face: 'z+',
      at: BOX.z1,
      along: HATCH.along,
      y: HATCH.y,
      w: HATCH.w,
      h: HATCH.h,
      glass: metal,
      trim: stucco,
      shutters: false,
    });
    const wares = [bloom.light, amber.light, foliage.light, stucco.light, bloom.base] as const;
    wares.forEach((color, index) => {
      const x = HATCH.along + 1 + index * 3;
      b.box(x, x, HATCH.y, HATCH.y + 1, BOX.z1 - 1, BOX.z1 - 1, color);
    });
    b.box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      HATCH.y - 1,
      HATCH.y - 1,
      BOX.z1 + 1,
      BOX.z1 + 2,
      stucco.light,
    );

    // The hatch's lid propped open overhead, its edge dropped a course so it reads as a flap.
    const lid = HATCH.y + HATCH.h + 2;
    b.box(HATCH.along - 1, HATCH.along + HATCH.w, lid, lid, BOX.z1 + 1, BOX.z1 + 3, bloom.base);
    b.box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      lid - 1,
      lid - 1,
      BOX.z1 + 3,
      BOX.z1 + 3,
      bloom.shade,
    );

    // The board on the roof is left blank, as the other snack bars leave theirs.
    b.box(BOX.x0 + 2, BOX.x0 + 11, BOX.top + 2, BOX.top + 5, BOX.z1 - 2, BOX.z1 - 2, teak.deep);
    b.box(BOX.x0 + 3, BOX.x0 + 10, BOX.top + 3, BOX.top + 4, BOX.z1 - 1, BOX.z1 - 1, stucco.light);

    b.box(29, 30, ground, ground + 4, 11, 12, teak.shade);
    b.box(28, 31, ground + 5, ground + 5, 10, 13, teak.light);
    b.box(28, 30, ground, ground + 5, 3, 7, stucco.light);
    b.box(28, 30, ground + 6, ground + 6, 3, 7, bloom.base);

    for (const z of [11, 14]) b.box(2, 2, ground, ground + 5, z, z, teak.base);
    b.box(1, 1, ground + 2, ground + 5, 11, 14, metal.deep);
    b.box(1, 1, ground + 4, ground + 4, 12, 13, stucco.light);
    pottedPlant(b, { x: 0, z: 0, y: ground });
  },
});
