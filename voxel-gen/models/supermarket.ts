import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 2, z: 3, w: 60, d: 32 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;
const BACK = BODY.z;

// The blind goes over the solid stretch: seen at 30 degrees it hides the bottom of whatever
// stands behind it, so it shades the crates rather than the glazing.
const PRODUCE = { x: 4, w: 18 } as const;

const DOOR = { along: 22, w: 8, h: 9 } as const;
const PANES = [32, 46] as const;
const PANE = { w: 12, h: 8 } as const;

const FASCIA = { y: 13, y1: 14 } as const;

const SIGN_CASE = { x: 20, x1: 35 } as const;

// The only emissive colour: emissive splits a second geometry off every placement, costing
// a draw call and a night-bake lamp each.
const SIGN = PALETTE.amber.light;

export default defineModel({
  id: 'supermarket',
  label: 'Supermarket',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  lights: [{ x: 26, y: 12, z: 38, color: SIGN, intensity: 90, distance: 50 }],
  venue: {
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 0.8 },
      { need: 'thirst', amount: 0.8 },
    ],
    capacity: 20,
    dwellSeconds: { min: 480, max: 1200 },
    doors: [{ x: DOOR.along + DOOR.w / 2 - 1, z: FRONT, facing: 0 }],
    litter: 0.03,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, slate, stone, teak, terracotta, water } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 64, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    // Two courses of parapet: seen from 30 degrees each extra course takes a slice off the
    // elevation and gives it to the roof.
    const OVERHANG = 1;
    const deck = eaves + 1;
    flatRoof(b, { ...BODY, y: eaves, overhang: OVERHANG, parapet: 2, cover: slate });

    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR.along,
      y: ground,
      w: DOOR.w,
      h: DOOR.h,
      timber: glass,
    });
    for (const along of PANES) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: ground + 1,
        w: PANE.w,
        h: PANE.h,
        shutters: false,
      });
    }

    for (const along of [9, 22]) {
      for (const [face, at] of [
        ['x-', LEFT],
        ['x+', RIGHT],
      ] as const) {
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 8, h: 7, shutters: false });
      }
    }
    doorway(b, { face: 'z-', at: BACK, along: 12, y: ground, w: 5, h: 8, timber: teak });
    shutteredWindow(b, {
      face: 'z-',
      at: BACK,
      along: 38,
      y: ground + 4,
      w: 8,
      h: 6,
      shutters: false,
    });

    box(PRODUCE.x, RIGHT - 2, FASCIA.y, FASCIA.y1, FRONT + 1, FRONT + 1, terracotta.base);
    box(SIGN_CASE.x, SIGN_CASE.x1, FASCIA.y - 1, FASCIA.y1 + 1, FRONT + 2, FRONT + 2, metal.base);
    box(SIGN_CASE.x + 1, SIGN_CASE.x1 - 1, FASCIA.y, FASCIA.y1, FRONT + 2, FRONT + 2, SIGN);

    awning(b, {
      face: 'z+',
      at: FRONT,
      along: PRODUCE.x,
      w: PRODUCE.w,
      y: FASCIA.y - 1,
      reach: 5,
      drop: 2,
      canvas: bloom,
    });

    box(12, 21, deck, deck + 2, 10, 17, slate.shade);
    box(12, 21, deck + 3, deck + 3, 10, 17, metal.base);
    box(38, 43, deck, deck + 1, 22, 27, slate.shade);
    box(38, 43, deck + 2, deck + 2, 22, 27, metal.base);
    pottedPlant(b, { x: 49, z: 27, y: deck, size: 3 });
    for (const x of [22, 42]) box(x, x, eaves, eaves, BODY.z, FRONT, slate.shade);

    // One fruit colour: three alternating is 16 quads a crate and reads as a stipple.
    const crate = (x: number, z: number, y: number, fruit: number): void => {
      box(x, x + 3, y, y + 2, z, z + 3, teak.shade);
      box(x, x + 3, y, y, z, z + 3, teak.deep);
      box(x, x + 3, y + 3, y + 3, z, z + 3, fruit);
    };

    const FRUIT = [bloom.base, amber.base, foliage.base] as const;
    for (const [i, x] of [5, 10].entries()) {
      crate(x, FRONT + 1, ground, FRUIT[i % FRUIT.length]!);
      crate(x, FRONT + 1, ground + 4, FRUIT[(i + 2) % FRUIT.length]!);
      crate(x, FRONT + 5, ground, FRUIT[(i + 1) % FRUIT.length]!);
    }

    // Two metres tall: the blind's valance hangs at 2.5 m.
    const CABINET = { x: 16, z: FRONT + 1 } as const;
    box(CABINET.x, CABINET.x + 5, ground, ground + 7, CABINET.z, CABINET.z + 3, stone.light);
    box(CABINET.x, CABINET.x + 5, ground + 7, ground + 7, CABINET.z, CABINET.z + 3, metal.shade);
    box(
      CABINET.x + 1,
      CABINET.x + 4,
      ground + 1,
      ground + 6,
      CABINET.z + 3,
      CABINET.z + 3,
      glass.deep,
    );
    for (const y of [ground + 2, ground + 4]) {
      box(CABINET.x + 1, CABINET.x + 4, y, y, CABINET.z + 3, CABINET.z + 3, water.base);
    }

    box(
      DOOR.along - 2,
      DOOR.along + DOOR.w + 1,
      ground - 1,
      ground - 1,
      FRONT + 1,
      45,
      stone.shade,
    );
    for (const x of [DOOR.along - 5, DOOR.along + DOOR.w + 3]) {
      pottedPlant(b, { x, z: FRONT + 2, y: ground });
    }
    for (const x of [4, 32]) {
      flowerBox(b, { x, z: 46, y: ground, w: 14, along: 'x', blooms: [foliage.base] });
    }

    for (const z of [39, 45]) box(48, 60, ground, ground + 2, z, z, metal.base);
    box(49, 59, ground, ground + 1, 40, 44, metal.base);
    box(49, 59, ground + 2, ground + 4, 40, 44, slate.light);
    box(49, 59, ground + 5, ground + 5, 44, 44, metal.base);
  },
});
