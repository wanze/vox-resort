/**
 * The pool terrace: three basins on one low stone deck.
 *
 * A resort pool is not one rectangle of water, it is a place — you swim
 * lengths in the long pool, the children paddle in the round one, and the
 * small basin under the slide is where they queue. Drawn as one model rather
 * than three, because the deck between them is what makes it read as a
 * terrace, and because the three of them share a waterline.
 *
 * The deck is deliberately low — four layers, a metre — and one flat colour.
 * An earlier pass paved it in a two-tone checker, which is the one thing
 * `docs/art-direction.md` says never to do: the mesher merges coplanar faces of
 * one colour, so a chequerboard costs more triangles than a hotel and buys a
 * pattern nobody sees from the height the resort is viewed at.
 *
 * The water is `PALETTE.water.base` and nothing else, declared below as this
 * model's water: the renderer meshes that colour apart and shades it with the
 * sea's own shader, so the swell, the sun's glint and the sky it reflects are
 * the same here as at the beach. Flat blue in the preview, wet in the app.
 *
 * 128 x 96, an 8x6 tile plot: 32 x 24 m. It was 24 x 16 m with a long pool of
 * 11.5 m, which is a hotel's plunge pool; a resort's main pool is 20 m and
 * more, so the long pool is 20 x 9.5 m now, and the deck round it carries two
 * full rows of loungers.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 127;
const Z = 95;

/**
 * The deck's own surface layer: what the plinth below hands back, written down
 * here because the loungers' seats are declared against it and a declaration
 * cannot read a local. `build` checks the two agree.
 */
const TOP_LAYER = 4;

/**
 * The two rows of loungers: the column each one starts in, and the row the row
 * stands in.
 *
 * Ten voxels from one to the next: a lounger is four wide, so that is a metre
 * and a half of towel and bag between neighbours. The north row starts clear of
 * the diving board's steps, and its backrests are at its north end so that
 * everybody on it lies facing the water.
 */
const NORTH_ROW = { z: 2, at: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] } as const;
const SOUTH_ROW = { z: 85, at: [6, 16, 26, 36, 46, 56, 66, 76, 86, 96, 106, 116] } as const;

/** The long pool, the children's round one, and the basin under the slide. */
const LENGTHS = { x: 6, z: 26, w: 80, d: 38 } as const;
const PADDLING = { x: 90, z: 14, w: 32, d: 28 } as const;
const SPLASH = { x: 90, z: 58, w: 24, d: 20 } as const;

/** Where the slide's platform stands, and how far it has to fall to the water. */
const TOWER = { x: 117, z: 62, w: 5, d: 7, y: 11 } as const;
const CHUTE = { from: 116, to: 104, top: TOWER.y, end: 3, z: 64 } as const;

export default defineModel({
  id: 'swimming-pool',
  label: 'Swimming Pool',
  category: 'leisure',
  tiles: { x: 8, z: 6 },
  /**
   * One sunbather per lounger.
   *
   * The mattress is laid in `TOP_LAYER + 1`, so the hips rest on the layer
   * above it, and `facing` is the way the legs point — away from the backrest,
   * which is at the north end of the north row and the south end of the south
   * one. Four voxels back from the hips is the head, which lands on the raised
   * end; three forward is the feet, which is where a lounger this long puts
   * them.
   */
  seats: [
    ...NORTH_ROW.at.map(
      (x) => ({ x: x + 1, y: TOP_LAYER + 2, z: NORTH_ROW.z + 4, facing: 0, pose: 'lie' }) as const,
    ),
    ...SOUTH_ROW.at.map(
      (x) => ({ x: x + 1, y: TOP_LAYER + 2, z: SOUTH_ROW.z + 1, facing: 2, pose: 'lie' }) as const,
    ),
  ],
  // The colour the renderer draws as water rather than as a painted surface.
  water: [PALETTE.water.base],
  // Submerged lights: no voxel emits them, the water is simply lit at night.
  lights: [
    { x: 26, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 66, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 106, y: 4, z: 28, color: 0x7fd8ee, intensity: 90, distance: 52 },
    { x: 102, y: 4, z: 68, color: 0x7fd8ee, intensity: 90, distance: 52 },
  ],
  // A negative amount is a need a visit makes worse: a swim spends energy.
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.2 },
    ],
    capacity: 30,
    dwellSeconds: { min: 1800, max: 5400 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { stone, water, teak, stucco, amber, metal } = PALETTE;

    // One slab, one colour, a metre high. `deck` is its top layer; everything
    // that stands on the terrace stands on `top`.
    const top = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });
    if (top !== TOP_LAYER) throw new Error('The deck and the loungers must agree on its surface');
    const deck = top - 1;

    const surface = poolWater(b, { ...LENGTHS, deck });
    poolWater(b, { ...PADDLING, shape: 'round', deck, depth: 1 });
    poolWater(b, { ...SPLASH, deck });

    // The shallow end: a ledge at the waterline along the long pool's east
    // wall, wide enough to stand on and to walk in from.
    box(82, 84, surface, surface, 30, 50, stone.light);

    /** A ladder over a pool wall: two rails on the rim, hooked over the water. */
    const ladder = (x: number, z: number, over: number): void => {
      for (const rail of [x, x + 3]) {
        box(rail, rail, top, top + 3, z, z, metal.base);
        set(rail, top + 3, over, metal.base);
      }
      for (const rung of [top, top + 2]) box(x + 1, x + 2, rung, rung, z, z, metal.base);
    };
    ladder(40, 63, 62);
    ladder(100, 58, 59);

    // The board, off the long pool's north side: three treads up onto a stone
    // pedestal, and a plank cantilevered out over the water.
    steps(b, { x: 12, z: 19, w: 4, y: top + 2, treads: 3, descends: 'z-' });
    box(12, 15, top, top + 2, 20, 22, stone.light);
    box(12, 15, top + 3, top + 3, 20, 34, teak.base);
    box(12, 15, top + 3, top + 3, 34, 34, teak.shade);

    // A jet in the middle of the paddling pool, which is the whole of what a
    // three-year-old wants from a pool.
    box(106, 106, deck, deck + 3, 28, 28, water.light);

    // The slide: a platform on four legs, a ladder up the back of it, and a
    // chute falling west into the splash pool.
    for (const x of [TOWER.x, TOWER.x + TOWER.w - 1]) {
      for (const z of [TOWER.z, TOWER.z + TOWER.d - 1])
        box(x, x, top, TOWER.y - 1, z, z, teak.shade);
    }
    box(
      TOWER.x,
      TOWER.x + TOWER.w - 1,
      TOWER.y,
      TOWER.y,
      TOWER.z,
      TOWER.z + TOWER.d - 1,
      teak.base,
    );
    for (const rail of [63, 67]) box(122, 122, top, TOWER.y + 3, rail, rail, metal.base);
    for (const rung of [top + 1, top + 3, top + 5, top + 7])
      box(122, 122, rung, rung, 64, 66, metal.base);

    /**
     * How high the chute stands where the run has got to `step`.
     *
     * Squared rather than straight, which is what tells a slide from a flight
     * of stairs: it falls fastest off the platform and flattens into a runout
     * over the water, so a child arrives along the surface instead of at it.
     */
    const run = CHUTE.from - CHUTE.to;
    const chuteFloor = (step: number): number =>
      Math.round(CHUTE.end + (CHUTE.top - CHUTE.end) * (1 - step / run) ** 2);
    for (let step = 0; step <= run; step++) {
      const x = CHUTE.from - step;
      const y = chuteFloor(step);
      box(x, x, y, y + 1, CHUTE.z, CHUTE.z + 2, amber.base);
      for (const rail of [CHUTE.z - 1, CHUTE.z + 3]) box(x, x, y, y + 2, rail, rail, amber.shade);
    }
    // Two legs: one on the deck beside the rim, one standing in the water.
    box(115, 115, top, chuteFloor(1) - 1, 65, 65, teak.shade);
    box(110, 110, deck, chuteFloor(6) - 1, 65, 65, teak.shade);

    // The shower, on the deck south of the long pool: a darker apron of paving
    // to stand on, a timber post, and the water coming off it. Timber rather
    // than the metal a real one is, because a grey post on grey paving is a
    // post nobody sees.
    box(49, 52, deck, deck, 70, 76, stone.shade);
    box(50, 50, top, top + 8, 72, 73, teak.base);
    box(50, 50, top + 8, top + 8, 74, 75, teak.shade);
    set(50, top + 7, 75, metal.light);
    box(50, 50, top + 2, top + 6, 75, 75, water.light);

    /**
     * A lounger. `headNorth` puts the backrest at the north end, which is what
     * a row on the pool's north deck wants: everyone lies facing the water.
     */
    const lounger = (x: number, z: number, headNorth: boolean): void => {
      const head = headNorth ? z : z + 5;
      const foot = headNorth ? z + 1 : z;
      for (const lx of [x, x + 3]) {
        for (const lz of [z, z + 5]) set(lx, top, lz, teak.shade);
      }
      box(x, x + 3, top + 1, top + 1, foot, foot + 4, stucco.light);
      box(
        x,
        x + 3,
        top + 2,
        top + 2,
        headNorth ? z + 3 : z + 2,
        headNorth ? z + 3 : z + 2,
        amber.base,
      );
      box(x, x + 3, top + 2, top + 3, head, head, stucco.light);
      box(x, x + 3, top + 4, top + 4, head, head, teak.base);
    };
    for (const x of NORTH_ROW.at) lounger(x, NORTH_ROW.z, true);
    for (const x of SOUTH_ROW.at) lounger(x, SOUTH_ROW.z, false);

    // A parasol between every few loungers, its canopy wide enough to shade the
    // two either side of the pole.
    for (const [x, z] of [
      [26, 5],
      [56, 5],
      [86, 5],
      [116, 5],
      [12, 88],
      [42, 88],
      [72, 88],
      [102, 88],
    ] as const)
      parasol(b, { x, z, y: top });

    // Planting at the corners of the terrace, which is where the eye enters it.
    for (const [x, z] of [
      [1, 1],
      [1, 93],
      [125, 1],
      [125, 93],
      [125, 46],
      [1, 46],
    ] as const)
      pottedPlant(b, { x, z, y: top });
  },
});
