/**
 * Grows a resort plot from a handful of numbers.
 *
 * `resortPlan.ts` holds one hand-authored plan, and it is still the reference
 * this is measured against — but a plan is only data satisfying `ResortPlan`,
 * and `layoutResort` neither knows nor cares who wrote it. Nothing downstream
 * changes: the pipeline meshes each *model* once and repeats it, so a resort
 * generated at four times the size costs the same to mesh as this one.
 *
 * The plot is grown in the order a town is:
 *
 * 1. **Streets first.** A promenade the full depth of the plot with a gate at
 *    each end, cross streets at intervals, and service lanes down the flanks and
 *    between the columns. The network is laid out before anything is built on
 *    it, which is what makes every district border a street by construction
 *    rather than by luck.
 * 2. **Districts are the gaps.** Whatever rectangle is left between two streets
 *    is a district, and each is given a theme — a category of the catalogue that
 *    will dominate it — so the resort reads as a lodging quarter and a leisure
 *    quarter rather than as a uniform scatter.
 * 3. **Rows, with a lane between them.** Objects are laid in rows separated by a
 *    free tile row. That is not decoration: `layoutResort` grows a spur from
 *    every object to the nearest street and throws if an object is walled in, so
 *    the free row is what guarantees a generated plan is one it will accept.
 *    Successive rows are turned to face opposite ways, so the two rows either
 *    side of a lane stand back to back the way a street of houses does, and a
 *    few objects in each row take a quarter turn out of that — see
 *    {@link turnFor}. A resort in which every building faced the same way read
 *    as a housing estate, and the fix costs nothing but a different instance
 *    matrix, because a quarter turn keeps a voxel model square to the grid.
 * 4. **The catalogue first, the filling after.** Every type that has not been
 *    placed yet is placed before anything is repeated, so the showcase shows the
 *    whole catalogue whatever the density asks for.
 * 5. **The beach last.** The plot's southern end is sea, with a band of sand
 *    across the full width of the plot that the districts are kept off entirely
 *    — a hotel laid out on a row grid is precisely what a beach is not. The sand
 *    is filled afterwards on its own terms: loungers and parasols in runs along
 *    the water, bungalows and palms behind them, and lanes left clear so the
 *    layout can walk a boardwalk out to every one of them. See {@link fillBeach}.
 *
 * Everything here is a pure function of the parameters, and the seed makes it
 * reproducible: the same four numbers give the same resort, which is what lets
 * a plot be shared, benchmarked and regression-tested.
 */

import type { ModelCategory } from '../../../../voxel-gen/voxelgen.ts';
import { DERIVED_IDS, type PathNode, type ResortPlan, type ResortPlot } from './resortPlan';
import { streetTiles, tileKey, widthOffsets, type Tile } from './resortLayout';
import {
  beachDepthAt,
  beachTilesOf,
  shoreFor,
  waterStartZ,
  waterTilesOf,
  type Shore,
  type ShoreSpec,
} from './shoreline';
import type { ElevationSpec } from './elevation';
import { normalizeRotation, rotateExtent, type Extent, type Rotation } from './rotation';

/** The gate object, stood at both ends of the promenade. */
const GATE_ID = 'entrance';

/** The object dropped in the middle of the promenade's plaza. */
const PLAZA_ID = 'fountain';

/** Plot sizes the generator will work at, in tiles. */
export const PLOT_TILES = { min: 40, max: 160 } as const;

/** How built-up a plot can be asked to be. */
export const PLOT_DENSITY = { min: 0.2, max: 1 } as const;

export interface ResortParams {
  readonly tilesX: number;
  readonly tilesZ: number;
  /** How much of each district gets built on, 0..1. */
  readonly density: number;
  /** Any integer; the same one gives the same resort. */
  readonly seed: number;
}

/** What the generator needs to know about one catalogue entry. */
export interface GeneratorType {
  readonly id: string;
  readonly category: ModelCategory;
  readonly tilesX: number;
  readonly tilesZ: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * Brings parameters inside what the generator can actually build.
 *
 * A plot below the minimum cannot hold one of every catalogue type, and one
 * above the maximum costs more to bake than it is worth looking at; both are
 * pulled in rather than refused, because these numbers come off HUD sliders and
 * a slider that throws is not a slider.
 */
export function clampParams(params: ResortParams): ResortParams {
  return {
    tilesX: Math.round(clamp(params.tilesX, PLOT_TILES.min, PLOT_TILES.max)),
    tilesZ: Math.round(clamp(params.tilesZ, PLOT_TILES.min, PLOT_TILES.max)),
    density: clamp(params.density, PLOT_DENSITY.min, PLOT_DENSITY.max),
    seed: Math.abs(Math.trunc(params.seed)) % 0xffffffff,
  };
}

/**
 * Mulberry32: a small, fast, well-distributed 32-bit generator.
 *
 * Seeded rather than `Math.random` because a generated resort has to be
 * reproducible — a seed is the whole plot, small enough to put in the HUD and
 * to paste into a bug report.
 */
export function createRandom(seed: number): () => number {
  let state = (seed + 0x6d2b79f5) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

/** A street running the length or the breadth of the plot. */
interface Street {
  /** Tile the run is centred on, on the axis it cuts across. */
  readonly at: number;
  readonly width: number;
}

/** The first and last tile a street of this width covers. */
function spanOf(street: Street): { readonly low: number; readonly high: number } {
  const offsets = widthOffsets(street.width);
  return { low: street.at + offsets[0]!, high: street.at + offsets[offsets.length - 1]! };
}

/** Evenly spaced positions between two bounds, ends excluded. */
function spread(low: number, high: number, count: number): number[] {
  const step = (high - low) / (count + 1);
  return Array.from({ length: count }, (_, index) => Math.round(low + step * (index + 1)));
}

/** Tiles left as grass outside the flank lanes, so the resort has a green edge. */
const EDGE_MARGIN = 2;

/** The narrowest district worth carving: a hotel is six tiles across. */
const MIN_DISTRICT_WIDTH = 8;

/** The shallowest band worth carving: one row of objects and a lane out of it. */
const MIN_DISTRICT_DEPTH = 6;

const PROMENADE_WIDTH = 2;
const CROSS_STREET_WIDTH = 2;

/** A rectangle of buildable tiles between the streets, and what it is for. */
interface District {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  /** The category that dominates here; the rest of the catalogue still visits. */
  readonly theme: ModelCategory;
}

const byPosition = (a: Street, b: Street): number => a.at - b.at;

/** Widths of the districts a run of streets leaves between them. */
function districtWidths(streets: readonly Street[]): number[] {
  return streets
    .slice(1)
    .map((street, index) => spanOf(street).low - spanOf(streets[index]!).high - 1);
}

/** Adds a street only while every district it would leave is still worth having. */
function thin(fixed: readonly Street[], candidates: readonly Street[], minimum: number): Street[] {
  let chosen = fixed.toSorted(byPosition);
  for (const candidate of candidates) {
    const next = [...chosen, candidate].toSorted(byPosition);
    if (districtWidths(next).every((width) => width >= minimum)) chosen = next;
  }
  return chosen;
}

/** The streets running north to south: two flank lanes, the promenade, and service lanes. */
function columnsFor(random: () => number, tilesX: number): Street[] {
  const west = { at: EDGE_MARGIN, width: 1 };
  const east = { at: tilesX - 1 - EDGE_MARGIN, width: 1 };
  // Off centre, and differently off centre per seed: a promenade exactly halfway
  // makes both halves of every resort the same size.
  const promenade = { at: Math.round(tilesX * (0.42 + random() * 0.16)), width: PROMENADE_WIDTH };
  const lanes = spread(west.at, east.at, clamp(Math.round(tilesX / 16), 1, 9)).map((at) => ({
    at,
    width: 1,
  }));
  return thin([west, promenade, east], lanes, MIN_DISTRICT_WIDTH);
}

/** The streets running west to east. */
function bandsFor(tilesZ: number): Street[] {
  const positions = spread(1, tilesZ - 2, clamp(Math.round(tilesZ / 20), 2, 6));
  return thin(
    [],
    positions.map((at) => ({ at, width: CROSS_STREET_WIDTH })),
    MIN_DISTRICT_DEPTH,
  );
}

/** The buildable gaps between a run of streets, plus the strips beyond the ends. */
function gapsBetween(
  streets: readonly Street[],
  low: number,
  high: number,
  includeEnds: boolean,
): { readonly low: number; readonly high: number }[] {
  const gaps: { low: number; high: number }[] = [];
  const spans = streets.map(spanOf);
  if (includeEnds && spans.length > 0) gaps.push({ low, high: spans[0]!.low - 1 });
  for (let index = 1; index < spans.length; index++) {
    gaps.push({ low: spans[index - 1]!.high + 1, high: spans[index]!.low - 1 });
  }
  if (includeEnds && spans.length > 0) gaps.push({ low: spans[spans.length - 1]!.high + 1, high });
  return gaps.filter((gap) => gap.high >= gap.low);
}

/** The catalogue categories a district can be themed on, in a seeded order. */
function themesFor(random: () => number, count: number): ModelCategory[] {
  // Grounds is dressing rather than a quarter of a resort, so it never leads a
  // district; it fills the gaps everywhere instead.
  const pool: ModelCategory[] = ['lodging', 'amenities', 'leisure'];
  return Array.from({ length: count }, (_, index) => {
    // Walk the pool rather than draw from it, so a resort never comes out as
    // five lodging districts in a row, and jitter the walk so it is not a cycle.
    const drift = random() < 0.3 ? 1 : 0;
    return pool[(index + drift) % pool.length]!;
  });
}

/** What is already spoken for: street tiles, and everything placed so far. */
interface Site {
  readonly taken: Set<string>;
  readonly tilesX: number;
  readonly tilesZ: number;
}

/**
 * Whether a footprint can stand here.
 *
 * A footprint rather than a type, because a turned object claims different
 * tiles: a 2x6 villa turned a quarter is 6x2, and the question of whether it
 * fits is about the tiles it would cover, not about what it is.
 */
function fits(site: Site, footprint: Extent, tileX: number, tileZ: number): boolean {
  if (tileX < 0 || tileZ < 0) return false;
  if (tileX + footprint.x > site.tilesX || tileZ + footprint.z > site.tilesZ) return false;
  for (let z = tileZ; z < tileZ + footprint.z; z++) {
    for (let x = tileX; x < tileX + footprint.x; x++) {
      if (site.taken.has(tileKey(x, z))) return false;
    }
  }
  return true;
}

function claim(site: Site, footprint: Extent, tileX: number, tileZ: number): void {
  for (let z = tileZ; z < tileZ + footprint.z; z++) {
    for (let x = tileX; x < tileX + footprint.x; x++) site.taken.add(tileKey(x, z));
  }
}

/** The tiles a type claims standing a given way round. */
const footprintOf = (type: GeneratorType, rotation: Rotation): Extent =>
  rotateExtent(type.tilesX, type.tilesZ, rotation);

/** How much room is left in this district from a cursor position. */
interface Space {
  readonly x: number;
  readonly z: number;
}

/**
 * The type to stand next, given the room left.
 *
 * Anything the plan has not placed yet comes first, largest first — a tennis
 * court is nine tiles across and there is only one district early on that will
 * still take it. Once the catalogue is complete this falls through to a weighted
 * draw, so a district goes on filling with what it is themed for.
 */
function pickType(parts: {
  readonly types: readonly GeneratorType[];
  readonly missing: ReadonlySet<string>;
  readonly theme: ModelCategory;
  readonly space: Space;
  readonly random: () => number;
}): GeneratorType | null {
  const room = (type: GeneratorType): boolean =>
    type.tilesX <= parts.space.x && type.tilesZ <= parts.space.z;
  const candidates = parts.types.filter(room);
  if (candidates.length === 0) return null;

  const wanted = candidates.find((type) => parts.missing.has(type.id));
  if (wanted) return wanted;

  const weightOf = (type: GeneratorType): number => (type.category === parts.theme ? 4 : 1);
  const total = candidates.reduce((sum, type) => sum + weightOf(type), 0);
  let drawn = parts.random() * total;
  for (const type of candidates) {
    drawn -= weightOf(type);
    if (drawn <= 0) return type;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * The turns successive rows of a district stand at.
 *
 * Half turns, so a row's footprints are the ones the district was measured for,
 * and alternating, so the two rows either side of the lane between them stand
 * back to back rather than nose to tail — which is how a street of houses is
 * actually laid out, and the difference between a district that reads as a
 * terrace and one that reads as a barracks.
 */
const ROW_TURNS: readonly Rotation[] = [0, 2];

/**
 * Lays one district out in rows, leaving a free tile row between them.
 *
 * The free row is load-bearing. `layoutResort` grows a spur from every object to
 * the nearest street and throws if it cannot reach one, so a district packed
 * solid would be a plan it refuses. A row of objects with a clear row above and
 * below always has a way out to the street the district borders — and it still
 * does once the row is turned, because a row is as deep as its deepest object
 * however that object came to be that deep.
 */
function fillDistrict(parts: FillParts): void {
  const { district } = parts;
  let row = 0;
  for (let z = district.z0; z <= district.z1; row++) {
    z += fillRow(parts, z, ROW_TURNS[row % ROW_TURNS.length]!) + 1;
  }
}

/** How often an object turns out of the way its row faces. */
const QUARTER_TURN_CHANCE = 0.3;

/**
 * The turn one object stands at: its row's, mostly.
 *
 * A quarter out of that swaps the object's footprint, and the type was chosen
 * against its *unturned* one — so the swap is offered only when the tiles it
 * would want are actually free, and the row's own turn, which is a half turn
 * away and therefore the same footprint, is always there to fall back on. That
 * is what keeps a turn from ever being the reason a district comes out emptier.
 */
function turnFor(parts: {
  readonly rowTurn: Rotation;
  readonly type: GeneratorType;
  readonly site: Site;
  readonly tileX: number;
  readonly tileZ: number;
  readonly random: () => number;
}): Rotation {
  const { rowTurn, random } = parts;
  if (random() >= QUARTER_TURN_CHANCE) return rowTurn;
  const turned = normalizeRotation(rowTurn + (random() < 0.5 ? 1 : 3));
  return fits(parts.site, footprintOf(parts.type, turned), parts.tileX, parts.tileZ)
    ? turned
    : rowTurn;
}

interface FillParts {
  readonly district: District;
  readonly types: readonly GeneratorType[];
  readonly missing: Set<string>;
  readonly site: Site;
  readonly density: number;
  readonly random: () => number;
  readonly plots: ResortPlot[];
}

/** Lays one row across a district, and reports how deep it turned out. */
function fillRow(parts: FillParts, z: number, rowTurn: Rotation): number {
  const { district, site, random, plots, missing } = parts;
  let depth = 1;

  for (let x = district.x0; x <= district.x1;) {
    const space = { x: district.x1 - x + 1, z: district.z1 - z + 1 };
    const type = pickType({ ...parts, theme: district.theme, space });
    if (!type) break;

    // Density leaves gaps, but never at the cost of a type nothing has stood
    // yet: an empty lawn is a choice, a missing catalogue entry is a bug.
    if (!missing.has(type.id) && random() > parts.density) {
      x += 1 + Math.floor(random() * 3);
      continue;
    }
    if (!fits(site, footprintOf(type, 0), x, z)) {
      x += 1;
      continue;
    }

    const rotation = turnFor({ rowTurn, type, site, tileX: x, tileZ: z, random });
    const footprint = footprintOf(type, rotation);
    claim(site, footprint, x, z);
    plots.push({ id: type.id, tileX: x, tileZ: z, rotation });
    missing.delete(type.id);
    // Measured off the footprint rather than the type, so a quarter-turned villa
    // pushes the row's own depth out and the free row below it moves with it.
    depth = Math.max(depth, footprint.z);
    x += footprint.x + (random() < 0.4 ? 1 : 0);
  }
  return depth;
}

/**
 * How far the sea reaches in from the plot's south edge, and how deep the sand
 * in front of it is — both as a fraction of the plot's depth, with floors and a
 * ceiling.
 *
 * The water inset is small because it costs the resort ground for nothing: the
 * sea carries on past the plot to the horizon whatever this says, so all these
 * tiles buy is a strip of water with the plot's own edge behind it. The beach is
 * the number that matters, and it is capped as well as floored — a beach that
 * grew with a 160-tile plot would be forty tiles of sand, which is a desert.
 */
const SHORE_INSET = { of: 0.1, min: 6 } as const;
const SHORE_BEACH = { of: 0.16, min: 8, max: 18, wander: 3 } as const;

/**
 * TEMPORARY: the terraces a generated plot gets, so the stairs can be seen.
 *
 * Two benches climbing away from the water — the sand and a strip of grass at
 * sea level, a bench above that, and the rest of the resort a bench above that
 * again. Both steps clear the whole sand band, which `elevationFor` insists on.
 *
 * This is a stopgap for looking at, not the real thing. It ignores the districts
 * entirely, so a building laid across a step straddles it, and the ground itself
 * is not drawn yet — see the milestone this belongs to. Deriving terraces the
 * districts actually respect is the generator's own step, still to come.
 */
function temporaryElevationFor(params: ResortParams, shore: ShoreSpec): ElevationSpec {
  return {
    terraces: [
      { level: 1, fromWater: shore.beach + 6, wave: 2 },
      { level: 2, fromWater: shore.beach + 20, wave: 2 },
    ],
    seed: params.seed,
  };
}

/** The coastline a generated plot of this size and seed gets. */
function shoreSpecFor(params: ResortParams): ShoreSpec {
  return {
    inset: Math.max(SHORE_INSET.min, Math.round(params.tilesZ * SHORE_INSET.of)),
    beach: Math.round(clamp(params.tilesZ * SHORE_BEACH.of, SHORE_BEACH.min, SHORE_BEACH.max)),
    wave: SHORE_BEACH.wander,
    seed: params.seed,
  };
}

/**
 * The sand a beach object may stand on: everything but the wet strip at the
 * water's edge and the last row against the grass.
 *
 * Both are left bare on purpose. The seaward one is the tideline, which is what
 * makes the beach read as a beach rather than as a car park with sand in it; the
 * landward one is the lane the boardwalks come in along, and reserving it is
 * what stops the sand from being paved edge to edge by spurs later.
 */
function isBuildableSand(shore: Shore, tileX: number, tileZ: number): boolean {
  const depth = beachDepthAt(shore, tileX, tileZ);
  return depth >= 1 && depth <= shore.spec.beach - 2;
}

/**
 * What stands at the water's edge, and what stands behind it.
 *
 * Weighted by repetition rather than by a table of numbers: a beach is mostly
 * loungers and parasols with a bungalow here and there, and the shortest way to
 * say that is to write the loungers down more often. The two lists are also the
 * whole of the rule that a beach club does not end up on the tideline.
 *
 * The front list is one-tile objects only, because the front is laid in runs —
 * see {@link standRun}.
 */
const BEACH_FRONT: readonly string[] = [
  'sun-lounger',
  'sun-lounger',
  'sun-lounger',
  'beach-umbrella',
  'beach-umbrella',
];
const BEACH_BACK: readonly string[] = [
  'bungalow',
  'bungalow',
  'bungalow',
  'bungalow',
  'poolside-bar',
  'poolside-bar',
  'beach-club',
  'palm',
  'palm',
  'tikitorch',
];

/**
 * How deep into the sand the loungers give way to the buildings: the seaward
 * half of it, so both bands scale with a wider or narrower beach.
 */
const beachFrontDepth = (shore: Shore): number => Math.floor(shore.spec.beach / 2);

/** How much of the buildable sand is attempted, per tile visited. */
const BEACH_DENSITY = 0.85;

/** How many one-tile objects stand shoulder to shoulder in one run. */
const BEACH_RUN = { min: 3, max: 7 } as const;

/**
 * Draws from a pool before giving a tile up.
 *
 * A beach club is six tiles across with its skirt and will not fit in most of
 * the gaps a beach leaves; taking the first draw as final would mean every one
 * of those gaps stayed empty because a beach club happened to be named for it.
 */
const BEACH_DRAWS = 3;

/**
 * Fills the sand.
 *
 * The one rule that matters is the skirt: a cluster is placed only when the ring
 * of tiles *around* it is free too, and that ring is claimed with it. Without it
 * a run of loungers packs solid, and `layoutResort` throws — it grows a spur from
 * every object to the path network and refuses a plan where something is walled
 * in. With it, the free tiles between the clusters are one connected piece
 * running the length of the beach and out onto the grass, so a boardwalk can
 * always be walked to anything standing here.
 *
 * That is the same guarantee the districts get from their free row, arrived at
 * differently because a beach is not laid out in rows. It is also why the small
 * things go down as *runs* rather than one at a time: a skirt around every
 * single lounger would stand them three tiles apart, which is a car park, not a
 * beach. A run is skirted once, so the loungers inside it sit shoulder to
 * shoulder — and the run is walked east, along the water rather than across it.
 */
function fillBeach(parts: BeachParts): void {
  const { shore, random } = parts;
  for (const tile of beachTilesOf(shore)) {
    if (!isBuildableSand(shore, tile.x, tile.z)) continue;
    if (random() > BEACH_DENSITY) continue;
    standOnSand(parts, tile);
  }
}

/** Everything filling the sand needs; the same shape each stander is handed. */
interface BeachParts {
  readonly shore: Shore;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly site: Site;
  readonly missing: Set<string>;
  readonly random: () => number;
  readonly plots: ResortPlot[];
}

/**
 * Stands whatever the sand at one tile calls for, or leaves it bare.
 *
 * The walk crosses each row from the grass to the water, so the buildings get
 * their pick of the sand before the loungers start filling it in.
 */
function standOnSand(parts: BeachParts, tile: Tile): void {
  const { shore, types, missing, random } = parts;
  const front = beachDepthAt(shore, tile.x, tile.z) <= beachFrontDepth(shore);
  const pool = front ? BEACH_FRONT : BEACH_BACK;

  for (let draw = 0; draw < BEACH_DRAWS; draw++) {
    const wanted = pool.find((id) => missing.has(id)) ?? pool[Math.floor(random() * pool.length)]!;
    const type = types.get(wanted);
    if (!type) continue;
    if (!(front ? standRun(parts, type, tile) : standOne(parts, type, tile))) continue;
    missing.delete(type.id);
    return;
  }
}

/** Stands one object on the sand, skirt and all. False if it will not go. */
function standOne(parts: BeachParts, type: GeneratorType, tile: Tile): boolean {
  const { site, random, plots } = parts;
  // Mostly unturned, occasionally not, with the unturned footprint always there
  // as the fallback: the same bargain `turnFor` strikes, so a turn is never the
  // reason the sand comes out bare.
  const turned: Rotation =
    random() < QUARTER_TURN_CHANCE ? normalizeRotation(Math.floor(random() * 4)) : 0;
  for (const rotation of [turned, 0] as const) {
    const covered = footprintTilesAt(footprintOf(type, rotation), tile);
    const region = withSkirt(covered);
    if (!tilesFree(site, region)) continue;
    claimTiles(site, region);
    plots.push({ id: type.id, tileX: tile.x, tileZ: tile.z, rotation });
    return true;
  }
  return false;
}

/**
 * Stands a run of one-tile objects along the water, skirted once as a whole.
 *
 * The run steps east, along the shore rather than into it, so a row of loungers
 * faces the sea down its whole length instead of walking out through the
 * tideline. It grows a tile at a time and stops at the first one that will not
 * go, so a run at the end of the beach comes out short rather than not at all.
 */
function standRun(parts: BeachParts, type: GeneratorType, tile: Tile): boolean {
  const { shore, site, random, plots } = parts;
  const wanted = BEACH_RUN.min + Math.floor(random() * (BEACH_RUN.max - BEACH_RUN.min + 1));

  const run: Tile[] = [];
  for (let step = 0; step < wanted; step++) {
    const next = { x: tile.x + step, z: tile.z };
    if (!isBuildableSand(shore, next.x, next.z)) break;
    const grown = [...run, next];
    if (!tilesFree(site, withSkirt(grown))) break;
    run.push(next);
  }
  if (run.length === 0) return false;

  claimTiles(site, withSkirt(run));
  for (const stand of run) plots.push({ id: type.id, tileX: stand.x, tileZ: stand.z, rotation: 0 });
  return true;
}

/** The tiles a footprint covers, anchored at its north-west corner. */
function footprintTilesAt(footprint: Extent, tile: Tile): Tile[] {
  const tiles: Tile[] = [];
  for (let x = tile.x; x < tile.x + footprint.x; x++) {
    for (let z = tile.z; z < tile.z + footprint.z; z++) tiles.push({ x, z });
  }
  return tiles;
}

/** A set of tiles and the ring around it: what a beach cluster has to have free. */
function withSkirt(tiles: readonly Tile[]): Tile[] {
  const region = new Map<string, Tile>();
  for (const tile of tiles) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = tile.x + dx;
        const z = tile.z + dz;
        region.set(tileKey(x, z), { x, z });
      }
    }
  }
  return [...region.values()];
}

function tilesFree(site: Site, tiles: readonly Tile[]): boolean {
  return tiles.every(
    (tile) =>
      tile.x >= 0 &&
      tile.z >= 0 &&
      tile.x < site.tilesX &&
      tile.z < site.tilesZ &&
      !site.taken.has(tileKey(tile.x, tile.z)),
  );
}

function claimTiles(site: Site, tiles: readonly Tile[]): void {
  for (const tile of tiles) site.taken.add(tileKey(tile.x, tile.z));
}

/**
 * The last row a gate this wide can stand on with dry land under all of it.
 *
 * On a plot with no shore that is the plot's own south edge. On one with a beach
 * it is the row the sand starts on, so the southern gate ends up straddling the
 * promenade exactly where it runs out onto the beach — which is a better place
 * for a gate than the old one was, and is the only place left for it.
 */
function southGateRow(
  shore: Shore | null,
  tilesZ: number,
  fromX: number,
  gateTilesX: number,
  gateTilesZ: number,
): number {
  if (!shore) return tilesZ - gateTilesZ;
  let sandStarts = tilesZ;
  for (let x = fromX; x < fromX + gateTilesX; x++) {
    sandStarts = Math.min(sandStarts, waterStartZ(shore, x) - shore.spec.beach);
  }
  return sandStarts - gateTilesZ;
}

/** The gate at each end of the promenade, and the fountain in its plaza. */
function landmarks(parts: {
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly promenade: Street;
  readonly plaza: { x0: number; x1: number; z0: number; z1: number };
  readonly site: Site;
  readonly shore: Shore | null;
  readonly missing: Set<string>;
}): ResortPlot[] {
  const { types, site, missing } = parts;
  const plots: ResortPlot[] = [];
  const stand = (
    type: GeneratorType | undefined,
    tileX: number,
    tileZ: number,
    rotation: Rotation = 0,
  ): void => {
    // A landmark's turn is always a half one, so the footprint it is checked and
    // claimed against is the one it was positioned for.
    if (!type || !fits(site, footprintOf(type, rotation), tileX, tileZ)) return;
    claim(site, footprintOf(type, rotation), tileX, tileZ);
    plots.push({ id: type.id, tileX, tileZ, rotation });
    missing.delete(type.id);
  };

  // Both gates straddle the promenade's ends, which is what makes them read as
  // the way in rather than as two more buildings — and the southern one is turned
  // to face back up the promenade, so the pair reads as two ends of one street
  // rather than as the same gate stamped twice. On a plot with a beach the
  // southern end is where the promenade meets the sand; see `southGateRow`.
  const gate = types.get(GATE_ID);
  if (gate) {
    const tileX = parts.promenade.at - Math.floor(gate.tilesX / 2);
    stand(gate, tileX, 0);
    stand(gate, tileX, southGateRow(parts.shore, site.tilesZ, tileX, gate.tilesX, gate.tilesZ), 2);
  }

  const fountain = types.get(PLAZA_ID);
  if (fountain) {
    // Centred, so the paving rings it rather than being severed by it.
    stand(
      fountain,
      Math.round((parts.plaza.x0 + parts.plaza.x1 - fountain.tilesX + 1) / 2),
      Math.round((parts.plaza.z0 + parts.plaza.z1 - fountain.tilesZ + 1) / 2),
    );
  }
  return plots;
}

/** The plaza where the promenade crosses the middle of the plot. */
function plazaAt(promenade: Street, band: Street, tilesX: number, tilesZ: number) {
  const span = spanOf(promenade);
  return {
    x0: Math.max(0, span.low - 1),
    x1: Math.min(tilesX - 1, span.high + 1),
    z0: Math.max(0, band.at - 2),
    z1: Math.min(tilesZ - 1, band.at + 1),
  };
}

/** Nodes and edges for one run of parallel streets, strung between two bounds. */
function streetGraph(
  streets: readonly Street[],
  prefix: string,
  from: (street: Street) => PathNode,
  to: (street: Street) => PathNode,
) {
  const nodes: PathNode[] = [];
  const edges = streets.map((street, index) => {
    const head = { ...from(street), id: `${prefix}${index}-a` };
    const tail = { ...to(street), id: `${prefix}${index}-b` };
    nodes.push(head, tail);
    return { from: head.id, to: tail.id, width: street.width };
  });
  return { nodes, edges };
}

/**
 * Grows a whole resort from four numbers.
 *
 * The catalogue is passed in rather than imported so this stays a pure function
 * of its arguments — the art is data to the generator, exactly as it is to the
 * rest of the layout.
 */
export function generateResort(types: readonly GeneratorType[], params: ResortParams): ResortPlan {
  const { tilesX, tilesZ, density, seed } = clampParams(params);
  const random = createRandom(seed);

  const buildable = types.filter((type) => !DERIVED_IDS.has(type.id));
  const byId = new Map(buildable.map((type) => [type.id, type]));
  // Largest first, so a tennis court gets its pick of the districts while there
  // is still a district that will take it.
  const bySize = buildable.toSorted((a, b) => b.tilesX * b.tilesZ - a.tilesX * a.tilesZ);

  const columns = columnsFor(random, tilesX);
  const bands = bandsFor(tilesZ);
  const promenade = columns.find((street) => street.width === PROMENADE_WIDTH) ?? columns[0]!;
  const plaza = plazaAt(promenade, bands[Math.floor(bands.length / 2)]!, tilesX, tilesZ);

  const down = streetGraph(
    columns,
    'col',
    (street) => ({ id: '', tileX: street.at, tileZ: 1 }),
    (street) => ({ id: '', tileX: street.at, tileZ: tilesZ - 2 }),
  );
  const across = streetGraph(
    bands,
    'band',
    (street) => ({ id: '', tileX: columns[0]!.at, tileZ: street.at }),
    (street) => ({ id: '', tileX: columns[columns.length - 1]!.at, tileZ: street.at }),
  );
  const skeleton: ResortPlan = {
    tilesX,
    tilesZ,
    plots: [],
    nodes: [...down.nodes, ...across.nodes],
    edges: [...down.edges, ...across.edges],
    plazas: [plaza],
    shore: shoreSpecFor({ tilesX, tilesZ, density, seed }),
    elevation: temporaryElevationFor(
      { tilesX, tilesZ, density, seed },
      shoreSpecFor({ tilesX, tilesZ, density, seed }),
    ),
  };
  const shore = shoreFor(skeleton);

  const site: Site = { taken: new Set(), tilesX, tilesZ };
  const missing = new Set(buildable.map((type) => type.id));
  // The sea is spoken for before anything is stood, so nothing below has to
  // check for it: a district, a landmark and a lane all just find the tiles
  // taken. The streets are worked out here too, because the sand is reserved
  // against them in a moment and a street that crosses it keeps its tiles.
  for (const tile of waterTilesOf(shore)) site.taken.add(tileKey(tile.x, tile.z));
  const streets = streetTiles(skeleton);
  const paved = new Set(streets.map((tile) => tileKey(tile.x, tile.z)));

  // Landmarks are stood before the streets are marked, because both of them are
  // meant to sit on the paving: the gates straddle the promenade's ends and the
  // fountain stands in the middle of its plaza.
  const plots = landmarks({ types: byId, promenade, plaza, site, shore, missing });

  // The sand is held back from the districts and handed to `fillBeach` after
  // them; only the tiles this reservation actually took are given back, so a
  // gate or a street already standing on the beach keeps what it claimed.
  const reservedSand = shore
    ? beachTilesOf(shore).filter(
        (tile) => !paved.has(tileKey(tile.x, tile.z)) && !site.taken.has(tileKey(tile.x, tile.z)),
      )
    : [];
  for (const tile of reservedSand) site.taken.add(tileKey(tile.x, tile.z));

  for (const tile of streets) site.taken.add(tileKey(tile.x, tile.z));

  const columnGaps = gapsBetween(columns, 0, tilesX - 1, false);
  const bandGaps = gapsBetween(bands, 0, tilesZ - 1, true);
  const themes = themesFor(random, columnGaps.length * bandGaps.length);
  bandGaps.forEach((band, bandIndex) => {
    columnGaps.forEach((column, columnIndex) => {
      fillDistrict({
        district: {
          x0: column.low,
          x1: column.high,
          z0: band.low,
          z1: band.high,
          theme: themes[bandIndex * columnGaps.length + columnIndex]!,
        },
        types: bySize,
        missing,
        site,
        density,
        random,
        plots,
      });
    });
  });

  if (shore) {
    for (const tile of reservedSand) {
      if (isBuildableSand(shore, tile.x, tile.z)) site.taken.delete(tileKey(tile.x, tile.z));
    }
    fillBeach({ shore, types: byId, site, missing, random, plots });
  }

  return { ...skeleton, plots, standsWholeCatalogue: missing.size === 0 };
}

/**
 * Bare ground of a given size: no objects, no streets, nothing to look at.
 *
 * The starting point for building a resort by hand rather than being handed one.
 * It is the one plan that cannot claim to stand the whole catalogue, which is
 * why `standsWholeCatalogue` exists at all.
 */
export function emptyResortPlan(tilesX: number, tilesZ: number): ResortPlan {
  const params = clampParams({ tilesX, tilesZ, density: 1, seed: 0 });
  return {
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    plots: [],
    nodes: [],
    edges: [],
    plazas: [],
    // Bare ground, but not bare land: the coast and the terraces are facts about
    // the plot rather than about what has been built on it, so a cleared plot
    // still has its beach and its benches to build on.
    shore: shoreSpecFor(params),
    elevation: temporaryElevationFor(params, shoreSpecFor(params)),
    standsWholeCatalogue: false,
  };
}
