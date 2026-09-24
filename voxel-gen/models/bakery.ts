import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = 32;

const BODY = { x: 3, z: 3, w: 26, d: 16 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const GROUND = 3;

const DISPLAY = { along: 13, w: 12, h: 6 } as const;

const TABLES = [19, 26] as const;
const TOP = 23;
const near = TOP - 3;
const far = TOP + 5;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'bakery',
  label: 'Bakery',
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
    doors: [{ x: 8, z: FRONT, facing: 0 }],
    litter: 0.035,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, foliage, slate, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    if (ground !== GROUND)
      throw new Error('The forecourt and its chairs must agree on its surface');

    box(1, PLOT - 2, ground - 1, ground - 1, FRONT + 1, PLOT - 2, stone.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    box(21, 24, eaves, eaves + 8, 5, 8, stucco.base);
    box(20, 25, eaves + 9, eaves + 9, 4, 9, terracotta.shade);
    box(21, 24, eaves + 10, eaves + 10, 5, 8, slate.deep);

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
    box(
      DISPLAY.along,
      DISPLAY.along + DISPLAY.w - 1,
      ground + 2,
      ground + 2,
      FRONT - 1,
      FRONT - 1,
      amber.shade,
    );
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: DISPLAY.along - 1,
      w: DISPLAY.w + 2,
      y: ground + 10,
      reach: 3,
      canvas: amber,
    });

    box(11, 11, ground + 6, ground + 7, FRONT + 1, FRONT + 1, LANTERN);
    b.set(11, ground + 8, FRONT + 1, teak.shade);

    box(LEFT, LEFT + 1, ground + 3, ground + 7, FRONT + 1, FRONT + 1, slate.deep);

    shutteredWindow(b, { face: 'z-', at: BODY.z, along: 10, y: ground + 4 });
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: 9, y: ground + 4 });
    }

    // No parasols: the blind is the shade here, and a canopy on a 2x2 plot would
    // stand over the shopfront.
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

    pottedPlant(b, { x: 1, z: FRONT + 3, y: ground });
    flowerBox(b, { x: 8, z: BODY.z - 1, y: ground, w: 10, along: 'x', blooms: [foliage.base] });
  },
});
