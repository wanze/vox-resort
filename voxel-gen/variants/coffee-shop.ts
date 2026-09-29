import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 48, d: 48 } as const;

const BODY = { x: 4, z: 3, w: 40, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// The shop stands behind a loggia; its own front wall is where the door and counter are cut.
const LOGGIA = { x: BODY.x, z: 20, w: BODY.w, d: FRONT - 19, bays: 5, pier: 2 } as const;
const SHOP = { x: BODY.x, z: BODY.z, w: BODY.w, d: LOGGIA.z - BODY.z } as const;
const SHOPFRONT = LOGGIA.z - 1;

const SLAB = 3;

const HATCH = { along: 18, w: 12, h: 6 } as const;

// Staggered: the rows are closer together than a pair of chairs is deep.
const ROWS = [
  { tables: [14, 26, 38], top: 29, shade: false },
  { tables: [8, 20, 32, 44], top: 40, shade: true },
] as const;

const near = (top: number): number => top - 3;
const far = (top: number): number => top + 5;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'coffee-shop-b',
  label: 'Coffee Shop B',
  category: 'amenities',
  tiles: { x: 3, z: 3 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: [{ x: 24, y: SLAB + 13, z: 36, color: LANTERN, intensity: 70, distance: 44 }],
  seats: ROWS.flatMap((row) =>
    row.tables.flatMap((x) => [
      { x, y: SLAB + 2, z: near(row.top), facing: 0 as const },
      { x, y: SLAB + 2, z: far(row.top), facing: 2 as const },
    ]),
  ),
  venue: {
    role: 'drink',
    satisfies: [
      { need: 'thirst', amount: 0.7 },
      { need: 'energy', amount: 0.2 },
    ],
    capacity: 16,
    dwellSeconds: { min: 600, max: 1500 },
    price: 3,
    doors: [{ x: LEFT + 4, z: FRONT, facing: 0 }],
    litter: 0.03,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, slate, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d, height: SLAB });
    box(1, PLOT.w - 2, ground - 1, ground - 1, FRONT + 1, PLOT.d - 2, stone.shade);
    box(LOGGIA.x, RIGHT, ground - 1, ground - 1, LOGGIA.z, FRONT, stone.light);

    const cornice = stuccoWall(b, { ...SHOP, y: ground, storeys: 1 });
    const crown = arcade(b, { ...LOGGIA, y: ground, along: 'x', height: 9, rise: 3 });
    const eaves = Math.max(cornice, crown);
    box(LEFT, RIGHT, cornice, eaves - 1, SHOP.z, SHOPFRONT, stucco.light);
    hipRoof(b, { ...BODY, y: eaves });

    doorway(b, { face: 'z+', at: SHOPFRONT, along: LEFT + 2, y: ground, timber: PALETTE.glass });
    shutteredWindow(b, {
      face: 'z+',
      at: SHOPFRONT,
      along: HATCH.along,
      y: ground + 3,
      w: HATCH.w,
      h: HATCH.h,
      shutters: false,
    });
    box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      ground + 2,
      ground + 2,
      SHOPFRONT + 1,
      SHOPFRONT + 2,
      stone.light,
    );
    box(
      HATCH.along,
      HATCH.along + HATCH.w - 1,
      ground,
      ground + 1,
      SHOPFRONT + 1,
      SHOPFRONT + 1,
      teak.shade,
    );
    shutteredWindow(b, { face: 'z+', at: SHOPFRONT, along: 35, y: ground + 3, w: 4 });
    box(LEFT + 8, LEFT + 10, ground + 2, ground + 6, SHOPFRONT + 1, SHOPFRONT + 1, slate.deep);

    // A lamp on each inner pier, where the arches frame it from the terrace.
    const pitch = (LOGGIA.w - LOGGIA.pier) / LOGGIA.bays;
    for (let pier = 1; pier < LOGGIA.bays; pier++) {
      const x = LOGGIA.x + Math.round(pier * pitch);
      box(x, x + 1, ground + 6, ground + 7, FRONT + 1, FRONT + 1, LANTERN);
      box(x, x + 1, ground + 8, ground + 8, FRONT + 1, FRONT + 1, teak.shade);
    }

    for (const along of [BODY.x + 8, BODY.x + 28]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 7, y: ground + 4 });
    }

    // The near row goes without parasols: a canopy that close would hide the loggia from a
    // camera 30 degrees down, and the far row is well clear of it.
    const table = (x: number, top: number, shade: boolean): void => {
      box(x, x + 1, ground, ground + 2, top + 1, top + 2, teak.shade);
      box(x - 1, x + 2, ground + 3, ground + 3, top, top + 3, stucco.light);
      for (const [z, rail] of [
        [near(top), near(top) - 1],
        [far(top), far(top) + 2],
      ] as const) {
        box(x - 1, x + 1, ground, ground + 1, z, z + 1, teak.base);
        box(x - 1, x + 1, ground + 2, ground + 3, rail, rail, teak.base);
      }
      if (shade) parasol(b, { x, z: top + 1, y: ground, canvas: foliage });
    };
    for (const row of ROWS) {
      for (const x of row.tables) table(x, row.top, row.shade);
    }

    for (const x of [0, PLOT.w - 1]) {
      balustrade(b, { x, z: FRONT + 5, y: ground, w: 14, along: 'z', pitch: 3 });
    }
    for (const x of [0, PLOT.w - 3]) pottedPlant(b, { x, z: FRONT + 2, y: ground });
    for (const x of [BODY.x + 4, BODY.x + 24]) {
      flowerBox(b, {
        x,
        z: BODY.z - 1,
        y: ground,
        w: 12,
        along: 'x',
        blooms: [foliage.base, foliage.light],
      });
    }
  },
});
