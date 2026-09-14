/**
 * Water park: a stepped tower of three storeys with a flume off each of them,
 * three straight slides falling side by side into one splash basin, a
 * switchback stair up the west flank and a row of loungers round the water.
 * 96x96 (24 x 24 m, 13 m to the pavilion's ridge), a 6x6 tile.
 *
 * Massing from `docs/references/waterslide.jpg` — a tower with a cap on top, a
 * stair climbing it, flumes coming off it and a splash pool at its foot — and
 * the colour from `villa.jpg`, which is the lane the resort is held against.
 * The water is `PALETTE.water.base` and nothing else, declared below, so the
 * basin swells and glints with the sea's own shader exactly as the pool
 * terrace does. See `docs/art-direction.md`.
 *
 * This is the model that had every fault in the book at once, and it is worth
 * saying which, because the list is the whole of what `docs/art-direction.md`
 * asks a model not to do:
 *
 * - its deck was checkerboarded `(x + z) % 2` across 76x76 cells;
 * - its water was dithered a second colour at `(x * 3 + z) % 7` on top of that,
 *   which the pool pass had already shown defeats the water merge as well as
 *   the coplanar one;
 * - its splash pool was a circle found with `Math.hypot`, and its rim a second
 *   circle found with two more of them;
 * - its tower was fifty courses of two alternating colours;
 * - and its flume was a helix — 900 samples of `cos` and `sin` spiralling down
 *   a radius that shrank as it went.
 *
 * The helix is the case the poolside bar's counter was the small version of. A
 * curve on a 25 cm grid is a staircase; a curve in three dimensions is a
 * staircase no two treads of which share a plane, so there is nothing anywhere
 * in it for the mesher to merge — every voxel of that flume was its own six
 * quads. What replaces it is three **straight** flumes, which is not a
 * concession: a straight racer is what a resort park actually builds, it reads
 * as three slides from the one angle this resort is seen at, and it is the
 * shape this grid draws for nothing.
 *
 * The plot grew from 5x5 tiles to 6x6. Depth is what the flumes needed — three
 * falling side by side want a run long enough for the tallest to come down at
 * under 45 degrees, and 37 voxels of drop wants more than 37 of run where the
 * old plot had 30 between the tower's front and its own edge. Width is what the
 * ground needed: a splash basin worth swimming in, and loungers with enough
 * deck round them to be somewhere to lie rather than a row against a fence.
 */
import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 95;

/** The deck's top layer, and the first free layer above it. */
const DECK = 3;
const TOP = 4;

/** The tower's footprint in z; the three sections divide its x between them. */
const TOWER_Z = 6;
const TOWER_D = 18;
const TOWER_FRONT = TOWER_Z + TOWER_D;

/**
 * The three sections, west to east, and the flume that leaves each.
 *
 * One storey, two and three, which is what makes the three slides three: they
 * start 3.5 m, 6.5 m and 9.5 m over the deck and land at the same place, so
 * each falls at its own pitch. The old model's one flume had to corkscrew to
 * lose its height because it started from a single platform at the top of a
 * tower with nothing under it; a stepped tower loses the height in the
 * building instead, which is both a shape this grid can draw and the reason
 * there are three of them.
 *
 * The blue one is `glass`, not `water`. A colour a model declares as water is
 * water *everywhere* in that model — the rule is in `docs/art-direction.md` —
 * so a flume painted `water.base` would be meshed into the basin's geometry
 * and come out rippling in mid-air, six metres up.
 */
const SECTIONS = [
  { x: 18, storeys: 1, flume: PALETTE.amber },
  { x: 34, storeys: 2, flume: PALETTE.bloom },
  { x: 50, storeys: 3, flume: PALETTE.glass },
] as const;

const SECTION_W = 16;

/** Where a flume leaves its section, and how wide the chute is. */
const CHUTE_INSET = 5;
const CHUTE_W = 6;

/** The run every flume has to lose its height in, and where it ends. */
const CHUTE_END = 64;

/**
 * The splash basin the three of them fall into.
 *
 * Thirty-one voxels deep rather than the nineteen it was first drawn at, which
 * is the difference between a pool and a gutter: three flumes discharging into
 * a band four metres across read as three flumes hitting a kerb, and the run-out
 * a slider actually needs is most of the length of the pool. It is also why the
 * plot grew — see the footprint note above.
 */
const BASIN = { x: 12, z: 54, w: 56, d: 31 } as const;

/**
 * The stair: one straight flight up the east flank, and the gangway off its
 * head into the top platform.
 *
 * East rather than west because the basin is 68 voxels wide and a flight has to
 * clear it, and straight rather than switchbacked because at one rise to two of
 * going a 9.5 m climb is 76 voxels of run and the plot is 96 — so the one thing
 * this plot has room for is the thing `steps` already draws. It serves the top
 * platform; the two below it are reached down the tower, which is what a
 * stepped tower is for and why the sections step.
 */
const STAIR = { x: 72, w: 6, head: 10, top: TOP + 37 } as const;

/**
 * The landing at the head of the climb: the stair's own top, the gangway west
 * off it, and the z-range both share.
 *
 * It reaches a voxel past the stair's top tread so there is somewhere to stand
 * that is not a tread, and it runs at the tower's north edge so the top
 * platform's own north rail lines up with the landing's.
 */
const LANDING = { z0: TOWER_Z, z1: 11 } as const;

/** Deck left at the foot of a connecting flight, to turn onto it from. */
const FLIGHT_LANDING = 3;

/** Where a lounger's north-west corner stands; each is 5 x 10. */
const LOUNGERS = [
  [8, 86],
  [24, 86],
  [40, 86],
  [56, 86],
  [4, 30],
  [4, 48],
  [4, 66],
] as const;

/**
 * Where a lounger's sunbather lies: the middle of the mattress, on the layer
 * above it, with their head on the raise at the lounger's own `z` end.
 *
 * A lounger here is five wide and ten long, so the figure is centred on it
 * exactly rather than half a voxel off, and the ten voxels are room enough for
 * a person and the towel folded at their feet.
 */
const LIE_ON = { x: 2, y: TOP + 2, z: 6 } as const;

/** The parasols, set between the loungers rather than over them. */
const PARASOLS = [
  [18, 90],
  [50, 90],
  [6, 40],
] as const;

/**
 * Submerged floods, the same four the pool terrace declares and the same
 * colour, because it is the same body of water lit the same way after dark.
 * Nothing paints them: the basin is simply lit.
 */
const FLOOD = 0x7fd8ee;

export default defineModel({
  id: 'waterpark',
  label: 'Waterpark',
  category: 'leisure',
  tiles: { x: 6, z: 6 },
  /** One sunbather per lounger, all of them facing down the flumes. */
  seats: LOUNGERS.map(
    ([x, z]) =>
      ({ x: x + LIE_ON.x, y: LIE_ON.y, z: z + LIE_ON.z, facing: 0, pose: 'lie' }) as const,
  ),
  water: [PALETTE.water.base],
  windows: WINDOW_GLASS,
  lights: [
    { x: 24, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 40, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 56, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 40, y: 3, z: 18, color: FLOOD, intensity: 90, distance: 52 },
  ],
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 1 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 40,
    dwellSeconds: { min: 3600, max: 10_800 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, foliage, stone, stucco, teak } = PALETTE;

    /**
     * One stone deck, four layers, the same slab the pool terrace stands on —
     * flat, and one colour. The deck it replaces alternated two tones voxel by
     * voxel over 5 776 cells, which is the one pattern the mesher cannot merge.
     */
    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });

    /**
     * The basin: one rectangle, cut with `poolWater`, holding two layers.
     *
     * A rectangle rather than the circle the model it replaces found with
     * `Math.hypot` twice over. A round basin on this grid is a staircase 240
     * treads long with a second staircase of rim outside it, and the pool pass
     * had already written the part that draws a basin properly — including the
     * round one, which this is deliberately not: a splash pool at the foot of
     * three straight flumes is a straight tank, and `shape: 'round'` is there
     * for the children's pool it is not.
     */
    const surface = poolWater(b, { ...BASIN, deck: DECK, depth: 2 });

    /**
     * A flume: a bed four voxels wide with a wall standing a voxel proud either
     * side of it, on trestles, falling fastest where it leaves the platform and
     * flattening into the water.
     *
     * The profile is squared rather than straight, which is the same fall the
     * pool's slide is cut at and what tells a flume from a flight of stairs. It
     * is a curve only in section: one voxel per column of `z`, no two of them
     * side by side, so the bed still merges down its length. A curve in *plan*
     * is what the helix was and what this model is a redrawing of.
     */
    const flume = (x0: number, from: number, paint: Ramp): void => {
      const bed0 = x0 + 1;
      const bed1 = x0 + CHUTE_W - 2;
      const drop = from - TOP;
      const run = CHUTE_END - TOWER_FRONT;
      let last = from;
      for (let step = 0; step <= run; step++) {
        const z = TOWER_FRONT + step;
        const t = step / run;
        const y = Math.round(from - drop * (2 * t - t * t));
        box(bed0, bed1, y, y, z, z, paint.base);
        box(x0, x0, y, y + 1, z, z, paint.shade);
        box(x0 + CHUTE_W - 1, x0 + CHUTE_W - 1, y, y + 1, z, z, paint.shade);
        // The underside, closed where the bed steps down, so the chute reads as
        // a tube rather than as a row of loose treads with sky between them.
        if (y < last) box(bed0, bed1, y, last - 1, z, z, paint.shade);
        last = y;
      }
      // Trestles under it, on the deck rather than in the water.
      for (const z of [TOWER_FRONT + 6, TOWER_FRONT + 16, TOWER_FRONT + 26]) {
        const t = (z - TOWER_FRONT) / run;
        const y = Math.round(from - drop * (2 * t - t * t));
        for (const post of [x0, x0 + CHUTE_W - 2])
          box(post, post + 1, TOP, y - 1, z, z + 1, teak.base);
      }
    };

    /**
     * A section of the tower: a rendered body with its skirting, string courses
     * and cornice, a boarded platform on top, a rail round the three sides the
     * flume does not leave by, and openings cut into the front.
     */
    for (const section of SECTIONS) {
      const x1 = section.x + SECTION_W - 1;
      const platform = stuccoWall(b, {
        x: section.x,
        z: TOWER_Z,
        w: SECTION_W,
        d: TOWER_D,
        y: TOP,
        storeys: section.storeys,
      });
      box(section.x, x1, platform, platform, TOWER_Z, TOWER_Z + TOWER_D - 1, teak.light);

      const rail = { y: platform + 1, height: 4, pitch: 3, rail: teak } as const;
      balustrade(b, { ...rail, x: section.x, z: TOWER_Z, w: SECTION_W, along: 'x' });
      const chute = section.x + CHUTE_INSET;
      balustrade(b, {
        ...rail,
        x: section.x,
        z: TOWER_FRONT - 1,
        w: CHUTE_INSET,
        along: 'x',
      });
      balustrade(b, {
        ...rail,
        x: chute + CHUTE_W,
        z: TOWER_FRONT - 1,
        w: x1 - (chute + CHUTE_W) + 1,
        along: 'x',
      });
      if (section.x === SECTIONS[0]!.x)
        balustrade(b, { ...rail, x: section.x, z: TOWER_Z, w: TOWER_D, along: 'z' });
      if (section.x === SECTIONS[SECTIONS.length - 1]!.x) {
        // The east edge is where the gangway arrives, so the rail stops short
        // of it. A balustrade run straight across the one way onto the top
        // platform is a fence at the head of a nine-metre climb.
        balustrade(b, {
          ...rail,
          x: x1,
          z: LANDING.z1 + 1,
          w: TOWER_Z + TOWER_D - LANDING.z1 - 1,
          along: 'z',
        });
      }

      for (const along of [section.x + 2, x1 - 4]) {
        shutteredWindow(b, { face: 'z+', at: TOWER_FRONT - 1, along, y: TOP + 4 });
      }

      flume(chute, platform, section.flume);
    }

    /**
     * The two flights that connect the platforms, on the tower's north strip.
     *
     * Without them the stair goes to the top deck and stops: you could reach
     * the biggest flume and neither of the others, which is not a tower, it is
     * three separate towers that happen to touch. A stepped tower is meant to
     * be walked down, so it has to have the steps.
     *
     * It starts three voxels in from the platform's own edge rather than on
     * it, which is the landing you turn onto: a flight whose bottom tread is
     * the last voxel of the deck is a flight you step off into the air.
     *
     * Twelve of rise over the twelve that leaves is steeper than the
     * catalogue's one-in-two — it is one-in-one, every tread rising a voxel —
     * and it is drawn solid rather than open for the
     * same reason `steps` was right for a terrace and wrong for the long
     * flight: at sixteen voxels a solid stepped block is a stair on a terrace,
     * and it is cheaper than the open one. In stone rather than teak, and four
     * voxels deep rather than six, because a flight that climbs a storey up the
     * side of the next section is part of the building — drawn in the decks'
     * timber at the decks' width it read as a buttress bolted to it. Inset a
     * voxel off the north edge so the platform keeps its rail.
     */
    const flight = (x0: number, x1: number, low: number, high: number): void => {
      const z0 = TOWER_Z + 1;
      const z1 = z0 + 3;
      const span = x1 - x0;
      for (let x = x0; x <= x1; x++) {
        const y = low + Math.round(((high - low) * (x - x0)) / span);
        box(x, x, low, y - 1, z0, z1, stone.base);
        box(x, x, y, y, z0, z1, stone.light);
        // A rail three voxels over the tread, teak on stone the way every
        // terrace in the catalogue is, on **both** sides: a flight up the
        // middle of a platform is open air to the north and a twelve-voxel
        // drop to the south, and one handrail only protects one of them.
        for (const side of [z0, z1]) {
          box(x, x, y + 3, y + 3, side, side, teak.base);
          if ((x - x0) % 4 === 0) box(x, x, y + 1, y + 2, side, side, teak.base);
        }
      }
    };
    for (let step = 0; step < SECTIONS.length - 1; step++) {
      const lower = SECTIONS[step]!;
      const upper = SECTIONS[step + 1]!;
      flight(
        lower.x + FLIGHT_LANDING,
        upper.x - 1,
        TOP + lower.storeys * 12 + 1,
        TOP + upper.storeys * 12 + 1,
      );
    }

    /**
     * The cap: a small rendered pavilion on the top platform under a hipped
     * roof, which is where the reference's tower ends and what stops a stepped
     * block from reading as an unfinished wall.
     *
     * It is the resort's own roof — same part, same tile — 13 m up, which makes
     * this the tallest thing in the catalogue after the hotel and the one thing
     * on the plot meant to be seen from the far side of it.
     */
    const cap = { x: 53, z: 9, w: 10, d: 10 } as const;
    const capTop = stuccoWall(b, { ...cap, y: TOP + 36 + 1, storeys: 1, quoins: false });
    hipRoof(b, { ...cap, y: capTop, overhang: 2 });

    /**
     * The stair: four flights switchbacking up the west flank, each ten treads
     * at the catalogue's one rise to two of going.
     *
     * Beside the tower rather than wrapped round it. The model it replaces ran
     * its stair up the outside as a stringer with treads hung off it at
     * `28 - (i % 3) * 2`, which is a flight that steps sideways every third
     * tread for no reason a climber would recognise. Four straight flights and
     * three landings is what a tower this tall has, and `steps` already draws
     * one.
     */
    const rise = STAIR.top - TOP;
    for (let tread = 0; tread <= rise; tread++) {
      const y = TOP + tread;
      const z = STAIR.head + (rise - tread) * 2;
      box(STAIR.x, STAIR.x + STAIR.w - 1, y, y, z, z + 1, stone.base);
      for (const side of [STAIR.x, STAIR.x + STAIR.w - 1]) {
        // The stringer, one voxel under the nosing, carrying the flight down
        // its own line; a post to the deck every sixth tread; and the handrail
        // a metre over the tread, which is the height the terraces' coping is.
        box(side, side, y - 1, y - 1, z, z + 1, stone.shade);
        box(side, side, y + 4, y + 4, z, z + 1, teak.base);
        if (tread % 3 === 0) box(side, side, y + 1, y + 3, z, z, teak.base);
        if (tread % 6 === 0 && tread > 0) box(side, side, TOP, y - 2, z, z, teak.base);
      }
    }
    /**
     * The head of the flight: a landing, the gangway west off it onto the top
     * platform, and a rail round every side of the two that is not a way on or
     * off them.
     *
     * The back of the landing and its east end are railed because they are the
     * two sides of the head of a nine-metre climb that are otherwise a step
     * into the air; the gangway's south side is railed for the same reason.
     * What is left open is the gangway's west end, which is the top platform,
     * and the landing's south edge, which is the stair.
     */
    const gangway = SECTIONS[SECTIONS.length - 1]!.x + SECTION_W;
    box(STAIR.x, STAIR.x + STAIR.w - 1, STAIR.top, STAIR.top, LANDING.z0, LANDING.z1, stone.base);
    box(gangway, STAIR.x - 1, STAIR.top, STAIR.top, LANDING.z0, LANDING.z1, teak.light);
    const head = { y: STAIR.top + 1, height: 4, pitch: 3, rail: teak } as const;
    balustrade(b, {
      ...head,
      x: gangway,
      z: LANDING.z0,
      w: STAIR.x + STAIR.w - gangway,
      along: 'x',
    });
    balustrade(b, {
      ...head,
      x: STAIR.x + STAIR.w - 1,
      z: LANDING.z0,
      w: LANDING.z1 - LANDING.z0 + 1,
      along: 'z',
    });
    balustrade(b, { ...head, x: gangway, z: LANDING.z1, w: STAIR.x - gangway, along: 'x' });

    /**
     * A lounger: a teak frame, a mattress on it, a back raised at the head and a
     * folded towel at the foot.
     *
     * The pool terrace's loungers are a model of their own that the layout
     * stands in rows beside it; this plot draws its own, because a water park
     * is one object rather than a terrace with props laid on it, and because
     * the row wants to follow the basin rather than the street.
     */
    const lounger = (x: number, z: number): void => {
      box(x, x + 4, TOP, TOP, z, z + 9, teak.shade);
      box(x, x + 4, TOP + 1, TOP + 1, z + 3, z + 9, stucco.light);
      box(x, x + 4, TOP + 1, TOP + 2, z + 1, z + 2, stucco.light);
      box(x, x + 4, TOP + 3, TOP + 3, z, z + 1, stucco.light);
      box(x + 1, x + 3, TOP + 2, TOP + 2, z + 8, z + 9, amber.base);
    };
    for (const [x, z] of LOUNGERS) lounger(x, z);
    for (const [x, z] of PARASOLS) parasol(b, { x, z, y: TOP, reach: 3 });

    // A ladder out of the basin, the pool terrace's own fitting, on the south
    // rim rather than the north one: the north rim is where three flumes come
    // down, and a ladder is not a thing to climb out under a slide.
    const rim = BASIN.z + BASIN.d;
    for (const x of [22, 54]) {
      for (const rail of [x, x + 3]) {
        box(rail, rail, TOP, TOP + 3, rim, rim, PALETTE.metal.base);
        box(rail, rail, TOP + 3, TOP + 3, rim - 1, rim - 1, PALETTE.metal.base);
      }
      for (const rung of [TOP, TOP + 2])
        box(x + 1, x + 2, rung, rung, rim, rim, PALETTE.metal.base);
    }

    // Planting, at the corners the eye enters the plot by and down the two
    // flanks the loungers do not take, one green rather than three: a long run
    // of alternating colour is bunting, and it is a quad a voxel.
    for (const x of [1, X - 2]) {
      for (const z of [1, Z - 2]) pottedPlant(b, { x, z, y: TOP });
    }
    for (const z of [TOWER_FRONT + 6, TOWER_FRONT + 26]) {
      flowerBox(b, { x: 82, z, y: TOP, w: 12, along: 'z', blooms: [foliage.base] });
      flowerBox(b, { x: X - 3, z, y: TOP, w: 12, along: 'z', blooms: [foliage.base] });
    }

    // The rim the three flumes pour over, a course of pale stone standing proud
    // of the coping so the end of the run reads as an edge rather than as the
    // bed simply stopping.
    box(BASIN.x, BASIN.x + BASIN.w - 1, surface, surface, BASIN.z, BASIN.z, stone.light);
  },
});
