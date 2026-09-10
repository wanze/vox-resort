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
 * 96 x 64, a 6x4 tile plot: 24 x 16 m. The sixth column is deck rather than
 * water: the basins only grew a little with it, and the rest went into the two
 * rows of loungers, which at five tiles were laid shoulder to shoulder.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 63;

/** The long pool, the children's round one, and the basin under the slide. */
const LENGTHS = { x: 5, z: 15, w: 46, d: 34 } as const;
const PADDLING = { x: 64, z: 10, w: 25, d: 25 } as const;
const SPLASH = { x: 64, z: 42, w: 21, d: 15 } as const;

/** Where the slide's platform stands, and how far it has to fall to the water. */
const TOWER = { x: 87, z: 46, w: 5, d: 7, y: 11 } as const;
const CHUTE = { from: 86, to: 74, top: TOWER.y, end: 3, z: 48 } as const;

export default defineModel({
  id: 'swimming-pool',
  label: 'Swimming Pool',
  category: 'leisure',
  tiles: { x: 6, z: 4 },
  // The colour the renderer draws as water rather than as a painted surface.
  water: [PALETTE.water.base],
  // Submerged lights: no voxel emits them, the water is simply lit at night.
  lights: [
    { x: 18, y: 4, z: 32, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 38, y: 4, z: 32, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 76, y: 4, z: 22, color: 0x7fd8ee, intensity: 90, distance: 52 },
    { x: 74, y: 4, z: 49, color: 0x7fd8ee, intensity: 90, distance: 52 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { stone, water, teak, stucco, amber, metal } = PALETTE;

    // One slab, one colour, a metre high. `deck` is its top layer; everything
    // that stands on the terrace stands on `top`.
    const top = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });
    const deck = top - 1;

    const surface = poolWater(b, { ...LENGTHS, deck });
    poolWater(b, { ...PADDLING, shape: 'round', deck, depth: 1 });
    poolWater(b, { ...SPLASH, deck });

    // The shallow end: a ledge at the waterline along the long pool's east
    // wall, wide enough to stand on and to walk in from.
    box(47, 49, surface, surface, 17, 30, stone.light);

    /** A ladder over a pool wall: two rails on the rim, hooked over the water. */
    const ladder = (x: number, z: number, over: number): void => {
      for (const rail of [x, x + 3]) {
        box(rail, rail, top, top + 3, z, z, metal.base);
        set(rail, top + 3, over, metal.base);
      }
      for (const rung of [top, top + 2]) box(x + 1, x + 2, rung, rung, z, z, metal.base);
    };
    ladder(29, 48, 47);
    ladder(72, 42, 43);

    // The board, off the long pool's north side: three treads up onto a stone
    // pedestal, and a plank cantilevered eight voxels out over the water.
    steps(b, { x: 12, z: 8, w: 4, y: top + 2, treads: 3, descends: 'z-' });
    box(12, 15, top, top + 2, 9, 11, stone.light);
    box(12, 15, top + 3, top + 3, 9, 23, teak.base);
    box(12, 15, top + 3, top + 3, 23, 23, teak.shade);

    // A jet in the middle of the paddling pool, which is the whole of what a
    // three-year-old wants from a pool.
    box(76, 76, deck, deck + 3, 22, 22, water.light);

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
    for (const rail of [47, 51]) box(92, 92, top, TOWER.y + 3, rail, rail, metal.base);
    for (const rung of [top + 1, top + 3, top + 5, top + 7])
      box(92, 92, rung, rung, 48, 50, metal.base);

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
    // Two legs: one on the pool's rim, one standing in the water half way down.
    box(85, 85, top, chuteFloor(1) - 1, 49, 49, teak.shade);
    box(80, 80, deck, chuteFloor(6) - 1, 49, 49, teak.shade);

    // The shower, in the walk between the long pool and the paddling one: a
    // darker apron of paving to stand on, a timber post, and the water coming
    // off it. Timber rather than the metal a real one is, because a grey post
    // on grey paving is a post nobody sees.
    box(55, 58, deck, deck, 20, 26, stone.shade);
    box(56, 56, top, top + 8, 22, 23, teak.base);
    box(56, 56, top + 8, top + 8, 24, 25, teak.shade);
    set(56, top + 7, 25, metal.light);
    box(56, 56, top + 2, top + 6, 25, 25, water.light);

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
    // Ten voxels from one lounger to the next, against the seven the five-tile
    // terrace could afford: a lounger is four wide, so that is a metre and a
    // half of towel and bag between neighbours instead of three quarters. The
    // north row starts clear of the diving board's steps.
    for (const x of [18, 28, 38, 48, 58, 68, 78]) lounger(x, 2, true);
    for (const x of [6, 16, 26, 36, 46, 56]) lounger(x, 53, false);

    /** A parasol, its canopy wide enough to shade the loungers either side. */
    const parasol = (x: number, z: number): void => {
      box(x, x, top, top + 7, z, z, teak.base);
      box(x - 2, x + 2, top + 8, top + 8, z - 2, z + 2, amber.base);
      set(x, top + 9, z, teak.shade);
    };
    parasol(24, 5);
    parasol(64, 5);
    parasol(12, 55);
    parasol(42, 55);

    // Planting at the corners of the terrace, which is where the eye enters it.
    for (const [x, z] of [
      [1, 1],
      [1, 61],
      [93, 1],
      [93, 61],
      [58, 61],
      [93, 30],
      [86, 61],
    ] as const)
      pottedPlant(b, { x, z, y: top });
  },
});
