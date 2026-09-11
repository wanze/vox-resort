/**
 * Upscale beach club: a boarded timber deck raised over the sand, with a
 * thatched bar along the back, an L of lounge seating beside it, two rows of
 * daybeds under parasols, and two flights down to the beach.
 * 64x64x27 (16x16 m plot, a 15x13 m deck a metre over the sand, 6.75 m to the
 * bar's ridge pole), a 4x4 tile. The deck faces +z, out to the sea.
 *
 * Massing and dressing from `docs/references/pool-deck.jpg` — a deck laid edge
 * to edge with its loungers along one side — and from `tiki-bar.jpg` for the
 * bar: the counter, the stools drawn up to it, the shelf of bottles behind and
 * the deep thatch over the lot. The tiki render is the golden-hour lane, so its
 * colour is not taken: the cream and the timber come from `villa.jpg`, which is
 * the lane the resort is held against. See `docs/art-direction.md`.
 *
 * The model it replaces had both of the faults the restaurant pass paid for.
 * Its deck was checkerboarded voxel by voxel with `(x + z) % 2` and each of its
 * four parasols was four stepped rings of two alternating colours, which is the
 * one pattern the mesher cannot merge: a 26 000-voxel deck cost more triangles
 * than the hotel's 221 000. Both are flat planes now, and the parasol is drawn
 * by the part this pass wrote rather than by hand.
 *
 * Two things about the composition are the restaurant's lesson read forwards.
 * The only tall thing on the plot is the bar, and it stands hard against the
 * back edge, because anything tall between the camera and the plot is something
 * the plot loses at the 30 degrees the resort is seen from. And the deck is a
 * `plinth` in teak rather than a deck part of its own: a plinth is already a
 * slab with a lipped top edge, which is exactly what a boarded deck with a
 * skirt is, so the part `docs/art-direction.md` had on its list turned out to
 * be one that exists.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 63;
const Z = 63;

/**
 * The deck's own surface layer: two courses of sand plus four of boards, which
 * is what the two plinths in `build` hand back. Written down here because the
 * seats are declared against it and a declaration cannot read a local, so
 * `build` checks that the two still agree.
 */
const TOP_LAYER = 6;

/** The raised deck. What is left in front of it, at +z, is beach. */
const DECK = { x: 2, z: 2, w: 60, d: 52 } as const;
const BRINK = DECK.z + DECK.d - 1;
const LEFT = DECK.x;
const RIGHT = DECK.x + DECK.w - 1;

/** Where a stool stands at the counter, five across the 7 m run. */
const STOOLS = [7, 12, 17, 22, 27] as const;

/** The bar hut: a servery wall, a counter in front of it, thatch over both. */
const BAR = { x: 5, z: 4, w: 28, d: 10 } as const;

/**
 * The counter's back row, and the eave the thatch comes down to.
 *
 * The counter is drawn on the front two rows of the hut and the stools stand
 * clear of the eave rather than under it, which is what the reference does and
 * what a camera looking down at 30 degrees needs: everything inside the eave
 * line of a roof this deep is roof, not bar.
 */
const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

/** Where the lounge sits: the back corner the bar does not take. */
const LOUNGE = { x: 38, z: 4, x1: 59, z1: 26 } as const;

/**
 * The two flights down to the sand, and how wide they are.
 *
 * Two rather than the one the restaurant's terrace takes, and set in from the
 * ends rather than centred, because this front is 15 m of open deck: a single
 * flight on the centre line would leave the daybeds either side of a gap
 * nothing crosses, and it would cut the row in half. Two flights read as the
 * two ways down onto the beach, and they break the long balustrade run into
 * three at no cost, since the run is what they are cut out of.
 */
const FLIGHTS = [10, 46] as const;
const FLIGHT_W = 6;

/**
 * Where a daybed stands: the near corner of its frame.
 *
 * Two rows rather than one. A row across the brink is what the reference deck
 * has, but it leaves the middle of a 15 m plot as bare boards, and bare boards
 * are what makes a deck read as a car park — so the second row goes in the
 * middle of the half the bar and the lounge leave, which is also where the
 * shade under the thatch runs out.
 */
/**
 * The one colour that burns after dark, and the lamp colour that goes with it.
 *
 * The same `amber.light` the taverna's lanterns are, because the two are the
 * same fitting on the same resort at the same hour, and spent in the same one
 * place: a row of them hung under the bar's eave and nowhere else. Everything
 * else amber on this plot — the parasols, the stool cushions, the towels — is
 * `amber.base`, a step off it and unlit, so the deck does not become one warm
 * smear at dusk with nothing on it reading as lit.
 */
const LANTERN = PALETTE.amber.light;

const DAYBEDS = [
  [8, 42],
  [22, 42],
  [36, 42],
  [50, 42],
  [6, 22],
  [20, 22],
  [34, 22],
] as const;

export default defineModel({
  id: 'beach-club',
  label: 'Beach Club',
  category: 'leisure',
  tiles: { x: 4, z: 4 },
  emissive: [LANTERN],
  /**
   * Eighteen people: five on stools at the counter, six round the lounge, and
   * one stretched out on each daybed.
   *
   * Three kinds of furniture and so three ways of working the numbers out, all
   * from the layer the piece is drawn on. A stool's cushion is `TOP_LAYER + 2`,
   * so hips are a layer above it and the sitter looks back at the counter at
   * -z. The sofas' cushions are `TOP_LAYER + 1` and each run is four voxels
   * deep with its back on the two rows behind, so a sitter takes the front pair
   * and faces out of it — +z off the north arm, -x off the east one. A daybed's mattress is `TOP_LAYER + 1` with the raise at its
   * -z end, so the sunbather's hips sit four voxels along from it, which lands
   * their head on it and their feet at the brink; they take the half of the bed
   * the parasol's pole does not come up through.
   */
  seats: [
    ...STOOLS.map((x) => ({ x, y: TOP_LAYER + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...[LOUNGE.x + 3, LOUNGE.x + 8, LOUNGE.x + 13].map(
      (x) => ({ x, y: TOP_LAYER + 2, z: LOUNGE.z + 2, facing: 0 }) as const,
    ),
    ...[LOUNGE.z + 8, LOUNGE.z + 14, LOUNGE.z + 20].map(
      (z) => ({ x: LOUNGE.x1 - 3, y: TOP_LAYER + 2, z, facing: 3 }) as const,
    ),
    ...DAYBEDS.map(
      ([x, z]) => ({ x: x + 2, y: TOP_LAYER + 2, z: z + 4, facing: 0, pose: 'lie' }) as const,
    ),
  ],
  /**
   * One lamp, over the counter, where the lanterns hang.
   *
   * One rather than the taverna's two: that model is two rooms and the terrace
   * would have been a dark shelf in front of a lit one, where this is a single
   * open deck whose only interior is the bar. What the deck gets after dark is
   * the spill off the bar, which is what a beach club at night looks like.
   *
   * Nine more anchors on a plot that already bakes 457. They cost bake time
   * rather than frame time — `lightGrid.ts` bakes every anchor into one
   * irradiance volume at load — and `pnpm bench` is where that shows up.
   */
  lights: [{ x: 19, y: 15, z: 12, color: LANTERN, intensity: 90, distance: 52 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, sand, stone, stucco, teak } = PALETTE;

    // The sand the whole plot is cut out of, the same two layers the bungalow
    // stands on, so that two objects on the same beach share a ground.
    const beach = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 2, stone: sand });

    /**
     * The deck. A plinth in teak is a slab with a darker lip round its top
     * edge, which is a boarded deck with a skirt and nothing else needed: four
     * layers, so the deck stands a metre over the sand and the flights down off
     * it are four treads.
     *
     * One flat colour, and this is the whole point of the pass. The deck it
     * replaces alternated two tones voxel by voxel across 3 000 cells, which
     * defeats the coplanar merge completely — one quad became three thousand.
     */
    const top = plinth(b, { ...DECK, y: beach, height: 4, stone: teak });
    if (top !== TOP_LAYER) throw new Error('The deck and its furniture must agree on its surface');
    const deck = top - 1;

    // The bar stands on its own boarded floor, a step of the ramp lighter than
    // the deck it is laid into and run out past the eave as far as the stools.
    // A plot reads as a plot because it has a ground of its own; a bar on a
    // deck the same colour as itself is a wall and some furniture.
    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, DECK.z + 1, COUNTER + 6, teak.light);

    // The servery: a low wall along the back of the bar with a plate course
    // over it, a shelf of bottles on the front of it, and the counter out
    // in front of that. Cream rather than more timber, because a bar drawn in
    // teak on a teak deck under a thatch roof is one brown mass.
    // Two metres of it, not a storey: the roof stands four courses clear above
    // the plate, so the hut is open under its eaves the way the reference is
    // and a camera looking down at it sees the counter rather than a lid on a
    // cream box.
    const wall = top + 8;
    box(BAR.x, BAR.x + BAR.w - 1, top, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, top, top + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, top + 4, top + 4, BAR.z + 2, BAR.z + 2, teak.shade);
    // Bottles along the shelf, three colours deep, which is the flower box's
    // trade at the flower box's scale: nine loose voxels are nine quads and
    // nobody's frame notices, where nine hundred across a wall would be.
    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 9; bottle++) {
      const x = BAR.x + 3 + bottle * 3;
      box(x, x, top + 5, top + 6, BAR.z + 2, BAR.z + 2, BOTTLES[bottle % BOTTLES.length]!);
    }

    // The counter, drawn the way the taverna's is — a teak body under a pale
    // stone top — so the resort has one idea of what a bar to stand at is.
    box(BAR.x, BAR.x + BAR.w - 1, top, top + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, BAR.x + BAR.w - 1, top + 4, top + 4, COUNTER, COUNTER + 1, stone.light);

    /** A stool drawn up to the counter: two legs and a cushioned seat. */
    const stool = (x: number): void => {
      box(x, x + 1, top, top + 1, COUNTER + 3, COUNTER + 4, teak.deep);
      box(x, x + 1, top + 2, top + 2, COUNTER + 3, COUNTER + 4, amber.base);
    };
    for (const x of STOOLS) stool(x);

    // Four posts under the corners of the thatch, and the roof over them. The
    // thatch is carried a good way out past the counter, which is what the
    // reference does and what keeps the stools in the shade of the hut rather
    // than in front of it.
    const eaves = top + 12;
    for (const x of [BAR.x, BAR.x + BAR.w - 1]) {
      for (const z of [BAR.z, BAR.z + BAR.d - 1]) box(x, x, top, eaves - 1, z, z, teak.base);
    }
    thatchRoof(b, { ...BAR, y: eaves, ridge: 'x', overhang: EAVE_OVERHANG });

    /**
     * A lantern hung under the eave: a pane of two voxels with a teak strap
     * above it, drawn against the thatch's lowest course so it reads as hanging
     * from the roof rather than as a stray voxel of paint in mid-air — the same
     * fitting, and the same reason for its bracket, as the taverna's piers.
     *
     * They hang over the gap between the counter and the stools, which is the
     * one line of the plot that is under a roof and in front of a wall, so the
     * light has something to fall on from both sides.
     */
    const lantern = (x: number): void => {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    };
    for (const x of [BAR.x + 4, BAR.x + 13, BAR.x + 22]) lantern(x);

    /**
     * A low sofa: a teak frame, a pale seat cushion and a back against the side
     * it leans on, capped by a rail.
     *
     * `back` is which side that is, so an L of them turns the corner without
     * either run growing a backrest into the other. The back is two courses of
     * `stucco.base` under one of teak rather than three of the seat's own
     * `stucco.light`: a 5 m run of the brightest tone in the palette reads as a
     * wall the deck is fenced with, and the rail is what gives it a top edge.
     */
    const sofa = (x0: number, x1: number, z0: number, z1: number, back: 'x+' | 'z-'): void => {
      box(x0, x1, top, top, z0, z1, teak.base);
      box(x0, x1, top + 1, top + 1, z0, z1, stucco.light);
      const [bx0, bz0] = back === 'x+' ? [x1 - 1, z0] : [x0, z0];
      const [bx1, bz1] = back === 'x+' ? [x1, z1] : [x1, z0 + 1];
      box(bx0, bx1, top + 2, top + 3, bz0, bz1, stucco.base);
      box(bx0, bx1, top + 4, top + 4, bz0, bz1, teak.shade);
    };

    // The lounge: an L round a low table, in the corner the bar leaves free.
    sofa(LOUNGE.x, LOUNGE.x1, LOUNGE.z, LOUNGE.z + 3, 'z-');
    sofa(LOUNGE.x1 - 3, LOUNGE.x1, LOUNGE.z + 4, LOUNGE.z1, 'x+');
    // The table, drawn as the taverna's is: a teak block under a lighter top
    // that stands a voxel proud of it all the way round.
    box(LOUNGE.x + 5, LOUNGE.x + 10, top, top + 1, LOUNGE.z + 10, LOUNGE.z + 15, teak.shade);
    box(LOUNGE.x + 4, LOUNGE.x + 11, top + 2, top + 2, LOUNGE.z + 9, LOUNGE.z + 16, teak.light);
    // Cushions along both runs, which is where the amber of the parasols and
    // the bar stools comes back into the shade at the back of the deck.
    for (const x of [LOUNGE.x + 3, LOUNGE.x + 15]) {
      box(x, x + 2, top + 2, top + 3, LOUNGE.z + 1, LOUNGE.z + 1, amber.base);
    }
    for (const z of [LOUNGE.z + 7, LOUNGE.z1 - 4]) {
      box(LOUNGE.x1 - 1, LOUNGE.x1 - 1, top + 2, top + 3, z, z + 2, amber.base);
    }

    /**
     * A daybed, facing the sea: a frame, a mattress, a towel across it and a
     * raised head at the -z end with a rail along the top.
     *
     * Drawn as the pool terrace's lounger is, at twice the width, so that the
     * two read as the same piece of furniture in two sizes rather than as two
     * ideas of what a resort lies down on.
     */
    const daybed = (x: number, z: number): void => {
      box(x, x + 7, top, top, z, z + 6, teak.shade);
      box(x, x + 7, top + 1, top + 1, z, z + 6, stucco.light);
      box(x, x + 7, top + 2, top + 2, z + 4, z + 4, amber.base);
      box(x, x + 7, top + 2, top + 3, z, z, stucco.light);
      box(x, x + 7, top + 4, top + 4, z, z, teak.base);
    };

    // Each under its own canvas. The parasol is the part this pass wrote: one
    // flat plane 2 m up, where the model it replaces built four stepped rings
    // of two alternating colours per canopy.
    for (const [x, z] of DAYBEDS) {
      daybed(x, z);
      parasol(b, { x: x + 4, z: z + 3, y: top });
    }

    // The deck is edged rather than left as a cliff, at the pitch the taverna's
    // is: every baluster is four quads the mesher cannot merge into the next
    // one, and nine of these stand on the plot.
    for (const x of [LEFT, RIGHT]) {
      balustrade(b, { x, z: DECK.z, y: top, w: DECK.d, along: 'z', pitch: 3, rail: teak });
    }
    const gaps = FLIGHTS.flatMap((x) => [x, x + FLIGHT_W - 1]);
    for (const [from, to] of [
      [LEFT, gaps[0]! - 1],
      [gaps[1]! + 1, gaps[2]! - 1],
      [gaps[3]! + 1, RIGHT],
    ] as const) {
      balustrade(b, {
        x: from,
        z: BRINK,
        y: top,
        w: to - from + 1,
        along: 'x',
        pitch: 3,
        rail: teak,
      });
    }
    for (const x of FLIGHTS) {
      steps(b, { x, z: BRINK + 1, w: FLIGHT_W, y: deck, treads: 4, descends: 'z+', stone: teak });
    }

    // Planting, the one high-frequency detail the lane allows: pots where the
    // eye enters the deck — the heads of both flights and the two back corners
    // — and a long green box down the back edge either side of the bar, which
    // is what keeps a 15 m run of balustrade off the skyline behind the lounge.
    for (const x of FLIGHTS) {
      for (const at of [x - 3, x + FLIGHT_W + 1]) pottedPlant(b, { x: at, z: BRINK - 2, y: top });
    }
    for (const x of [LEFT + 1, RIGHT - 2]) pottedPlant(b, { x, z: BRINK - 2, y: top });
    // One planter right along the back, where the deck has a hedge instead of
    // a rail. Planted in a single green rather than the box's usual three: a
    // 15 m run of three colours alternating voxel by voxel is bunting, and it
    // is also 60 quads where one flat course is one.
    flowerBox(b, {
      x: LEFT,
      z: DECK.z,
      y: top,
      w: DECK.w,
      along: 'x',
      blooms: [foliage.base],
    });

    // Loungers left out on the sand beyond the deck, which is what tells a
    // beach club from a deck: the beach is part of the plot, and it is the one
    // thing on it a camera looking down at the front sees past the balustrade.
    for (const x of [3, 20, 37, 54]) {
      box(x, x + 3, beach, beach, 56, 61, teak.shade);
      box(x, x + 3, beach + 1, beach + 1, 56, 61, stucco.light);
      box(x, x + 3, beach + 2, beach + 2, 59, 59, amber.base);
      box(x, x + 3, beach + 2, beach + 3, 56, 56, stucco.light);
      box(x, x + 3, beach + 4, beach + 4, 56, 56, teak.base);
    }
  },
});
