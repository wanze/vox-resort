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
 *   tennis  lodging  │ pool & │ water   villas  water   courts
 *   minigolf spa     │ water  │ park    lodging park    lodging  <- south st  (z 60)
 *   ────────────────────────────────────────────────────────────
 *   courts  water    │ shops  │ shops   villas  shops   villas
 *   minigolf park    │minigolf│ minigolf tennis minigolf tennis  <- south lane (z 74)
 *   ────────────────────────────────────────────────────────────
 *   lodging pool     │ villas │ water   courts  water   lodging
 *   play    quarter  │ lodging│ park    minigolf park   pool     <- south lane (z 90)
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
  tilesX: 112,
  tilesZ: 100,

  plots: [
    // ── the two gates, on the ends of the promenade ──────────────────────────
    at("entrance", 42, 0),
    at("entrance", 42, 99),

    // ═══ north strip (z 1-8): the arrival frontage ═══════════════════════════

    // A — the hotel blocks
    ...row("hotel", 3, 1, 2, 6),
    ...row("palm", 4, 6, 3, 4),
    at("flowerbed", 6, 8),

    // B — villas and a townhouse
    at("villa", 16, 1),
    at("villa", 21, 1),
    at("house", 26, 1),
    at("statue", 18, 6),
    at("flowerbed", 22, 6),
    at("palm", 26, 6),

    // C — the west shops
    at("supermarket", 30, 1),
    at("restaurant", 35, 1),
    at("icecream", 40, 1),
    at("snack-bar", 40, 3),
    at("restrooms", 30, 5),
    at("game-hall", 33, 5),
    at("first-aid", 37, 5),

    // D — services
    at("spa-pavilion", 44, 1),
    at("resort-bar", 48, 1),
    at("game-hall", 52, 1),
    at("first-aid", 44, 4),
    at("restrooms", 47, 4),
    at("snack-bar", 50, 4),
    at("tikitorch", 55, 1),

    // E — the east shops
    at("supermarket", 58, 1),
    at("restaurant", 63, 1),
    at("statue", 68, 1),
    at("snack-bar", 58, 5),
    at("icecream", 61, 5),
    at("restrooms", 63, 5),
    at("palm", 68, 4),

    // F — the second hotel
    at("hotel", 72, 1),
    at("villa", 78, 1),
    at("palm", 74, 6),
    at("palm", 78, 6),
    at("flowerbed", 76, 8),

    // G — the east-wing shops
    at("supermarket", 83, 1),
    at("restaurant", 88, 1),
    at("icecream", 93, 1),
    at("snack-bar", 93, 3),
    at("restrooms", 83, 5),
    at("game-hall", 86, 5),
    at("first-aid", 90, 5),
    at("palm", 93, 5),
    at("flowerbed", 93, 7),

    // H — the third hotel
    at("hotel", 97, 1),
    at("villa", 104, 1),
    at("palm", 99, 6),
    at("palm", 103, 6),
    at("statue", 105, 6),
    at("flowerbed", 101, 7),

    // ═══ upper band (z 11-34): lodging, the pools, the water park ════════════

    // A — the cottage village, reached by one lane
    ...block("cottage", 3, 11, 4, 2, 3, 4),
    ...row("bungalow", 3, 19, 4, 3),
    at("tennis-court", 3, 25),

    // B — houses, bungalows and cottages down the lane
    ...row("house", 16, 11, 4, 3),
    ...row("bungalow", 16, 15, 4, 3),
    ...row("cottage", 16, 19, 4, 3),
    at("playground", 16, 28),

    // C — the pool quarter
    at("swimming-pool", 30, 11),
    at("poolside-bar", 35, 11),
    at("tikitorch", 38, 11),
    ...row("sun-lounger", 30, 15, 4, 1),
    at("beach-club", 30, 17),
    at("resort-bar", 35, 17),
    at("palm", 39, 17),
    ...row("cottage", 30, 22, 4, 3),

    // D — the water park and the second pool
    at("waterpark", 44, 11),
    at("villa", 50, 11),
    at("tikitorch", 55, 11),
    ...row("bungalow", 44, 17, 4, 3),
    at("swimming-pool", 44, 21),
    at("poolside-bar", 49, 21),
    at("palm", 52, 21),
    ...row("sun-lounger", 44, 25, 4, 1),

    // E — the beach club and the villa quarter
    at("beach-club", 58, 11),
    at("villa", 63, 11),
    at("tikitorch", 68, 11),
    at("villa", 58, 16),
    at("villa", 63, 16),
    ...row("house", 58, 21, 4, 3),
    ...row("bungalow", 58, 25, 4, 3),

    // F — courts and the east lodging
    at("tennis-court", 72, 11),
    at("palm", 72, 17),
    ...row("bungalow", 72, 19, 3, 3),
    ...row("cottage", 72, 23, 3, 3),
    ...row("house", 72, 27, 3, 3),
    at("statue", 81, 23),

    // G — the east pool quarter
    at("swimming-pool", 83, 11),
    at("poolside-bar", 88, 11),
    at("tikitorch", 91, 11),
    ...row("sun-lounger", 83, 15, 4, 1),
    at("beach-club", 83, 17),
    at("resort-bar", 88, 17),
    at("palm", 92, 17),
    ...row("cottage", 83, 22, 4, 3),
    ...row("bungalow", 83, 26, 4, 3),
    ...row("house", 83, 30, 4, 3),

    // H — the east villa quarter
    at("villa", 97, 11),
    at("villa", 102, 11),
    at("tikitorch", 107, 11),
    at("villa", 97, 16),
    at("villa", 102, 16),
    at("statue", 107, 16),
    ...row("house", 97, 21, 4, 3),
    ...row("bungalow", 97, 25, 4, 3),
    ...row("cottage", 97, 29, 4, 3),
    at("palm", 109, 21),

    // ═══ lower band (z 37-58): courts, spa, the second water park ════════════

    // A — courts and the family corner
    at("tennis-court", 3, 37),
    at("minigolf", 3, 43),
    at("playground", 9, 43),
    ...row("cottage", 3, 48, 4, 3),
    ...row("bungalow", 3, 52, 4, 3),
    at("palm", 13, 37),

    // B — lodging above the spa quarter
    ...row("house", 16, 37, 4, 3),
    ...row("bungalow", 16, 41, 4, 3),
    at("game-hall", 16, 45),
    at("spa-pavilion", 20, 45),
    at("first-aid", 24, 45),
    at("statue", 27, 45),
    at("minigolf", 16, 50),
    at("playground", 22, 50),

    // C — the third pool and the west water park
    at("swimming-pool", 30, 37),
    at("poolside-bar", 35, 37),
    at("tikitorch", 38, 37),
    ...row("sun-lounger", 30, 41, 4, 1),
    ...row("cottage", 30, 43, 4, 3),
    at("waterpark", 30, 48),
    at("resort-bar", 36, 48),

    // D — the south beach club and its villas
    at("beach-club", 45, 37),
    at("resort-bar", 50, 37),
    at("tikitorch", 54, 37),
    at("villa", 44, 42),
    at("villa", 49, 42),
    ...row("house", 44, 47, 4, 3),
    ...row("bungalow", 44, 51, 4, 3),

    // E — the east water park and more lodging
    at("waterpark", 58, 37),
    at("villa", 64, 37),
    ...row("cottage", 58, 43, 4, 3),
    ...row("bungalow", 58, 47, 4, 3),
    at("beach-club", 58, 51),
    at("resort-bar", 63, 51),

    // F — the far-east villas
    at("villa", 72, 37),
    at("villa", 77, 37),
    at("palm", 72, 42),
    ...row("house", 72, 44, 3, 3),
    ...row("cottage", 72, 48, 3, 3),
    ...row("bungalow", 72, 52, 3, 3),

    // G — the fourth water park and its lodging
    at("waterpark", 83, 37),
    at("villa", 89, 37),
    at("tikitorch", 94, 37),
    ...row("cottage", 83, 43, 4, 3),
    ...row("bungalow", 83, 47, 4, 3),
    at("beach-club", 83, 51),
    at("resort-bar", 88, 51),
    at("palm", 92, 51),
    at("playground", 83, 56),

    // H — the east courts and lodging
    at("tennis-court", 97, 37),
    at("palm", 107, 37),
    at("minigolf", 97, 43),
    at("playground", 103, 43),
    ...row("house", 97, 48, 4, 3),
    ...row("cottage", 97, 52, 4, 3),
    ...row("bungalow", 97, 56, 4, 3),
    at("statue", 109, 48),

    // ═══ south strip (z 61-72): courts, the second shops, the south gate ═════

    // A — courts and minigolf
    at("tennis-court", 3, 61),
    at("minigolf", 3, 67),
    at("playground", 9, 67),
    at("palm", 13, 61),
    at("palm", 13, 66),
    at("flowerbed", 13, 69),

    // B — the south water park and its services
    at("waterpark", 16, 61),
    at("game-hall", 22, 61),
    at("first-aid", 26, 61),
    at("spa-pavilion", 22, 65),
    at("restrooms", 26, 65),
    at("fountain", 17, 68),
    at("statue", 21, 68),

    // C — the south shops
    at("supermarket", 30, 61),
    at("restaurant", 35, 61),
    at("snack-bar", 30, 65),
    at("icecream", 33, 65),
    at("restrooms", 35, 65),
    at("resort-bar", 38, 65),
    at("minigolf", 30, 68),
    at("playground", 36, 68),

    // D — the south courts and the last water park
    at("tennis-court", 44, 61),
    at("spa-pavilion", 54, 61),
    at("first-aid", 54, 64),
    at("waterpark", 44, 67),
    at("beach-club", 50, 67),
    at("palm", 55, 67),

    // E — the south-east shops
    at("supermarket", 58, 61),
    at("restaurant", 63, 61),
    at("game-hall", 68, 61),
    at("snack-bar", 58, 65),
    at("icecream", 61, 65),
    at("restrooms", 63, 65),
    at("playground", 58, 68),
    at("minigolf", 63, 68),

    // F — the south-east villas and courts
    at("villa", 72, 61),
    at("villa", 77, 61),
    at("tennis-court", 72, 66),
    at("palm", 81, 61),
    at("palm", 81, 66),

    // G — the east-wing shops and course
    at("supermarket", 83, 61),
    at("restaurant", 88, 61),
    at("game-hall", 93, 61),
    at("snack-bar", 83, 65),
    at("icecream", 86, 65),
    at("restrooms", 88, 65),
    at("first-aid", 91, 65),
    at("minigolf", 83, 68),
    at("playground", 89, 68),
    at("palm", 94, 68),

    // H — villas and the far-east court
    at("villa", 97, 61),
    at("villa", 102, 61),
    at("palm", 107, 61),
    at("tennis-court", 97, 66),
    at("palm", 107, 66),
    at("flowerbed", 107, 69),

    // ═══ south band (z 75-88): lodging, the last pools and parks ═════════════

    // A — lodging above the family corner
    ...row("house", 3, 75, 4, 3),
    ...row("bungalow", 3, 79, 4, 3),
    ...row("cottage", 3, 82, 4, 3),
    at("playground", 3, 86),
    at("game-hall", 8, 86),
    at("palm", 12, 86),
    at("flowerbed", 12, 88),

    // B — the south pool quarter
    at("swimming-pool", 16, 75),
    at("poolside-bar", 21, 75),
    at("tikitorch", 24, 75),
    ...row("sun-lounger", 16, 79, 4, 1),
    at("beach-club", 16, 81),
    at("resort-bar", 21, 81),
    at("palm", 25, 81),
    ...row("bungalow", 16, 86, 4, 3),
    at("statue", 28, 86),

    // C — villas over a row of services
    at("villa", 30, 75),
    at("villa", 35, 75),
    at("palm", 40, 75),
    ...row("cottage", 30, 80, 4, 3),
    ...row("bungalow", 30, 84, 4, 3),
    at("first-aid", 30, 87),
    at("restrooms", 33, 87),
    at("snack-bar", 36, 87),
    at("icecream", 39, 87),
    at("palm", 40, 87),

    // D — the fifth water park and the spa row
    at("waterpark", 44, 75),
    at("villa", 50, 75),
    at("tikitorch", 55, 75),
    ...row("house", 44, 81, 4, 3),
    ...row("bungalow", 44, 85, 4, 3),
    at("statue", 56, 81),
    at("palm", 56, 85),
    at("spa-pavilion", 44, 87),
    at("first-aid", 48, 87),
    at("restrooms", 51, 87),
    at("snack-bar", 54, 87),
    at("palm", 56, 87),

    // E — the south courts
    at("tennis-court", 58, 75),
    at("palm", 68, 75),
    at("minigolf", 58, 81),
    at("playground", 64, 81),
    at("statue", 69, 81),
    ...row("cottage", 58, 86, 4, 3),

    // F — villas and lodging
    at("villa", 72, 75),
    at("villa", 77, 75),
    at("palm", 81, 75),
    ...row("house", 72, 80, 3, 3),
    at("palm", 81, 80),
    ...row("bungalow", 72, 84, 3, 3),
    at("flowerbed", 81, 84),
    ...row("cottage", 72, 86, 3, 3),

    // G — the last water park and the last pool
    at("waterpark", 83, 75),
    at("villa", 89, 75),
    at("tikitorch", 94, 75),
    at("swimming-pool", 83, 81),
    at("poolside-bar", 88, 81),
    at("palm", 91, 81),
    at("statue", 95, 81),
    ...row("sun-lounger", 83, 85, 4, 1),
    ...row("bungalow", 83, 86, 4, 3),

    // H — the south-east beach club and its lodging
    at("beach-club", 97, 75),
    at("resort-bar", 102, 75),
    at("palm", 106, 75),
    at("statue", 109, 80),
    ...row("house", 97, 80, 4, 3),
    ...row("cottage", 97, 84, 4, 3),
    ...row("bungalow", 97, 87, 4, 3),
    at("palm", 109, 84),

    // ═══ south strip (z 91-98): the departure frontage, mirroring the north ══
    //
    // Mirrored properly: the planting sits against the street and the blocks
    // against the plot edge, so every spur here is three tiles straight up
    // rather than a lane running the width of the strip.

    // A — the southern hotel blocks
    at("flowerbed", 6, 91),
    ...row("palm", 4, 92, 3, 4),
    ...row("hotel", 3, 95, 2, 6),

    // B — villas and a townhouse
    at("statue", 18, 92),
    at("flowerbed", 22, 92),
    at("palm", 26, 92),
    at("villa", 16, 95),
    at("villa", 21, 95),
    at("house", 26, 95),

    // C — the south-west shops
    at("restrooms", 30, 91),
    at("game-hall", 33, 91),
    at("first-aid", 37, 91),
    at("palm", 40, 91),
    at("supermarket", 30, 95),
    at("restaurant", 35, 95),
    at("icecream", 40, 95),
    at("snack-bar", 40, 97),

    // D — services either side of the south gate
    at("first-aid", 44, 91),
    at("restrooms", 47, 91),
    at("snack-bar", 50, 91),
    at("palm", 53, 91),
    at("tikitorch", 55, 91),
    at("spa-pavilion", 44, 95),
    at("resort-bar", 48, 95),
    at("game-hall", 52, 95),
    at("palm", 56, 95),

    // E — the south-east shops
    at("snack-bar", 58, 91),
    at("icecream", 61, 91),
    at("restrooms", 63, 91),
    at("palm", 68, 91),
    at("supermarket", 58, 95),
    at("restaurant", 63, 95),
    at("statue", 68, 95),

    // F — the fourth hotel
    at("flowerbed", 76, 91),
    at("palm", 74, 92),
    at("palm", 78, 92),
    at("hotel", 72, 95),
    at("villa", 78, 95),

    // G — the last shops
    at("snack-bar", 83, 91),
    at("icecream", 86, 91),
    at("restrooms", 88, 91),
    at("first-aid", 91, 91),
    at("palm", 94, 91),
    at("supermarket", 83, 95),
    at("restaurant", 88, 95),
    at("game-hall", 93, 95),

    // H — the last hotel
    at("flowerbed", 101, 91),
    at("palm", 99, 92),
    at("palm", 103, 92),
    at("statue", 107, 92),
    at("hotel", 97, 95),
    at("villa", 104, 95),

    // ── the fountain in the middle of its plaza, where the streets meet ──────
    at("fountain", 42, 36),
  ],

  nodes: [
    // the promenade, north gate to south gate
    { id: "gate-n", tileX: 43, tileZ: 1 },
    { id: "cross-n", tileX: 43, tileZ: 10 },
    { id: "plaza", tileX: 43, tileZ: 36 },
    { id: "cross-s", tileX: 43, tileZ: 60 },
    { id: "cross-s2", tileX: 43, tileZ: 74 },
    { id: "cross-s3", tileX: 43, tileZ: 90 },
    { id: "gate-s", tileX: 43, tileZ: 98 },

    // the five cross streets, and the ring lanes they end on
    { id: "north-w", tileX: 2, tileZ: 10 },
    { id: "north-e", tileX: 110, tileZ: 10 },
    { id: "avenue-w", tileX: 2, tileZ: 36 },
    { id: "avenue-e", tileX: 110, tileZ: 36 },
    { id: "south-w", tileX: 2, tileZ: 60 },
    { id: "south-e", tileX: 110, tileZ: 60 },
    { id: "south2-w", tileX: 2, tileZ: 74 },
    { id: "south2-e", tileX: 110, tileZ: 74 },
    { id: "south3-w", tileX: 2, tileZ: 90 },
    { id: "south3-e", tileX: 110, tileZ: 90 },

    // six service lanes, one down each seam between the districts
    { id: "lane-a-n", tileX: 15, tileZ: 10 },
    { id: "lane-a-s", tileX: 15, tileZ: 90 },
    { id: "lane-b-n", tileX: 29, tileZ: 10 },
    { id: "lane-b-s", tileX: 29, tileZ: 90 },
    { id: "lane-c-n", tileX: 57, tileZ: 10 },
    { id: "lane-c-s", tileX: 57, tileZ: 90 },
    { id: "lane-d-n", tileX: 71, tileZ: 10 },
    { id: "lane-d-s", tileX: 71, tileZ: 90 },
    { id: "lane-e-n", tileX: 82, tileZ: 10 },
    { id: "lane-e-s", tileX: 82, tileZ: 90 },
    { id: "lane-f-n", tileX: 96, tileZ: 10 },
    { id: "lane-f-s", tileX: 96, tileZ: 90 },
  ],

  edges: [
    // the promenade is the widest thing on the plot
    { from: "gate-n", to: "cross-n", width: 2 },
    { from: "cross-n", to: "plaza", width: 2 },
    { from: "plaza", to: "cross-s", width: 2 },
    { from: "cross-s", to: "cross-s2", width: 2 },
    { from: "cross-s2", to: "cross-s3", width: 2 },
    { from: "cross-s3", to: "gate-s", width: 2 },

    // cross streets
    { from: "north-w", to: "north-e", width: 2 },
    { from: "avenue-w", to: "avenue-e", width: 2 },
    { from: "south-w", to: "south-e", width: 2 },
    { from: "south2-w", to: "south2-e", width: 2 },
    { from: "south3-w", to: "south3-e", width: 2 },

    // the ring lanes down both flanks
    { from: "north-w", to: "south-w" },
    { from: "south-w", to: "south3-w" },
    { from: "north-e", to: "south-e" },
    { from: "south-e", to: "south3-e" },

    // the service lanes
    { from: "lane-a-n", to: "lane-a-s" },
    { from: "lane-b-n", to: "lane-b-s" },
    { from: "lane-c-n", to: "lane-c-s" },
    { from: "lane-d-n", to: "lane-d-s" },
    { from: "lane-e-n", to: "lane-e-s" },
    { from: "lane-f-n", to: "lane-f-s" },
  ],

  // the fountain plaza, four tiles deep so the fountain cannot sever it
  plazas: [{ x0: 41, x1: 44, z0: 34, z1: 37 }],
};
