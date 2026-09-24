// Hollow on purpose: the mesher meshes the inside surfaces too, which costs more than a solid body.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const NEON = PALETTE.bloom.light;
const SIGN = PALETTE.amber.light;
const SCREEN = PALETTE.water.light;

const PLOT = 64;
const BODY = { x: 4, z: 5, w: 56, d: 44 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// Only two voxels deep: every voxel of reveal hides more of the opening from the overhead camera.
const ARCADE = { z: FRONT - 1, d: 2, bays: 5 } as const;
const HALL = { x: 7, x1: 56, z: 8, z1: FRONT - 2 } as const;

// One voxel rather than two: a deeper eave hides the thin opening at the angle the resort is seen
// from.
const OVERHANG = 1;

const TABLES = { z: 34, z1: 40 } as const;

const BOARD = { x: 24, x1: 39, y: 19, y1: 23 } as const;

export default defineModel({
  id: 'game-hall',
  label: 'Game Hall',
  category: 'leisure',
  tiles: { x: 4, z: 4 },
  emissive: [NEON, SIGN, SCREEN],
  windows: WINDOW_GLASS,
  lights: [
    { x: 32, y: 11, z: 34, color: SIGN, intensity: 90, distance: 52 },
    { x: 32, y: 11, z: 16, color: SIGN, intensity: 70, distance: 40 },
  ],
  venue: {
    role: 'activity',
    satisfies: [{ need: 'fun', amount: 0.8 }],
    capacity: 24,
    dwellSeconds: { min: 1200, max: 3600 },
    doors: [{ x: 31, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stone, stucco, slate, metal, teak, foliage, bloom } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    const cornice = arcade(b, {
      x: BODY.x,
      z: ARCADE.z,
      w: BODY.w,
      d: ARCADE.d,
      y: ground,
      along: 'x',
      bays: ARCADE.bays,
      pier: 3,
      // A lower arch reads as a slot on a hall you are meant to see into.
      height: 9,
      rise: 2,
    });
    if (cornice !== eaves) throw new Error('The arcade and the wall must reach the same eaves');
    // The arcade repaints the front quoins, so they go back on over it.
    for (const x of [LEFT, RIGHT]) box(x, x, ground, eaves - 2, FRONT, FRONT, stucco.light);

    for (let x = HALL.x; x <= HALL.x1; x++) {
      for (let z = HALL.z; z <= HALL.z1; z++) {
        for (let y = ground; y <= eaves - 2; y++) b.del(x, y, z);
      }
    }
    // Pale, because a dark floor turns the open front into a cave mouth.
    box(HALL.x, HALL.x1, ground - 1, ground - 1, HALL.z, HALL.z1, stone.shade);

    flatRoof(b, { ...BODY, y: eaves, overhang: OVERHANG, parapet: 2, cover: slate });
    // The parapet stands directly over the band so it is not in its own shadow.
    const xLo = BODY.x - OVERHANG;
    const xHi = RIGHT + OVERHANG;
    const zLo = BODY.z - OVERHANG;
    const zHi = FRONT + OVERHANG;
    box(xLo, xHi, eaves, eaves, zLo, zLo, NEON);
    box(xLo, xHi, eaves, eaves, zHi, zHi, NEON);
    box(xLo, xLo, eaves, eaves, zLo, zHi, NEON);
    box(xHi, xHi, eaves, eaves, zLo, zHi, NEON);

    box(BOARD.x, BOARD.x1, BOARD.y, BOARD.y1, zHi, zHi, metal.base);
    box(BOARD.x + 1, BOARD.x1 - 1, BOARD.y + 1, BOARD.y1 - 1, zHi, zHi, SIGN);

    for (const along of [10, 22, 34]) {
      for (const [face, at] of [
        ['x-', LEFT],
        ['x+', RIGHT],
      ] as const) {
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 8, h: 7, shutters: false });
      }
    }
    for (const along of [10, 24, 38, 50]) {
      shutteredWindow(b, {
        face: 'z-',
        at: BODY.z,
        along,
        y: ground + 3,
        w: 8,
        h: 7,
        shutters: false,
      });
    }

    // An empty flat roof reads as a lid from above.
    const deck = eaves + 1;
    for (const [x, z] of [
      [9, 9],
      [45, 13],
      [25, 30],
    ] as const) {
      box(x, x + 4, deck, deck + 1, z, z + 3, slate.shade);
      box(x, x + 4, deck + 2, deck + 2, z, z + 3, metal.base);
    }

    // 2x2 voxels is smaller than a real cabinet, so the room still fits the tables.
    const cabinet = (x: number, z: number, faces: 'z+' | 'x+', screen: Color): void => {
      box(x, x + 1, ground, ground + 6, z, z + 1, metal.base);
      box(x, x + 1, ground + 7, ground + 7, z, z + 1, metal.deep);
      const [x0, x1] = faces === 'x+' ? [x + 1, x + 1] : [x, x + 1];
      const [z0, z1] = faces === 'z+' ? [z + 1, z + 1] : [z, z + 1];
      box(x0, x1, ground + 3, ground + 3, z0, z1, teak.base);
      box(x0, x1, ground + 4, ground + 6, z0, z1, screen);
    };

    // The back wall is invisible from the resort's viewing angles, so the main row
    // stands just inside the outer bays, facing out.
    const screens = [SCREEN, NEON, SIGN];
    for (const [i, x] of [8, 11, 19, 22, 40, 43, 50, 53].entries()) {
      cabinet(x, HALL.z1 - 1, 'z+', screens[i % screens.length]!);
    }
    for (const [i, x] of [12, 16, 20, 24, 28, 32, 36, 40, 44].entries()) {
      cabinet(x, HALL.z, 'z+', screens[(i + 2) % screens.length]!);
    }
    for (const [i, z] of [12, 16, 20, 24, 28].entries()) {
      cabinet(HALL.x, z, 'x+', screens[(i + 1) % screens.length]!);
    }

    box(51, HALL.x1, ground, ground + 2, 12, 30, teak.shade);
    box(51, HALL.x1, ground + 3, ground + 3, 12, 30, stone.light);

    // Tables stand mid-room: the centre bay is the way in and must show a busy floor.
    const table = (x: number, x1: number, rail: Color, surface: Color): void => {
      box(x, x1, ground, ground + 2, TABLES.z, TABLES.z1, teak.shade);
      box(x, x1, ground + 3, ground + 3, TABLES.z, TABLES.z1, rail);
      box(x + 1, x1 - 1, ground + 3, ground + 3, TABLES.z + 1, TABLES.z1 - 1, surface);
    };
    table(12, 20, metal.base, stucco.light);
    table(26, 36, teak.base, foliage.shade);
    table(40, 50, teak.base, foliage.shade);
    box(13, 19, ground + 3, ground + 3, TABLES.z + 3, TABLES.z + 3, bloom.base);

    box(22, 41, ground - 1, ground - 1, FRONT + 1, PLOT - 2, stone.shade);
    for (const x of [8, 53]) pottedPlant(b, { x, z: FRONT + 2, y: ground });
    for (const x of [LEFT, 51]) flowerBox(b, { x, z: PLOT - 4, y: ground, w: 9, along: 'x' });
  },
});
