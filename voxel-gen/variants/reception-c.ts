import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { oleander, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { plankRail, SLATS } from '../parts/veranda.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;
const GROUND = 3;

const BACK = 3;
const BODY = { x: 10, z: BACK + 1, w: 44, d: 20 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LOGGIA = { z0: FRONT + 1, z1: FRONT + 8 } as const;

const PIERS = [
  { x0: 4, x1: 9 },
  { x0: 22, x1: 25 },
  { x0: 38, x1: 41 },
  { x0: 54, x1: 59 },
] as const;
const SIDE_BAYS = [
  { x0: 10, x1: 21 },
  { x0: 42, x1: 53 },
] as const;
// Open to the roof between the two middle piers, so the way in reads from across the resort.
const HALL = { x0: 26, x1: 37 } as const;
const DOOR = { x: 29, w: 6 } as const;
const DESKS = [HALL.x0 + 2, DOOR.x + DOOR.w / 2, HALL.x1 - 2] as const;

const BENCH = { z: LOGGIA.z0 + 1, z1: LOGGIA.z0 + 3 } as const;
const BENCH_HIPS = GROUND + 2;

const SIGN = PALETTE.amber.light;
const SIGN_BOARD = { x0: 10, x1: 21, z: 41 } as const;

export default defineModel({
  id: 'reception-c',
  label: 'Reception C',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  // Every tycoon resort must buy one, and it sells nothing.
  cost: 600,
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  lights: [{ x: 15, y: 12, z: SIGN_BOARD.z + 2, color: SIGN, intensity: 90, distance: 50 }],
  seats: SIDE_BAYS.flatMap(({ x0 }) =>
    [x0 + 3, x0 + 7].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 0 as const })),
  ),
  venue: {
    role: 'service',
    sign: 'reception',
    capacity: 12,
    dwellSeconds: { min: 120, max: 480 },
    spots: DESKS.map((x) => ({ x, y: GROUND, z: LOGGIA.z0 + 2, facing: 2 as const })),
    doors: [{ x: DOOR.x + DOOR.w / 2, z: FRONT, facing: 0 }],
    receives: true,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { glass, grass, metal, sand, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');

    const eaves = stuccoWall(b, {
      ...BODY,
      y: ground,
      storeys: 2,
      wall: stucco,
      trim: stucco,
      skirting: 1,
      quoins: false,
    });
    const upper = ground + STOREY_VOXELS;
    for (const { x0, x1 } of PIERS) {
      const stoneBox = { x: x0, z: BACK, w: x1 - x0 + 1, d: LOGGIA.z1 - BACK + 1 };
      rubble(b, { ...stoneBox, y: ground, h: eaves - ground, stone: sand });
    }

    // Paved flush with the plinth, not raised on a slab: guests stand at the desks on it.
    box(HALL.x0, HALL.x1, ground - 1, ground - 1, LOGGIA.z0, LOGGIA.z1, stone.light);
    for (const { x0, x1 } of [...SIDE_BAYS, HALL]) {
      box(x0, x1, eaves - 2, eaves - 1, LOGGIA.z1, LOGGIA.z1 + 1, stucco.light);
    }

    for (const { x0, x1 } of SIDE_BAYS) {
      box(x0, x1, ground - 1, ground - 1, LOGGIA.z0, LOGGIA.z1, stone.light);
      box(x0, x1, upper - 2, upper - 1, LOGGIA.z0, LOGGIA.z1 + 1, stucco.light);
      plankRail(b, {
        x: x0,
        z: LOGGIA.z1 + 1,
        y: upper,
        w: x1 - x0 + 1,
        along: 'x',
        rail: SLATS,
        pitch: 64,
      });

      const front = { face: 'z+', at: FRONT, trim: stucco } as const;
      shutteredWindow(b, { ...front, along: x0 + 2, y: ground + 5, w: 8, h: 4, shutters: false });
      doorway(b, { ...front, along: x0 + 7, y: upper, w: 4, timber: LOUVRES });
      shutteredWindow(b, { ...front, along: x0 + 2, y: upper + 3, w: 3, timber: LOUVRES });

      const seat = { x0: x0 + 2, x1: x0 + 9 } as const;
      box(seat.x0, seat.x1, ground, ground, BENCH.z, BENCH.z1, teak.deep);
      box(seat.x0, seat.x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
      box(seat.x0, seat.x1, BENCH_HIPS, BENCH_HIPS + 1, LOGGIA.z0, LOGGIA.z0, teak.shade);
      box(seat.x0, seat.x1, BENCH_HIPS + 2, BENCH_HIPS + 2, LOGGIA.z0, LOGGIA.z0, teak.light);
    }

    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR.x,
      y: ground,
      w: DOOR.w,
      h: 10,
      trim: stucco,
      timber: glass,
    });
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR.x,
      y: upper + 1,
      w: DOOR.w,
      h: 7,
      trim: stucco,
      shutters: false,
    });

    for (const y of [ground + 4, upper + 3]) {
      for (const [face, at] of [
        ['x-', PIERS[0].x0],
        ['x+', PIERS[3].x1],
      ] as const) {
        for (const along of [BACK + 6, BACK + 14, LOGGIA.z0 + 2]) {
          shutteredWindow(b, { face, at, along, y, w: 3, trim: stucco, timber: LOUVRES });
        }
      }
      for (const along of [14, 30, 46]) {
        shutteredWindow(b, {
          face: 'z-',
          at: BODY.z,
          along,
          y,
          w: 3,
          trim: stucco,
          timber: LOUVRES,
        });
      }
    }

    const roof = {
      x: PIERS[0].x0,
      z: BACK,
      w: PIERS[3].x1 - PIERS[0].x0 + 1,
      d: LOGGIA.z1 + 2 - BACK + 1,
    };
    hipRoof(b, { ...roof, y: eaves, step: 3, gutter: teak });
    for (const x of [PIERS[0].x0 - 1, PIERS[3].x1 + 1]) {
      box(x, x, ground, eaves - 2, LOGGIA.z1, LOGGIA.z1, teak.deep);
    }

    const garden = roof.z + roof.d + 2;
    box(1, PLOT.w - 2, ground - 1, ground - 1, garden, PLOT.d - 2, grass.base);
    box(
      DOOR.x - 1,
      DOOR.x + DOOR.w,
      ground - 1,
      ground - 1,
      LOGGIA.z1 + 1,
      PLOT.d - 1,
      stone.light,
    );

    box(
      SIGN_BOARD.x0,
      SIGN_BOARD.x1,
      ground,
      ground + 1,
      SIGN_BOARD.z,
      SIGN_BOARD.z + 2,
      sand.shade,
    );
    box(
      SIGN_BOARD.x0 + 1,
      SIGN_BOARD.x1 - 1,
      ground + 2,
      ground + 6,
      SIGN_BOARD.z + 1,
      SIGN_BOARD.z + 1,
      metal.base,
    );
    box(
      SIGN_BOARD.x0 + 2,
      SIGN_BOARD.x1 - 2,
      ground + 3,
      ground + 5,
      SIGN_BOARD.z + 2,
      SIGN_BOARD.z + 2,
      SIGN,
    );

    for (const x of [DOOR.x - 5, DOOR.x + DOOR.w + 2]) {
      pottedPlant(b, { x, z: garden + 1, y: ground, size: 3 });
    }
    for (const [x, z] of [
      [44, 39],
      [53, 41],
    ] as const) {
      oleander(b, { x, z, y: ground });
    }
  },
});
