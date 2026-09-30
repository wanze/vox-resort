import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const NEON = PALETTE.bloom.light;
const SIGN = PALETTE.amber.light;
const SCREEN = PALETTE.water.light;

const PLOT = 64;
const HALL = { x: 3, z: 5, w: 58, d: 40 } as const;
const FRONT = HALL.z + HALL.d - 1;
const LEFT = HALL.x;
const RIGHT = HALL.x + HALL.w - 1;

// The tower runs back past the tiled pent so its flanks rise off the flat deck, not a slope.
const TOWER = { x: 23, z: 36, w: 18, d: 14 } as const;
const TOWER_FRONT = TOWER.z + TOWER.d - 1;
const DOOR = { along: 29, w: 6 } as const;

const MARQUEE = { x: TOWER.x - 1, x1: TOWER.x + TOWER.w, z: TOWER_FRONT + 1, reach: 6 } as const;
const BLADE = { x: 31, x1: 32 } as const;

// Deep enough that the cabinets inside stand clear of the reveal, shallow enough
// that the overhead camera still sees their screens.
const VITRINE = { depth: 3, h: 7, w: 8 } as const;
const VITRINES = [5, 14, 42, 51] as const;

const PENT_COURSES = 3;
const PENT_OVERHANG = 2;
const SKYLIGHT = { x: 8, x1: 19, z: 20, z1: 33 } as const;

export default defineModel({
  id: 'game-hall-b',
  label: 'Game Hall B',
  category: 'leisure',
  tiles: { x: 4, z: 4 },
  emissive: [NEON, SIGN, SCREEN],
  windows: WINDOW_GLASS,
  lights: [
    { x: 32, y: 11, z: TOWER_FRONT + 4, color: SIGN, intensity: 90, distance: 52 },
    { x: 32, y: 22, z: TOWER_FRONT + 8, color: NEON, intensity: 70, distance: 40 },
  ],
  venue: {
    role: 'activity',
    stage: true,
    satisfies: [{ need: 'fun', amount: 0.8 }],
    capacity: 24,
    dwellSeconds: { min: 1200, max: 3600 },
    reliability: 80,
    price: 2,
    doors: [{ x: DOOR.along + DOOR.w / 2, z: TOWER_FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, glass, metal, slate, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    const eaves = stuccoWall(b, { ...HALL, y: ground, storeys: 1 });
    // Cut off after a few courses: a full hip this wide buries the shopfront under tile.
    for (let course = 0; course < PENT_COURSES; course++) {
      const inset = course * 2 - PENT_OVERHANG;
      box(
        LEFT + inset,
        RIGHT - inset,
        eaves + course,
        eaves + course,
        HALL.z + inset,
        FRONT - inset,
        course === 0 ? terracotta.deep : terracotta.base,
      );
    }
    const deck = eaves + PENT_COURSES;
    const rim = PENT_COURSES * 2 - PENT_OVERHANG;
    box(LEFT + rim, RIGHT - rim, deck, deck, HALL.z + rim, FRONT - rim, terracotta.light);
    box(LEFT + rim + 1, RIGHT - rim - 1, deck, deck, HALL.z + rim + 1, FRONT - rim - 1, slate.base);
    box(46, 50, deck + 1, deck + 2, 14, 17, slate.shade);
    box(46, 50, deck + 3, deck + 3, 14, 17, metal.base);
    // An empty flat deck reads as a lid from above.
    box(SKYLIGHT.x, SKYLIGHT.x1, deck + 1, deck + 1, SKYLIGHT.z, SKYLIGHT.z1, slate.shade);
    box(
      SKYLIGHT.x + 1,
      SKYLIGHT.x1 - 1,
      deck + 2,
      deck + 2,
      SKYLIGHT.z + 1,
      SKYLIGHT.z1 - 1,
      glass.base,
    );
    const ridge = (SKYLIGHT.z + SKYLIGHT.z1 - 1) / 2;
    box(SKYLIGHT.x + 1, SKYLIGHT.x1 - 1, deck + 3, deck + 3, ridge, ridge + 1, metal.base);

    const parapet = stuccoWall(b, { ...TOWER, y: ground, storeys: 2 });
    const towerTop = flatRoof(b, { ...TOWER, y: parapet, overhang: 1, parapet: 2, cover: stone });
    // A stepped attic is what reads as a picture palace rather than a stair tower.
    box(
      TOWER.x + 4,
      TOWER.x + TOWER.w - 5,
      towerTop - 2,
      towerTop,
      TOWER.z + 3,
      TOWER_FRONT - 4,
      stucco.base,
    );
    box(
      TOWER.x + 3,
      TOWER.x + TOWER.w - 4,
      towerTop + 1,
      towerTop + 1,
      TOWER.z + 2,
      TOWER_FRONT - 3,
      stone.light,
    );
    const band = parapet - 3;
    box(TOWER.x - 1, TOWER.x + TOWER.w, band, band, TOWER_FRONT + 1, TOWER_FRONT + 1, NEON);
    for (const x of [TOWER.x - 1, TOWER.x + TOWER.w])
      box(x, x, band, band, TOWER.z, TOWER_FRONT + 1, NEON);

    doorway(b, { face: 'z+', at: TOWER_FRONT, along: DOOR.along, y: ground, w: DOOR.w, h: 9 });
    for (const along of [TOWER.x + 3, TOWER.x + TOWER.w - 6]) {
      shutteredWindow(b, {
        face: 'z+',
        at: TOWER_FRONT,
        along,
        y: ground + 15,
        w: 3,
        h: 7,
        shutters: false,
      });
    }

    const cabinet = (x: number, z: number, screen: Color): void => {
      box(x, x + 1, ground, ground + 5, z, z + 1, metal.base);
      box(x, x + 1, ground + 6, ground + 6, z, z + 1, metal.deep);
      box(x, x + 1, ground + 2, ground + 2, z + 1, z + 1, teak.base);
      box(x, x + 1, ground + 3, ground + 5, z + 1, z + 1, screen);
    };
    const screens = [SCREEN, NEON, SIGN];
    const back = FRONT - VITRINE.depth + 1;
    for (const [i, x] of VITRINES.entries()) {
      const x1 = x + VITRINE.w - 1;
      for (let cx = x; cx <= x1; cx++) {
        for (let y = ground; y < ground + VITRINE.h; y++) {
          for (let z = back; z <= FRONT; z++) b.del(cx, y, z);
        }
      }
      box(x, x1, ground - 1, ground - 1, back, FRONT, stone.light);
      box(x - 1, x1 + 1, ground + VITRINE.h, ground + VITRINE.h, FRONT, FRONT, stone.light);
      for (let c = 0; c < 3; c++) cabinet(x + c * 3, back, screens[(i + c) % 3]!);
    }

    // Tubes stand a voxel proud of the fascia so they catch no shadow from the eave.
    const tube = ground + VITRINE.h + 2;
    for (const [x0, x1] of [
      [LEFT + 1, TOWER.x - 1],
      [TOWER.x + TOWER.w, RIGHT - 1],
    ] as const) {
      box(x0, x1, tube, tube, FRONT + 1, FRONT + 1, NEON);
    }
    box(LEFT - 1, LEFT - 1, tube, tube, HALL.z + 2, FRONT, NEON);

    const canopy = ground + 10;
    const lip = MARQUEE.z + MARQUEE.reach - 1;
    box(MARQUEE.x, MARQUEE.x1, canopy, canopy + 1, MARQUEE.z, lip, metal.base);
    box(MARQUEE.x, MARQUEE.x1, canopy, canopy + 1, lip, lip, SIGN);
    box(MARQUEE.x, MARQUEE.x, canopy, canopy + 1, MARQUEE.z, lip, SIGN);
    box(MARQUEE.x1, MARQUEE.x1, canopy, canopy + 1, MARQUEE.z, lip, SIGN);
    box(MARQUEE.x + 1, MARQUEE.x1 - 1, canopy + 2, canopy + 2, MARQUEE.z, lip - 1, slate.shade);

    const bladeTop = towerTop + 3;
    box(
      BLADE.x - 1,
      BLADE.x1 + 1,
      canopy + 4,
      bladeTop,
      TOWER_FRONT + 1,
      TOWER_FRONT + 4,
      metal.deep,
    );
    box(BLADE.x - 1, BLADE.x - 1, canopy + 5, bladeTop - 1, TOWER_FRONT + 1, TOWER_FRONT + 3, SIGN);
    box(
      BLADE.x1 + 1,
      BLADE.x1 + 1,
      canopy + 5,
      bladeTop - 1,
      TOWER_FRONT + 1,
      TOWER_FRONT + 3,
      SIGN,
    );
    box(BLADE.x, BLADE.x1, canopy + 4, bladeTop, TOWER_FRONT + 4, TOWER_FRONT + 4, NEON);

    for (const along of [10, 18, 26, 34]) {
      for (const [face, at] of [
        ['x-', LEFT],
        ['x+', RIGHT],
      ] as const) {
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 3, h: 6, shutters: false });
      }
    }
    for (const along of [10, 28, 46]) {
      shutteredWindow(b, {
        face: 'z-',
        at: HALL.z,
        along,
        y: ground + 3,
        w: 6,
        h: 6,
        shutters: false,
      });
    }

    box(
      DOOR.along - 2,
      DOOR.along + DOOR.w + 1,
      ground - 1,
      ground - 1,
      TOWER_FRONT + 1,
      PLOT - 2,
      stone.shade,
    );
    for (const x of [MARQUEE.x - 2, MARQUEE.x1 + 1])
      pottedPlant(b, { x, z: TOWER_FRONT - 1, y: ground });
    for (const x of [LEFT + 2, 44]) {
      box(x, x + 16, ground, ground + 1, PLOT - 7, PLOT - 6, foliage.base);
      flowerBox(b, { x, z: PLOT - 4, y: ground, w: 17, along: 'x' });
    }
  },
});
