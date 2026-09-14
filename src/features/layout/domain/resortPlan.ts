/**
 * The resort plot: where every object stands, and how the streets are wired.
 *
 * This is data, not code — one authored plan for the whole resort, in tiles.
 * `resortLayout.ts` turns it into placements, routes the path network from the
 * node/edge graph below, grows a spur from every building to the nearest path,
 * and dresses the path edges with lamps and hedges. The unit tests assert the
 * invariants the plan has to satisfy (nothing overlaps, nothing leaves the plot,
 * every object is reachable, the network is one connected piece).
 *
 * Unlike the first milestone the plan no longer paves whole rectangles of the
 * plot: it names a handful of streets and lets everything else be a short spur.
 * That is what makes the resort read as a resort rather than as a car park —
 * a cottage village is reached by one lane, not by paving between the cottages.
 *
 * North is at the top (z = 0), so both gates sit on the promenade's ends. The
 * plot is a grid of eight districts across and six bands down, separated by the
 * promenade, two ring lanes, six service lanes and five cross streets:
 *
 * ```
 *          A     B  │  C       D  │  E       F     G       H
 *                   │ prom-       │
 *                   │ enade       │
 *                    ┌─┐ gate ┌─┐
 *   hotels  villas   │ shops  │ shops   hotel   shops   hotel    <- north st  (z 10)
 *   ────────────────────────────────────────────────────────────
 *   cottage houses   │ pool   │ villas  tennis  pool    villas
 *   village lodging  │ quarter│ lodging lodging quarter lodging  <- avenue    (z 36)
 *                    └fountain┘
 *   tennis  lodging  │ two    │ pool    villas  golf    courts
 *   minigolf spa     │ pools  │ lodging lodging lodging lodging  <- south st  (z 60)
 *   ────────────────────────────────────────────────────────────
 *   courts  pool     │ shops  │ shops   villas  shops   villas
 *   minigolf         │minigolf│ minigolf tennis minigolf tennis  <- south lane (z 74)
 *   ────────────────────────────────────────────────────────────
 *   lodging pool     │ villas │ pool    courts  golf    lodging
 *   play    quarter  │ lodging│ lodging minigolf lodging pool     <- south lane (z 90)
 *                    ┌─┐ gate ┌─┐
 *   hotels  villas   │ shops  │ shops   hotel   shops   hotel
 * ```
 *
 * Objects are laid out inside the districts, never on a street: columns run
 * x 3-14, 16-28, 30-41, 44-56, 58-70, 72-81, 83-95 and 97-109, bands run
 * z 1-8, 11-34, 37-58, 61-72, 75-88 and 91-98. The gaps between them are what
 * the street graph below occupies.
 *
 * The east wing (G, H) and the two southern bands were added to price a larger
 * resort on the same pipeline: nothing outside this file changed to grow it.
 */

import type { ShoreSpec } from './shoreline';
import type { ElevationSpec } from './elevation';
import type { Rotation } from './rotation';
import type { TerrainEdit } from './terrain';

/** One object standing on the plot, anchored at its north-west tile. */
export interface ResortPlot {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  /**
   * Quarter turns the object stands at; unturned when the plan says nothing.
   *
   * An odd turn swaps the object's footprint, so the tile coordinates above
   * still anchor it at its north-west corner but a 2x3 cottage turned once
   * covers 3x2 tiles from there. This plan leaves every object unturned, which
   * is deliberate: it is the plot a `?bench=1` run measures, and a run is only
   * comparable with the one before it if the scene has not moved. The generated
   * plots are where the resort stops facing one way — see `resortGenerator.ts`.
   */
  readonly rotation?: Rotation;
}

/** A junction the streets are strung between. */
export interface PathNode {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

/** Which leg of the L an edge walks first. */
export type Bend = 'x-first' | 'z-first';

/** A street: an orthogonal run between two nodes, optionally more than one tile wide. */
export interface PathEdge {
  readonly from: string;
  readonly to: string;
  /** Width in tiles, grown symmetrically around the run. Defaults to 1. */
  readonly width?: number;
  /** Defaults to `"x-first"`; only matters for a diagonal edge. */
  readonly bend?: Bend;
  /**
   * Whether this run carries on over the water instead of stopping at it.
   *
   * Off by default, and that default is the one that matters: a street graph
   * strung corner to corner over a plot with a bay in one corner is the normal
   * case, and what a promenade wants there is to stop at the sand rather than to
   * pave a causeway across the water. So a street ends at the tideline unless it
   * says otherwise, and a run that says otherwise is a **pier** — its tiles over
   * the water come out as `jetty`, exactly as its tiles on sand come out as
   * `boardwalk`. See `resortLayout.ts`, and `resortGenerator.ts` for the two
   * lanes a generated plot runs out to sea.
   */
  readonly overWater?: boolean;
}

/** An inclusive rectangle paved wholesale — a plaza or a deck. */
export interface Plaza {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface ResortPlan {
  /** Plot size in tiles; every plot, node and street must fit inside it. */
  readonly tilesX: number;
  readonly tilesZ: number;
  /** The object laid on each tile position. */
  readonly plots: readonly ResortPlot[];
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
  /**
   * Squares paved in full. A tile an object stands on is never paved, which is
   * how the fountain sits in the middle of its plaza without severing it.
   */
  readonly plazas: readonly Plaza[];
  /**
   * Where the plot meets the sea, if it does at all: its southern end.
   *
   * Absent means the plot is land to its edges, which is what the authored plan
   * below is: it is the plot a `?bench=1` run measures, and a run is only
   * comparable with the one before it if the scene has not moved. Generated
   * plots carry a shore — see `resortGenerator.ts`.
   */
  readonly shore?: ShoreSpec;
  /**
   * How the land rises behind the beach, if it rises at all.
   *
   * Absent means the plot is flat, which is what the authored plan below is, for
   * the same reason it has no shore: it is the plot a `?bench=1` run measures.
   * See `elevation.ts` for what a terrace is and what a plan carrying them has
   * to satisfy.
   */
  readonly elevation?: ElevationSpec;
  /**
   * Tiles whose ground is not what the coast and the terraces above would make
   * of them: the rivers, the lakes and the islands.
   *
   * Absent on the authored plan and on every generated resort, and that is the
   * point of it being a list rather than another spec. A coast and a hill are
   * lines strung across the plot, and there is no line that means "this one tile
   * is a lake" — so ground that is *built* rather than grown travels as the
   * tiles it changed. A bare plot carries the river it was handed here, and the
   * terrain tool writes into the same layer. See `terrain.ts`.
   */
  readonly terrain?: readonly TerrainEdit[];
  /**
   * Whether every catalogue type is meant to stand somewhere on this plan.
   *
   * True by default, and true of the authored plan: a type in the catalogue that
   * the plan forgot is a mistake, and `layoutResort` says so rather than letting
   * the object quietly go missing from the showcase. A generated plot too small
   * to hold one of everything, and an empty plot, are not mistakes — they set
   * this false and are laid out as they are.
   */
  readonly standsWholeCatalogue?: boolean;
}

/** The object type the path network is built from; it needs no plot of its own. */
export const PATH_ID = 'path';

/** The paving a path is laid with where it crosses sand. */
export const BOARDWALK_ID = 'boardwalk';

/** The paving a path is laid with where it climbs a terrace step. */
export const STAIRS_ID = 'stairs';

/** The paving a path is laid with where it runs out over the sea. */
export const JETTY_ID = 'jetty';

/**
 * The paving a path is laid with where it crosses a river or a lake.
 *
 * The counterpart of the jetty and not the same thing: a pier is decking walked
 * *out* from a shore and lying on it, and a bridge is a deck carried *across*
 * and standing a metre above it. The sea and the water inland are two different
 * grounds — see `terrain.ts` — and which of the two a tile of water gets is the
 * only paving question the sea answers differently from a river.
 */
export const BRIDGE_ID = 'bridge';

/**
 * The end of a crossing: the tile that climbs off the bank to the bridge's deck.
 *
 * A bridge is the one paving that stands *above* the ground it is laid on, so a
 * crossing has ends the way a pier does not — and an end is a different model
 * from a middle, turned to face the shore it comes off. See `spans.ts` for the
 * rule and `voxel-gen/models/bridge-ramp.ts` for the climb.
 */
export const BRIDGE_RAMP_ID = 'bridge-ramp';

/**
 * Every kind of paving a path network is laid with, flights, piers and spans
 * included.
 *
 * The six are interchangeable per tile — which one a tile gets is a fact about
 * the ground under it — so everything that treats "a tile of paving" as one
 * thing reads this: the plot's own list of paved tiles, and the paving tool that
 * swaps one for another as a path crosses a step or leaves the shore.
 */
export const PAVING_IDS: ReadonlySet<string> = new Set([
  PATH_ID,
  BOARDWALK_ID,
  STAIRS_ID,
  JETTY_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
]);

/** The object types the layout scatters along the paths on its own. */
export const LAMP_ID = 'street-lamp';
export const HEDGE_ID = 'hedge';

/**
 * The seat the layout stands along the paths, facing whichever one it is beside.
 *
 * Scattered rather than planned for the reason the lamps are: a bench belongs
 * *to* a path, not to a district, and the layout is the one thing that knows
 * where the paths ended up — on a generated plot as much as on this one. It is
 * also what makes every bench reachable by construction, which matters here in
 * a way it does not for a lamp: somebody has to be able to walk to a seat and
 * sit on it. See `crowd/domain/walkNetwork.ts`.
 *
 * Nothing to do with `?bench=1`, which is the benchmark.
 */
export const BENCH_ID = 'bench';

/**
 * The hut that hires the bay's pedalos out.
 *
 * Not a derived id — the plan places one like any other object, and the layout
 * lays nothing of the sort itself. It is named here because it is the one
 * catalogue entry two features outside the layout have to find by name: the
 * generator holds it to the shore (see `SHORE_ONLY`), and the bay steers its
 * hire craft home to wherever it ended up standing (see `features/sea/`). Two
 * copies of a string literal is exactly how a rename goes quietly wrong.
 */
export const PEDALO_RENTAL_ID = 'pedalo-rental';

/** The rail stood along a path's edge where the ground beside it drops away. */
export const RAILING_ID = 'railing';

/** The rail stood along a pier's edge, which carries a lantern the terrace rail does not. */
export const PIER_RAILING_ID = 'pier-railing';

/** The balustrade stood up both flanks of a flight of stairs. */
export const STAIR_RAILING_ID = 'stair-railing';

/** The parapet stood along an open edge of a bridge's level deck. */
export const BRIDGE_RAILING_ID = 'bridge-railing';

/**
 * The parapets up the two flanks of a bridge ramp, as you look up the climb from
 * the bank. Two models because one is the other's mirror; see
 * `voxel-gen/models/bridge-ramp-railing-left.ts`.
 */
export const BRIDGE_RAMP_RAILING_LEFT_ID = 'bridge-ramp-railing-left';
export const BRIDGE_RAMP_RAILING_RIGHT_ID = 'bridge-ramp-railing-right';

/**
 * Every type the layout lays for itself, and so every type a plan must not.
 *
 * One list rather than five: a plan may not place these, the generator may not
 * pick them, `layoutResort` does not hold a plan to having planted them, and the
 * tests that assert all three read it from here. Adding a fourth kind of paving
 * used to mean finding four copies of the same array.
 */
export const DERIVED_IDS: ReadonlySet<string> = new Set([
  PATH_ID,
  BOARDWALK_ID,
  STAIRS_ID,
  JETTY_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  LAMP_ID,
  HEDGE_ID,
  BENCH_ID,
  RAILING_ID,
  PIER_RAILING_ID,
  STAIR_RAILING_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
]);

const at = (id: string, tileX: number, tileZ: number): ResortPlot => ({ id, tileX, tileZ });

/** A run of one object type along x. */
const row = (id: string, tileX: number, tileZ: number, count: number, step: number): ResortPlot[] =>
  Array.from({ length: count }, (_, i) => at(id, tileX + i * step, tileZ));

/** A block of one object type, `cols` across and `rows` down. */
function block(
  id: string,
  tileX: number,
  tileZ: number,
  cols: number,
  rows: number,
  stepX: number,
  stepZ: number,
): ResortPlot[] {
  const plots: ResortPlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) plots.push(at(id, tileX + c * stepX, tileZ + r * stepZ));
  }
  return plots;
}

export const RESORT_PLAN: ResortPlan = {
  tilesX: 112,
  tilesZ: 100,
  standsWholeCatalogue: true,

  plots: [
    // ── the two gates, on the ends of the promenade ──────────────────────────
    at('entrance', 42, 0),
    at('entrance', 42, 99),

    // ═══ north strip (z 1-8): the arrival frontage ═══════════════════════════

    // A — the hotel block
    at('hotel', 3, 1),
    ...row('cypress', 4, 6, 3, 4),
    at('flowerbed', 6, 8),

    // B — villas and a townhouse
    at('villa', 16, 1),
    at('villa', 21, 1),
    at('house', 26, 1),
    at('statue', 18, 6),
    at('flowerbed', 22, 6),
    at('olive', 26, 6),

    // C — the west shops
    at('supermarket', 30, 1),
    at('restaurant', 35, 1),
    at('icecream', 40, 1),
    at('snack-bar', 40, 3),
    at('restrooms', 30, 5),
    at('game-hall', 32, 5),
    at('first-aid', 36, 5),
    at('coffee-shop', 39, 5),

    // D — services
    at('spa-pavilion', 44, 1),
    at('resort-bar', 48, 1),
    at('game-hall', 52, 1),
    at('first-aid', 44, 4),
    at('restrooms', 47, 4),
    at('snack-bar', 50, 4),
    at('tikitorch', 56, 1),
    // Check-in and a bakery right inside the north gate, where guests arrive.
    at('reception', 44, 6),
    at('bakery', 49, 7),

    // E — the east shops
    at('supermarket', 58, 1),
    at('restaurant', 63, 1),
    at('statue', 68, 1),
    at('snack-bar', 58, 5),
    at('icecream', 61, 5),
    at('restrooms', 63, 5),
    at('coffee-shop', 65, 5),
    at('palm', 68, 4),

    // F — the second hotel
    at('hotel', 72, 1),
    at('blossom', 74, 6),
    at('blossom', 78, 6),
    at('flowerbed', 76, 8),
    at('litter-bin', 72, 7),
    at('sign-post', 73, 7),
    at('picnic-table', 79, 7),
    at('lifeguard-tower', 81, 6),

    // G — the east-wing shops
    at('supermarket', 83, 1),
    at('restaurant', 88, 1),
    at('icecream', 93, 1),
    at('snack-bar', 93, 3),
    at('restrooms', 83, 5),
    at('game-hall', 85, 5),
    at('first-aid', 89, 5),
    at('palm', 93, 5),
    at('flowerbed', 93, 7),

    // H — the third hotel
    at('hotel', 97, 1),
    at('olive', 99, 6),
    at('olive', 103, 6),
    at('statue', 105, 6),
    at('flowerbed', 101, 7),

    // ═══ upper band (z 11-34): lodging, the pools, a minigolf ════════════════

    // A — the cottage village, reached by one lane
    ...block('cottage', 3, 11, 4, 2, 3, 4),
    ...row('bungalow', 3, 19, 3, 4),
    at('tennis-court', 3, 25),

    // B — houses, bungalows and cottages down the lane
    ...row('house', 16, 11, 4, 3),
    ...row('bungalow', 16, 15, 3, 4),
    ...row('cottage', 16, 19, 4, 3),
    at('playground', 16, 28),
    at('kids-club', 20, 28),

    // C — the pool quarter
    at('swimming-pool', 30, 11),
    at('poolside-bar', 38, 11),
    at('tikitorch', 40, 11),
    at('changing-cabins', 38, 14),
    at('beach-shower', 40, 14),
    ...row('sun-lounger', 30, 18, 4, 1),
    ...row('beach-umbrella', 34, 18, 2, 2),
    at('willow', 39, 17),
    at('beach-club', 30, 20),
    at('resort-bar', 37, 20),
    ...row('cottage', 30, 28, 4, 3),

    // D — a minigolf course and the second pool
    at('minigolf', 44, 11),
    at('villa', 53, 11),
    at('tikitorch', 55, 16),
    ...row('bungalow', 44, 19, 3, 4),
    at('swimming-pool', 44, 23),
    at('poolside-bar', 53, 23),
    at('palm', 55, 23),
    ...row('sun-lounger', 44, 30, 4, 1),
    at('changing-cabins', 53, 26),
    at('beach-shower', 55, 26),
    // The hire hut. It belongs on sand and this plan has none — it is the plot a
    // `?bench=1` run measures, and that plot is land to its edges — so it stands
    // by the pool here, which is the nearest thing to a shore the authored
    // resort has. A generated plot puts it where it goes; see `SHORE_ONLY` in
    // `resortGenerator.ts`.
    at('pedalo-rental', 53, 29),

    // E — the beach club and the villa quarter
    at('beach-club', 58, 11),
    at('villa', 65, 11),
    at('tikitorch', 69, 11),
    at('villa', 58, 17),
    at('villa', 63, 17),
    ...row('house', 58, 22, 4, 3),
    ...row('bungalow', 58, 26, 3, 4),
    at('basketball-court', 60, 29),

    // F — courts and the east lodging
    at('tennis-court', 72, 11),
    at('pine', 72, 17),
    ...row('bungalow', 74, 17, 2, 4),
    ...row('cottage', 72, 21, 3, 3),
    ...row('house', 72, 25, 3, 3),
    at('statue', 81, 21),

    // G — the east pool quarter
    at('swimming-pool', 83, 11),
    at('poolside-bar', 91, 11),
    at('tikitorch', 93, 11),
    at('changing-cabins', 91, 14),
    at('beach-shower', 93, 14),
    ...row('sun-lounger', 83, 18, 4, 1),
    at('beach-club', 83, 20),
    at('resort-bar', 90, 20),
    at('palm', 94, 20),
    ...row('cottage', 83, 26, 4, 3),
    ...row('bungalow', 83, 30, 3, 4),

    // H — the east villa quarter
    at('villa', 97, 11),
    at('villa', 102, 11),
    at('tikitorch', 107, 11),
    at('villa', 97, 16),
    at('villa', 102, 16),
    at('statue', 107, 16),
    ...row('house', 97, 21, 4, 3),
    ...row('bungalow', 97, 25, 3, 4),
    ...row('cottage', 97, 29, 4, 3),
    at('cypress', 109, 21),

    // ═══ lower band (z 37-58): courts, spa, pools ════════════════════════════

    // A — courts and the family corner
    at('tennis-court', 3, 37),
    at('pine', 13, 37),
    at('minigolf', 3, 43),
    at('palm', 13, 43),
    ...row('cottage', 3, 51, 4, 3),
    at('volleyball', 3, 55),
    at('bungalow', 10, 55),

    // B — lodging above the spa quarter
    ...row('house', 16, 37, 4, 3),
    ...row('bungalow', 16, 41, 3, 4),
    at('game-hall', 16, 45),
    at('spa-pavilion', 21, 45),
    at('first-aid', 24, 45),
    at('statue', 27, 45),
    at('minigolf', 16, 50),
    at('playground', 25, 50),
    at('gym-pavilion', 25, 54),

    // C — the third pool and a court
    at('swimming-pool', 30, 37),
    at('poolside-bar', 38, 37),
    at('tikitorch', 40, 37),
    ...row('sun-lounger', 38, 40, 4, 1),
    ...row('cottage', 30, 44, 4, 3),
    at('volleyball', 30, 48),
    at('resort-bar', 37, 48),

    // D — the south beach club and its villas
    at('beach-club', 45, 37),
    at('resort-bar', 51, 37),
    at('tikitorch', 55, 37),
    at('villa', 44, 43),
    at('villa', 49, 43),
    ...row('house', 44, 48, 4, 3),
    ...row('bungalow', 44, 52, 3, 4),

    // E — the east pool and more lodging
    at('swimming-pool', 58, 37),
    at('villa', 66, 37),
    ...row('cottage', 58, 44, 4, 3),
    ...row('bungalow', 58, 48, 3, 4),
    at('beach-club', 58, 52),
    at('resort-bar', 65, 52),

    // F — the far-east villas
    at('villa', 72, 37),
    at('villa', 77, 37),
    at('olive', 72, 41),
    ...row('house', 72, 43, 3, 3),
    ...row('cottage', 72, 47, 3, 3),
    ...row('bungalow', 72, 51, 2, 4),

    // G — a minigolf course and its lodging
    at('minigolf', 83, 37),
    at('villa', 92, 37),
    at('tikitorch', 92, 41),
    ...row('cottage', 83, 45, 4, 3),
    ...row('bungalow', 83, 49, 3, 4),
    at('beach-club', 83, 53),
    at('resort-bar', 90, 53),
    at('blossom', 93, 53),
    at('playground', 90, 56),

    // H — the east courts and lodging
    at('tennis-court', 97, 37),
    at('oak', 107, 37),
    at('minigolf', 97, 43),
    at('playground', 106, 43),
    at('statue', 109, 47),
    ...row('house', 97, 51, 4, 3),
    ...row('cottage', 97, 55, 4, 3),

    // ═══ south strip (z 61-72): courts, the second shops, the south gate ═════

    // A — courts and a beach court
    at('tennis-court', 3, 61),
    at('volleyball', 3, 67),
    at('playground', 10, 67),
    at('pine', 13, 61),
    at('palm', 13, 65),
    at('flowerbed', 13, 71),

    // B — the south pool and its services
    at('swimming-pool', 16, 61),
    at('game-hall', 24, 61),
    at('first-aid', 25, 65),
    at('fountain', 17, 68),
    at('statue', 20, 68),
    at('spa-pavilion', 22, 68),
    at('restrooms', 26, 68),

    // C — the south shops
    at('supermarket', 30, 61),
    at('restaurant', 35, 61),
    at('snack-bar', 30, 65),
    at('icecream', 33, 65),
    at('restrooms', 35, 65),
    at('resort-bar', 38, 65),
    at('coffee-shop', 30, 68),
    at('playground', 36, 68),

    // D — the south courts and a beach court
    at('tennis-court', 44, 61),
    at('spa-pavilion', 54, 61),
    at('first-aid', 54, 64),
    at('volleyball', 44, 67),
    at('beach-club', 50, 67),
    at('palm', 56, 67),

    // E — the south-east shops
    at('supermarket', 58, 61),
    at('restaurant', 63, 61),
    at('game-hall', 67, 61),
    at('snack-bar', 58, 65),
    at('icecream', 61, 65),
    at('restrooms', 63, 65),
    at('playground', 58, 68),
    at('coffee-shop', 63, 68),

    // F — the south-east villas and courts
    at('villa', 72, 61),
    at('villa', 77, 61),
    at('tennis-court', 72, 66),
    at('oak', 81, 61),
    at('cypress', 81, 66),

    // G — the east-wing shops
    at('supermarket', 83, 61),
    at('restaurant', 88, 61),
    at('game-hall', 92, 61),
    at('snack-bar', 83, 65),
    at('icecream', 86, 65),
    at('restrooms', 88, 65),
    at('first-aid', 90, 65),
    at('coffee-shop', 83, 68),
    at('playground', 89, 68),
    at('palm', 94, 68),

    // H — villas and the far-east court
    at('villa', 97, 61),
    at('villa', 102, 61),
    at('cypress', 107, 61),
    at('tennis-court', 97, 66),
    at('olive', 107, 66),
    at('flowerbed', 107, 69),

    // ═══ south band (z 75-88): lodging, the last pools and parks ═════════════

    // A — lodging above the family corner
    ...row('house', 3, 75, 4, 3),
    ...row('bungalow', 3, 79, 3, 4),
    ...row('cottage', 3, 82, 4, 3),
    at('playground', 3, 86),
    at('game-hall', 8, 85),
    at('palm', 12, 86),
    at('flowerbed', 12, 88),

    // B — the south pool quarter
    at('swimming-pool', 16, 75),
    at('poolside-bar', 24, 75),
    at('tikitorch', 26, 75),
    ...row('sun-lounger', 24, 78, 4, 1),
    at('beach-club', 16, 81),
    at('resort-bar', 22, 81),
    at('palm', 25, 81),
    ...row('bungalow', 16, 86, 3, 4),
    at('statue', 28, 86),

    // C — villas over a row of services
    at('villa', 30, 75),
    at('villa', 35, 75),
    at('cypress', 40, 75),
    ...row('cottage', 30, 80, 4, 3),
    at('first-aid', 30, 87),
    at('restrooms', 33, 87),
    at('snack-bar', 36, 87),
    at('icecream', 39, 87),
    at('palm', 40, 87),

    // D — a pool and the spa row
    at('swimming-pool', 44, 75),
    at('villa', 52, 75),
    at('tikitorch', 56, 75),
    ...row('house', 44, 81, 4, 3),
    at('statue', 56, 81),
    at('olive', 56, 85),
    at('spa-pavilion', 44, 87),
    at('first-aid', 48, 87),
    at('restrooms', 51, 87),
    at('snack-bar', 54, 87),
    at('palm', 56, 87),

    // E — the south courts
    at('tennis-court', 58, 75),
    at('oak', 68, 75),
    at('minigolf', 58, 81),
    at('playground', 67, 81),
    at('statue', 69, 85),

    // F — villas and lodging
    at('villa', 72, 75),
    at('villa', 77, 75),
    at('pine', 81, 75),
    ...row('house', 72, 80, 3, 3),
    at('olive', 81, 80),
    ...row('bungalow', 72, 84, 2, 4),
    at('flowerbed', 81, 84),

    // G — a minigolf course and the last pool
    at('minigolf', 83, 75),
    at('villa', 92, 75),
    at('tikitorch', 92, 79),
    at('statue', 95, 81),
    at('swimming-pool', 83, 83),
    at('poolside-bar', 91, 83),
    at('palm', 93, 83),
    ...row('sun-lounger', 91, 86, 4, 1),

    // H — the south-east beach club and its lodging
    at('beach-club', 97, 75),
    at('resort-bar', 103, 75),
    at('cypress', 106, 75),
    at('statue', 109, 80),
    ...row('house', 97, 81, 4, 3),
    ...row('cottage', 97, 85, 4, 3),
    at('palm', 109, 84),

    // ═══ south strip (z 91-98): the departure frontage, mirroring the north ══
    //
    // Mirrored properly: the planting sits against the street and the blocks
    // against the plot edge, so every spur here is three tiles straight up
    // rather than a lane running the width of the strip.

    // A — the southern hotel block
    at('flowerbed', 6, 91),
    ...row('cypress', 4, 92, 3, 4),
    at('hotel', 3, 94),

    // B — villas and a townhouse
    at('statue', 18, 92),
    at('flowerbed', 22, 92),
    at('palm', 26, 92),
    at('villa', 16, 95),
    at('villa', 21, 95),
    at('house', 26, 95),

    // C — the south-west shops
    at('restrooms', 30, 91),
    at('game-hall', 32, 91),
    at('first-aid', 36, 91),
    at('palm', 40, 91),
    at('supermarket', 30, 95),
    at('restaurant', 35, 95),
    at('icecream', 40, 95),
    at('snack-bar', 40, 97),

    // D — services either side of the south gate
    at('first-aid', 44, 91),
    at('restrooms', 47, 91),
    at('snack-bar', 50, 91),
    at('palm', 53, 91),
    at('tikitorch', 55, 91),
    at('spa-pavilion', 44, 95),
    at('resort-bar', 48, 95),
    at('game-hall', 52, 95),
    at('palm', 56, 95),

    // E — the south-east shops
    at('snack-bar', 58, 91),
    at('icecream', 61, 91),
    at('restrooms', 63, 91),
    at('palm', 68, 91),
    at('supermarket', 58, 95),
    at('restaurant', 63, 95),
    at('statue', 68, 95),

    // F — the fourth hotel
    at('flowerbed', 76, 91),
    at('cypress', 74, 92),
    at('cypress', 78, 92),
    at('hotel', 72, 94),

    // G — the last shops
    at('snack-bar', 83, 91),
    at('icecream', 86, 91),
    at('restrooms', 88, 91),
    at('first-aid', 91, 91),
    at('palm', 94, 91),
    at('supermarket', 83, 95),
    at('restaurant', 88, 95),
    at('game-hall', 92, 95),

    // H — the last hotel
    at('flowerbed', 101, 91),
    at('blossom', 99, 92),
    at('blossom', 103, 92),
    at('statue', 107, 92),
    at('hotel', 97, 94),

    // ── the fountain in the middle of its plaza, where the streets meet ──────
    at('fountain', 42, 36),
  ],

  nodes: [
    // the promenade, north gate to south gate
    { id: 'gate-n', tileX: 43, tileZ: 1 },
    { id: 'cross-n', tileX: 43, tileZ: 10 },
    { id: 'plaza', tileX: 43, tileZ: 36 },
    { id: 'cross-s', tileX: 43, tileZ: 60 },
    { id: 'cross-s2', tileX: 43, tileZ: 74 },
    { id: 'cross-s3', tileX: 43, tileZ: 90 },
    { id: 'gate-s', tileX: 43, tileZ: 98 },

    // the five cross streets, and the ring lanes they end on
    { id: 'north-w', tileX: 2, tileZ: 10 },
    { id: 'north-e', tileX: 110, tileZ: 10 },
    { id: 'avenue-w', tileX: 2, tileZ: 36 },
    { id: 'avenue-e', tileX: 110, tileZ: 36 },
    { id: 'south-w', tileX: 2, tileZ: 60 },
    { id: 'south-e', tileX: 110, tileZ: 60 },
    { id: 'south2-w', tileX: 2, tileZ: 74 },
    { id: 'south2-e', tileX: 110, tileZ: 74 },
    { id: 'south3-w', tileX: 2, tileZ: 90 },
    { id: 'south3-e', tileX: 110, tileZ: 90 },

    // six service lanes, one down each seam between the districts
    { id: 'lane-a-n', tileX: 15, tileZ: 10 },
    { id: 'lane-a-s', tileX: 15, tileZ: 90 },
    { id: 'lane-b-n', tileX: 29, tileZ: 10 },
    { id: 'lane-b-s', tileX: 29, tileZ: 90 },
    { id: 'lane-c-n', tileX: 57, tileZ: 10 },
    { id: 'lane-c-s', tileX: 57, tileZ: 90 },
    { id: 'lane-d-n', tileX: 71, tileZ: 10 },
    { id: 'lane-d-s', tileX: 71, tileZ: 90 },
    { id: 'lane-e-n', tileX: 82, tileZ: 10 },
    { id: 'lane-e-s', tileX: 82, tileZ: 90 },
    { id: 'lane-f-n', tileX: 96, tileZ: 10 },
    { id: 'lane-f-s', tileX: 96, tileZ: 90 },
  ],

  edges: [
    // the promenade is the widest thing on the plot
    { from: 'gate-n', to: 'cross-n', width: 2 },
    { from: 'cross-n', to: 'plaza', width: 2 },
    { from: 'plaza', to: 'cross-s', width: 2 },
    { from: 'cross-s', to: 'cross-s2', width: 2 },
    { from: 'cross-s2', to: 'cross-s3', width: 2 },
    { from: 'cross-s3', to: 'gate-s', width: 2 },

    // cross streets
    { from: 'north-w', to: 'north-e', width: 2 },
    { from: 'avenue-w', to: 'avenue-e', width: 2 },
    { from: 'south-w', to: 'south-e', width: 2 },
    { from: 'south2-w', to: 'south2-e', width: 2 },
    { from: 'south3-w', to: 'south3-e', width: 2 },

    // the ring lanes down both flanks
    { from: 'north-w', to: 'south-w' },
    { from: 'south-w', to: 'south3-w' },
    { from: 'north-e', to: 'south-e' },
    { from: 'south-e', to: 'south3-e' },

    // the service lanes
    { from: 'lane-a-n', to: 'lane-a-s' },
    { from: 'lane-b-n', to: 'lane-b-s' },
    { from: 'lane-c-n', to: 'lane-c-s' },
    { from: 'lane-d-n', to: 'lane-d-s' },
    { from: 'lane-e-n', to: 'lane-e-s' },
    { from: 'lane-f-n', to: 'lane-f-s' },
  ],

  // the fountain plaza, four tiles deep so the fountain cannot sever it
  plazas: [{ x0: 41, x1: 44, z0: 34, z1: 37 }],
};
