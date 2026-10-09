import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { leanTo } from '../parts/roof.ts';
import { plankRail } from '../parts/veranda.ts';
import {
  doorway,
  rubble,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 4, z: 2, w: 40, d: 14 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// The stair tower of the reference, which is how anyone reaches the roof terrace.
const TOWER = { x: LEFT, w: 9 } as const;
const TERRACE = TOWER.x + TOWER.w;

const DECK = { x0: TERRACE, x1: RIGHT, z0: FRONT + 1, z1: FRONT + 8 } as const;

// A brick wall splits the terrace in two, one balcony to each pair of beds as in the reference.
const PIER = { x: 27, w: 2 } as const;

const FOOTING = 4;

const DOORS = [15, 38] as const;
const DOOR_W = 4;

export default defineModel({
  id: 'bungalow-d',
  label: 'Bungalow D',
  category: 'lodging',
  tiles: { x: 3, z: 2 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 20,
    doors: DOORS.map((along) => ({ x: along + 2, z: FRONT, facing: 0 })),
  },
  build: (b: VoxelBuilder) => {
    const { slate, stucco, teak, terracotta } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 48, d: 32, height: 2, stone: PALETTE.sand });

    const floor = ground + FOOTING;
    rubble(b, { ...BODY, y: ground, h: FOOTING });
    rubble(b, {
      x: DECK.x0 + 1,
      z: DECK.z0,
      w: DECK.x1 - DECK.x0 - 1,
      d: DECK.z1 - DECK.z0,
      y: ground,
      h: FOOTING - 1,
    });
    b.box(TERRACE, RIGHT, floor - 1, floor - 1, BODY.z, DECK.z1, stucco.light);
    b.box(DECK.x0, DECK.x1, floor, floor, DECK.z0, DECK.z1, teak.base);

    const plate = stuccoWall(b, {
      ...BODY,
      y: floor,
      storeys: 1,
      wall: { ...stucco, base: stucco.light },
      trim: stucco,
      skirting: 0,
      quoins: false,
    });

    // Run round the tower too, so the roof line carries on as a ledge across it.
    b.box(TOWER.x - 1, RIGHT + 1, plate, plate + 1, BODY.z - 1, FRONT + 1, stucco.light);
    b.box(TERRACE, RIGHT, plate + 1, plate + 1, BODY.z, FRONT, terracotta.base);

    // A storey above the roof, so the terrace door has a wall to stand in.
    const towerTop = plate + STOREY_VOXELS;
    b.box(TOWER.x, TOWER.x + TOWER.w - 1, plate, towerTop - 1, BODY.z, FRONT, stucco.light);
    b.box(
      TOWER.x - 1,
      TOWER.x + TOWER.w,
      towerTop,
      towerTop + 1,
      BODY.z - 1,
      FRONT + 1,
      stucco.light,
    );
    b.box(
      TOWER.x,
      TOWER.x + TOWER.w - 1,
      towerTop + 1,
      towerTop + 1,
      BODY.z,
      FRONT,
      terracotta.shade,
    );

    const sill = floor + 1;
    const shutters = { trim: stucco, timber: slate } as const;
    for (const along of DOORS) {
      doorway(b, { face: 'z+', at: FRONT, along, y: sill, w: DOOR_W, trim: stucco, timber: slate });
    }
    for (const along of [21, 31]) {
      shutteredWindow(b, { ...shutters, face: 'z+', at: FRONT, along, y: sill, w: 4, h: 8 });
    }
    doorway(b, {
      face: 'x+',
      at: TOWER.x + TOWER.w - 1,
      along: BODY.z + 5,
      y: plate + 2,
      w: 3,
      h: 8,
      trim: stucco,
      timber: teak,
    });
    // Rolled down: a slate panel rather than glass, as the stair needs no view.
    const rolled = { glass: slate, trim: stucco, shutters: false, w: 3, h: 4 } as const;
    for (const y of [sill + 3, plate + 4]) {
      shutteredWindow(b, { ...rolled, face: 'z+', at: FRONT, along: TOWER.x + 3, y });
      shutteredWindow(b, { ...rolled, face: 'x-', at: LEFT, along: BODY.z + 5, y });
    }
    for (const along of [TERRACE + 4, TERRACE + 16, RIGHT - 6]) {
      shutteredWindow(b, { ...shutters, face: 'z-', at: BODY.z, along, y: sill + 5, w: 3, h: 3 });
    }
    shutteredWindow(b, {
      ...shutters,
      face: 'x+',
      at: RIGHT,
      along: BODY.z + 5,
      y: sill + 2,
      w: 3,
    });

    const porch = { z: DECK.z0, d: DECK.z1 - DECK.z0 + 2, y: plate - 2 } as const;
    const eaves = leanTo(b, { ...porch, x: DECK.x0 - 1, w: PIER.x - DECK.x0 + 1 });
    leanTo(b, { ...porch, x: PIER.x + PIER.w, w: RIGHT - PIER.x - PIER.w + 2 });
    for (const x of [DECK.x0, DECK.x1]) {
      b.box(x, x, floor + 1, eaves, DECK.z1, DECK.z1, teak.shade);
    }

    // Full height against the house, then down to the porch eaves so it carries both tin roofs.
    const brick = { x0: PIER.x, x1: PIER.x + PIER.w - 1 } as const;
    b.box(brick.x0, brick.x1, floor + 1, plate - 1, DECK.z0, DECK.z0, terracotta.base);
    b.box(brick.x0, brick.x1, floor + 1, eaves, DECK.z0 + 1, DECK.z1, terracotta.base);
    b.box(brick.x0, brick.x1, eaves + 1, eaves + 1, DECK.z0 + 1, DECK.z1, terracotta.light);

    const rail = { y: floor + 1, z: DECK.z1, along: 'x' } as const;
    const gaps = [
      { lo: DOORS[0], hi: DOORS[0] + DOOR_W - 1 },
      { lo: PIER.x, hi: PIER.x + PIER.w - 1 },
      { lo: DOORS[1], hi: DOORS[1] + DOOR_W - 1 },
      { lo: DECK.x1 + 1, hi: DECK.x1 + 1 },
    ];
    let from: number = DECK.x0;
    for (const { lo, hi } of gaps) {
      if (lo > from) plankRail(b, { ...rail, x: from, w: lo - from });
      from = hi + 1;
    }
    for (const x of [DECK.x0, DECK.x1]) {
      plankRail(b, { y: floor + 1, x, z: DECK.z0, w: DECK.z1 - DECK.z0 + 1, along: 'z' });
    }
    for (const along of DOORS) {
      steps(b, {
        x: along,
        z: DECK.z1 + 1,
        w: DOOR_W,
        y: floor - 1,
        treads: FOOTING,
        descends: 'z+',
        stone: teak,
      });
    }

    const terrace = plate + 2;
    const edge = { y: terrace, x: TERRACE, w: RIGHT - TERRACE + 2, along: 'x' } as const;
    plankRail(b, { ...edge, z: BODY.z - 1 });
    plankRail(b, { ...edge, z: FRONT + 1 });
    plankRail(b, { y: terrace, x: RIGHT + 1, z: BODY.z - 1, w: BODY.d + 2, along: 'z' });
    for (const x of [TERRACE + 12, TERRACE + 18]) {
      b.box(x, x + 2, terrace, terrace, BODY.z + 4, BODY.z + 11, teak.light);
      b.box(x, x + 2, terrace + 1, terrace + 2, BODY.z + 4, BODY.z + 4, teak.light);
    }
    parasol(b, { x: TERRACE + 16, z: BODY.z + 7, y: terrace, reach: 3 });

    pottedPlant(b, { x: TOWER.x + 3, z: FRONT + 3, y: ground });
  },
});
