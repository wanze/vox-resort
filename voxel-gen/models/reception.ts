/**
 * Reception: the check-in lodge every guest walks into first — a whitewashed
 * hall under a big hipped tile roof, fronted by a five-bay arcaded loggia with
 * glazed doors in the middle bay and a bench in each end bay, and a forecourt
 * with a lit sign, flags, planters and a luggage trolley by the door.
 * 64x48x26 (16 x 12 m plot, a 13 x 8 m hall with a 1.5 m loggia), a 4x3 tile.
 * The entrance faces +z.
 *
 * Massing from `villa.jpg` scaled up to a public building: the arcade is the
 * villa's and the game hall's, the roof is the villa's hip. The one thing a
 * reception has that a villa does not is legibility from across the plot, which
 * is what the flags and the sign are for — both are flat planes, so they cost a
 * handful of rectangles for a silhouette nothing else in the catalogue has.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;

/** The hall. */
const BODY = { x: 6, z: 4, w: 52, d: 26 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/** The loggia in front of it, as deep as a person lying down and then some. */
const LOGGIA = { z: FRONT + 1, d: 6 } as const;
const LOGGIA_FRONT = LOGGIA.z + LOGGIA.d - 1;

/** Surface of the plinth: what it hands back, and what the benches are declared on. */
const GROUND = 3;

/**
 * The columns each of the loggia's five bays opens across, as `arcade` cuts
 * them for a 52-voxel run of 3-voxel piers. Doors and windows are cut behind
 * the openings so the piers never stand in front of the glass.
 */
const BAYS = [
  [9, 15],
  [19, 25],
  [29, 34],
  [38, 44],
  [48, 54],
] as const;

/** The bench in each end bay: its plank's z range, and the rail behind it. */
const BENCH = { z: LOGGIA.z + 1, z1: LOGGIA.z + 3 } as const;
const BENCH_HIPS = GROUND + 2;

/** The lit sign on the forecourt, and the lamp spilling over it. */
const SIGN = PALETTE.amber.light;

/** The three flagpoles at the forecourt's east corner, and the ramp each flies. */
const FLAGS = [
  [50, PALETTE.bloom],
  [55, PALETTE.amber],
  [60, PALETTE.glass],
] as const;

export default defineModel({
  id: 'reception',
  label: 'Reception',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  lights: [{ x: 24, y: 12, z: 40, color: SIGN, intensity: 90, distance: 50 }],
  /** Two guests waiting on each end bay's bench, looking out over the forecourt. */
  seats: [BAYS[0], BAYS[4]].flatMap(([x0]) =>
    [x0 + 1, x0 + 5].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 0 as const })),
  ),
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, stone, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });

    const cornice = arcade(b, {
      x: BODY.x,
      z: LOGGIA.z,
      w: BODY.w,
      d: LOGGIA.d,
      y: ground,
      along: 'x',
      bays: BAYS.length,
      pier: 3,
      height: 9,
      rise: 2,
    });
    if (cornice !== eaves) throw new Error('The loggia and the hall must reach the same eaves');

    // The loggia's floor, a course darker than the plinth, and the apron from
    // it to the plot edge in front of the doors.
    box(LEFT, RIGHT, ground - 1, ground - 1, LOGGIA.z, LOGGIA_FRONT, stone.shade);
    box(27, 36, ground - 1, ground - 1, LOGGIA_FRONT + 1, PLOT.d - 2, stone.shade);

    hipRoof(b, { x: BODY.x, z: BODY.z, w: BODY.w, d: BODY.d + LOGGIA.d, y: eaves });

    // Glazed doors behind the middle bay and a tall window behind each of the
    // others, so the openings of the loggia show the glass rather than a pier.
    const [door, ...windows] = [BAYS[2], BAYS[0], BAYS[1], BAYS[3], BAYS[4]];
    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: door[0],
      y: ground,
      w: door[1] - door[0] + 1,
      h: 9,
      timber: glass,
    });
    for (const [x0, x1] of windows) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along: x0 + 1,
        y: ground + 5,
        w: x1 - x0 - 1,
        h: 4,
        shutters: false,
      });
    }
    for (const along of [12, 28, 44]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 3, w: 8, h: 6 });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      for (const along of [9, 19])
        shutteredWindow(b, { face, at, along, y: ground + 3, w: 5, h: 6 });
    }

    // The sign: a lit panel in a dark case on a stone base, standing out on the
    // forecourt where the roof's overhang cannot hide it from above.
    box(8, 19, ground, ground + 1, 41, 43, stone.light);
    box(9, 18, ground + 2, ground + 6, 42, 42, metal.base);
    box(10, 17, ground + 3, ground + 5, 43, 43, SIGN);

    // A bench against the hall in each end bay, with a back rail and arms.
    for (const [x0, x1] of [BAYS[0], BAYS[4]]) {
      box(x0, x1, ground, ground, BENCH.z, BENCH.z1, teak.deep);
      box(x0, x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
      box(x0, x1, BENCH_HIPS, BENCH_HIPS + 1, LOGGIA.z, LOGGIA.z, teak.shade);
      box(x0, x1, BENCH_HIPS + 2, BENCH_HIPS + 2, LOGGIA.z, LOGGIA.z, teak.light);
    }

    // The flags: a pole each and one flat sheet flying east off the top of it.
    for (const [x, cloth] of FLAGS) {
      const top = ground + 22;
      box(x - 1, x + 1, ground, ground, 42, 44, stone.light);
      box(x, x, ground + 1, top, 43, 43, metal.base);
      box(x - 4, x - 1, top - 4, top - 1, 43, 43, cloth.base);
    }

    // The luggage trolley by the doors: a brass frame with two cases on it.
    box(39, 43, ground, ground, 38, 40, amber.shade);
    for (const x of [39, 43]) box(x, x, ground + 1, ground + 7, 39, 39, amber.shade);
    box(39, 43, ground + 8, ground + 8, 39, 39, amber.shade);
    box(40, 42, ground + 1, ground + 3, 38, 40, bloom.shade);
    box(40, 41, ground + 4, ground + 5, 38, 40, glass.deep);

    // Planting: a pot at each end of the loggia and green boxes along the plot
    // edge either side of the apron.
    for (const x of [2, PLOT.w - 4]) pottedPlant(b, { x, z: LOGGIA.z + 2, y: ground, size: 3 });
    for (const x of [4, 38]) {
      flowerBox(b, { x, z: PLOT.d - 3, y: ground, w: 8, along: 'x', blooms: [foliage.base] });
    }
  },
});
