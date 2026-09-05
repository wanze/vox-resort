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
 * North is at the top (z = 0), so the gate is north and the water park south:
 *
 * ```
 *                       gate
 *   hotels   villas      │      shops        services      <- north street
 *   ────────────────────────────────────────────────────
 *   cottage   houses     │   pools & bars    water park
 *   village   bungalows  │   beach club      villas        <- avenue (fountain)
 *   ────────────────────────────────────────────────────
 *   tennis   minigolf    │   second pool     beach club
 *   courts   playground  │   lodging         villas        <- south street
 *   ────────────────────────────────────────────────────
 *          south lawns, water park, courts
 * ```
 */

/** One object standing on the plot, anchored at its north-west tile. */
export interface ResortPlot {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

/** A junction the streets are strung between. */
export interface PathNode {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

/** Which leg of the L an edge walks first. */
export type Bend = "x-first" | "z-first";

/** A street: an orthogonal run between two nodes, optionally more than one tile wide. */
export interface PathEdge {
  readonly from: string;
  readonly to: string;
  /** Width in tiles, grown symmetrically around the run. Defaults to 1. */
  readonly width?: number;
  /** Defaults to `"x-first"`; only matters for a diagonal edge. */
  readonly bend?: Bend;
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
}

/** The object type the path network is built from; it needs no plot of its own. */
export const PATH_ID = "path";

/** The object types the layout scatters along the paths on its own. */
export const LAMP_ID = "street-lamp";
export const HEDGE_ID = "hedge";

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
  tilesX: 60,
  tilesZ: 52,

  plots: [
    // ── the two gates, on the ends of the promenade ──────────────────────────
    at("entrance", 30, 0),
    at("entrance", 30, 51),

    // ── north-west: the hotel blocks ─────────────────────────────────────────
    ...row("hotel", 3, 1, 2, 6),
    ...row("palm", 3, 6, 6, 2),

    // ── north-centre-west: villas and a townhouse ────────────────────────────
    at("villa", 17, 1),
    at("villa", 22, 1),
    at("house", 27, 1),
    at("flowerbed", 18, 6),
    at("statue", 21, 6),
    at("flowerbed", 24, 6),

    // ── north-centre-east: the shops ─────────────────────────────────────────
    at("supermarket", 33, 1),
    at("restaurant", 38, 1),
    at("snack-bar", 33, 5),
    at("icecream", 36, 5),
    at("restrooms", 38, 5),
    at("flowerbed", 41, 5),

    // ── north-east: services ─────────────────────────────────────────────────
    at("game-hall", 45, 1),
    at("spa-pavilion", 49, 1),
    at("first-aid", 53, 1),
    at("resort-bar", 45, 5),
    at("palm", 49, 5),
    at("palm", 51, 5),
    at("tikitorch", 53, 5),

    // ── west: the cottage village, reached by one lane ───────────────────────
    ...block("cottage", 3, 11, 4, 2, 3, 4),
    ...row("bungalow", 3, 19, 4, 3),
    ...row("palm", 5, 22, 4, 3),
    at("flowerbed", 14, 11),
    at("flowerbed", 14, 15),

    // ── centre-west: houses and bungalows ────────────────────────────────────
    ...row("house", 17, 10, 3, 4),
    ...row("bungalow", 17, 14, 4, 3),
    ...row("cottage", 17, 18, 4, 3),
    at("palm", 29, 14),
    at("palm", 29, 18),

    // ── centre-east: the pool quarter ────────────────────────────────────────
    at("swimming-pool", 33, 11),
    at("poolside-bar", 38, 11),
    ...row("sun-lounger", 33, 15, 6, 1),
    at("tikitorch", 40, 15),
    at("beach-club", 33, 17),
    at("tikitorch", 38, 17),
    at("tikitorch", 38, 20),
    at("palm", 41, 18),

    // ── east: the water park and more villas ─────────────────────────────────
    at("waterpark", 46, 11),
    at("villa", 52, 11),
    ...row("bungalow", 46, 18, 3, 3),
    at("palm", 53, 17),
    at("palm", 55, 17),

    // ── south-west: the courts ───────────────────────────────────────────────
    at("tennis-court", 3, 27),
    at("tennis-court", 3, 33),
    ...row("palm", 13, 27, 1, 2),
    at("palm", 13, 33),

    // ── south-centre-west: minigolf, playground, lodging ─────────────────────
    at("minigolf", 17, 27),
    at("playground", 23, 27),
    ...row("house", 17, 33, 3, 4),
    at("statue", 29, 27),

    // ── south-centre-east: the quiet pool and its lodging ────────────────────
    at("swimming-pool", 33, 27),
    at("poolside-bar", 38, 27),
    ...row("cottage", 33, 32, 3, 3),
    ...row("bungalow", 33, 36, 3, 3),
    at("palm", 42, 32),

    // ── south-east: beach club and villas ────────────────────────────────────
    at("beach-club", 46, 27),
    at("resort-bar", 51, 27),
    at("villa", 46, 33),
    at("villa", 51, 33),

    // ── the south strip, below the south street ──────────────────────────────
    at("minigolf", 3, 43),
    at("playground", 9, 43),
    at("game-hall", 14, 43),
    at("first-aid", 18, 43),
    at("restrooms", 21, 43),
    at("fountain", 24, 43),
    at("waterpark", 33, 43),
    at("tennis-court", 39, 43),
    at("spa-pavilion", 49, 43),
    at("snack-bar", 49, 46),
    at("supermarket", 53, 43),

    // ── the fountain in the middle of its plaza ──────────────────────────────
    at("fountain", 30, 24),
  ],

  nodes: [
    // the promenade, north gate to south gate
    { id: "gate-n", tileX: 31, tileZ: 1 },
    { id: "cross-n", tileX: 31, tileZ: 8 },
    { id: "plaza", tileX: 31, tileZ: 24 },
    { id: "cross-s", tileX: 31, tileZ: 40 },
    { id: "gate-s", tileX: 31, tileZ: 50 },

    // the three cross streets
    { id: "north-w", tileX: 2, tileZ: 8 },
    { id: "north-e", tileX: 58, tileZ: 8 },
    { id: "avenue-w", tileX: 2, tileZ: 24 },
    { id: "avenue-e", tileX: 58, tileZ: 24 },
    { id: "south-w", tileX: 2, tileZ: 40 },
    { id: "south-e", tileX: 58, tileZ: 40 },

    // the two service lanes: one into the cottage village, one past the pools
    { id: "village-n", tileX: 15, tileZ: 8 },
    { id: "village-s", tileX: 15, tileZ: 40 },
    { id: "pools-n", tileX: 44, tileZ: 8 },
    { id: "pools-s", tileX: 44, tileZ: 40 },
  ],

  edges: [
    // the promenade is the widest thing on the plot
    { from: "gate-n", to: "cross-n", width: 2 },
    { from: "cross-n", to: "plaza", width: 2 },
    { from: "plaza", to: "cross-s", width: 2 },
    { from: "cross-s", to: "gate-s", width: 2 },

    // cross streets
    { from: "north-w", to: "north-e", width: 2 },
    { from: "avenue-w", to: "avenue-e", width: 2 },
    { from: "south-w", to: "south-e", width: 2 },

    // the ring lanes down both flanks
    { from: "north-w", to: "south-w" },
    { from: "north-e", to: "south-e" },

    // the two service lanes
    { from: "village-n", to: "village-s" },
    { from: "pools-n", to: "pools-s" },
  ],

  // the fountain plaza, four tiles deep so the fountain cannot sever it
  plazas: [{ x0: 29, x1: 32, z0: 23, z1: 26 }],
};
