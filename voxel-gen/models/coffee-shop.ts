/**
 * Resort coffee shop: a whitewashed single-storey bar under a terracotta gable,
 * with a serving hatch under a red blind and a terrace of seven parasol tables
 * in two staggered rows in front of it, every one with a chair drawn up at
 * either end.
 * 48x48 (12x12 m plot, a 10x5.5 m room 3 m to the eaves, before a 12x5.5 m
 * terrace), a 3x3 tile. The terrace faces +z.
 *
 * The room was 3.5 m deep on a 3x2 plot, which is a kiosk with a roof on: no
 * room behind the hatch for a back bar and a person to stand at it. A tile more
 * of plot buys a room a café actually is, and a second row of tables.
 *
 * The companion to `bench.ts` and the second half of the same pass: a bench is
 * somewhere to sit on the way past something, and this is somewhere people sit
 * *because of* it. Six chairs, each one a {@link ModelSeat}, which is what the
 * crowd walks off the path for — see `crowd/domain/seating.ts`.
 *
 * The massing is the taverna's, one district down in scale: a solid room at the
 * back doing the serving, an open terrace in front doing the sitting, and the
 * step between them the blind rather than an arcade. There is no arcade here on
 * purpose — five round-headed bays is a dining hall, and a coffee shop is a
 * counter you are served at through a window.
 *
 * Its seats are the ones that may go unused, and that is by design rather than
 * by oversight: a chair is sat on only where the layout has run paving within
 * reach of it, so a coffee shop the generator drops in the middle of a district
 * has a terrace nobody crosses the grass to. See `crowd/domain/walkNetwork.ts`,
 * where a seat out of reach is dropped rather than made an error.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The plot: three tiles by three. */
const PLOT = { w: 48, d: 48 } as const;

/** The room that does the serving, across the back of the plot. */
const BODY = { x: 4, z: 3, w: 40, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

/** Layers the plinth stands, and so the layer the building starts on. */
const SLAB = 3;

/** The serving hatch in the front wall, and the counter shelf under it. */
const HATCH = { along: 18, w: 12, h: 6 } as const;

/**
 * The two rows of tables: the columns their pedestals stand in, and the rows
 * their tops span.
 *
 * Staggered, so the back chair of a front table and the front chair of a back
 * one never stand in the same columns — the two rows are closer together than
 * a pair of chairs is deep, and staggering is what lets them be.
 */
const ROWS = [
  { tables: [14, 26, 38], top: 29 },
  { tables: [8, 20, 32, 44], top: 40 },
] as const;

/** The rows the two chairs of a table stand in, from the row its top starts on. */
const near = (top: number): number => top - 3;
const far = (top: number): number => top + 5;

/**
 * The one colour that burns after dark, and the lamp that goes with it.
 *
 * Spent on a single lantern over the hatch, the way the taverna spends it on
 * its piers: a coffee shop with a glow on every surface is a coffee shop at
 * noon, and what wants to read as lit here is the one place people are served.
 */
const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'coffee-shop',
  label: 'Coffee Shop',
  category: 'amenities',
  tiles: { x: 3, z: 3 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  /**
   * One lamp, over the terrace rather than inside the room.
   *
   * The room is a counter and a back bar with nobody in it; the terrace is
   * where the tables are and the half of the plot that is worth lighting. Two
   * courses clear of the parasol canvas, so it pools on the paving between the
   * tables instead of grazing their tops — the note the restaurant's second
   * lamp carries, for the same reason.
   */
  lights: [{ x: 24, y: SLAB + 13, z: 36, color: LANTERN, intensity: 70, distance: 44 }],
  /**
   * Fourteen chairs: one at either end of each table, facing across it.
   *
   * A chair on all four sides would put four figures round a 1 m table with
   * their knees through it, and two is the pair the camera can see — the same
   * call the taverna's tables make.
   */
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
    doors: [{ x: LEFT + 4, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, slate, stone, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d, height: SLAB });

    // The terrace paved a course darker than the slab it is cut out of, so the
    // plot has a front and a back from above. One flat colour: a tile grid
    // painted voxel by voxel is a quad per tile where this is one quad.
    box(1, PLOT.w - 2, ground - 1, ground - 1, FRONT + 2, PLOT.d - 2, stone.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    // The hatch: an unshuttered opening with a stone shelf out under it, which
    // is the counter people are served at. A shutter either side would read as
    // a window, and this is the one opening that has to read as a counter.
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
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
      FRONT,
      FRONT + 1,
      stone.light,
    );

    // The blind over it, two courses above the shelf. Short reach, because a
    // canopy over a counter is the one thing standing between this camera and
    // the elevation — see `awning`.
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along - 2,
      w: HATCH.w + 4,
      y: ground + 10,
      reach: 3,
      canvas: bloom,
    });

    // The lantern over the counter: a pane under a timber bracket, hung flat on
    // the wall beside the hatch, as the taverna hangs its own.
    for (const x of [HATCH.along - 2, HATCH.along + HATCH.w + 1]) {
      box(x, x, ground + 6, ground + 7, FRONT, FRONT, LANTERN);
      b.set(x, ground + 8, FRONT, teak.shade);
    }

    // The way in, at the left end of the front, and a blank board beside it for
    // the day's list. Blank because lettering is what this grid cannot hold —
    // see `docs/art-direction.md`.
    doorway(b, { face: 'z+', at: FRONT, along: LEFT + 2, y: ground });
    steps(b, { x: LEFT + 1, z: FRONT + 1, w: 6, y: ground, treads: 1, descends: 'z+' });
    box(LEFT + 8, LEFT + 10, ground + 3, ground + 7, FRONT, FRONT, slate.deep);

    // Windows on the other three sides, so the room is a room from behind and
    // not a painted front: a pair down the back wall and one in each flank.
    for (const along of [BODY.x + 8, BODY.x + 28]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 9, y: ground + 4 });
    }

    // The back bar, seen through the hatch: a counter with a glazed shelf over
    // it, which is the whole of what makes the opening read as served.
    box(BODY.x + 4, RIGHT - 4, ground + 6, ground + 6, BODY.z + 1, BODY.z + 2, glass.base);
    box(BODY.x + 4, RIGHT - 4, ground, ground + 2, BODY.z + 1, BODY.z + 3, teak.shade);

    /**
     * One table: a pedestal under a metre of top, with a chair drawn up at
     * either end and its back rail on the outside of it.
     *
     * The chair is three voxels across and two deep, which is exactly the
     * figure that sits on it — a seat a person overhangs reads as a stool, and
     * one they rattle around in reads as a bench. The seat course is `ground`
     * plus one, so hips land on `ground + 2`, which is what the model declares.
     */
    const table = (x: number, top: number): void => {
      box(x, x + 1, ground, ground + 2, top + 1, top + 2, teak.shade);
      box(x - 1, x + 2, ground + 3, ground + 3, top, top + 3, teak.light);
      for (const [z, rail] of [
        [near(top), near(top) - 1],
        [far(top), far(top) + 2],
      ] as const) {
        box(x - 1, x + 1, ground, ground + 1, z, z + 1, teak.base);
        box(x - 1, x + 1, ground + 2, ground + 3, rail, rail, teak.base);
      }
      // The canopy goes up through the pedestal, 2 m over the paving: a seated
      // figure's head is four courses above its hips, so it clears by two.
      parasol(b, { x, z: top + 1, y: ground });
    };

    for (const row of ROWS) {
      for (const x of row.tables) table(x, row.top);
    }

    // Planting where the eye enters the plot: a pot at each front corner of the
    // room and a box under each of the two back windows.
    for (const x of [2, PLOT.w - 4]) pottedPlant(b, { x, z: FRONT + 3, y: ground });
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
