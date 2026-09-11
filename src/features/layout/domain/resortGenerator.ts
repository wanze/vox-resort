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
 * 1. **Streets first.** A promenade with a gate at each end, cross streets at
 *    intervals, and service lanes down the flanks and between the columns. The
 *    network is laid out before anything is built on it, which is what makes
 *    every district border a street by construction rather than by luck. All of
 *    it stops at the foot of the hill, because that is where the level ground
 *    stops; two lanes carry on over the hill, across the sand and out onto the
 *    water as piers, and they are the only paving the beach ever sees — see
 *    {@link SEA_LANES} and {@link PIER_TILES}.
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
 * 5. **The beach and the hill are not districts, and are filled first.** The
 *    plot's southern end is sea, with a band of sand across its full width, and
 *    behind the sand the land rises into a hill and comes back down again. A row
 *    grid is precisely the wrong shape for either — a hotel laid out in rows is
 *    what a beach is not, and a hillside bench is a few tiles deep and curved —
 *    so both are filled on their own terms *before* the districts, and whatever
 *    they leave bare is then reserved against the districts wholesale. That
 *    order is also what puts a lounger on the sand and a bungalow on the shelf
 *    rather than in whichever district the walk reached first. See
 *    {@link fillBeach} and {@link fillHill}.
 *
 * 6. **The beach is three lines and a band.** Loungers and parasols lie in three
 *    lines at fixed depths into the sand, following the water the way the dune
 *    behind them does, with the clubs and the palms in the band behind. Nothing
 *    on it is paved to: sand is walked on, so `layoutResort` grows no spur to
 *    anything standing there and routes none across it, and the beach keeps the
 *    two lanes that cross it to the sea and nothing else. See
 *    {@link beachLineDepths}.
 *
 * 7. **The hill is the whole shape of the plot.** Three levels of sand climb
 *    straight off the back of the beach onto a shelf wide enough for a row of
 *    bungalows and a sidewalk; grass benches carry on up to a crest with houses
 *    and palms on them; and the far side comes back down to sea level, where the
 *    streets and the districts are. Every step is anchored to the water and
 *    given no wobble of its own, which is what keeps the steps from ever
 *    crossing and what makes the whole hill curve with the coast — see
 *    {@link hillFor}. The cross streets are held north of it and the fills
 *    refuse anything that would stand across a step, so a plot is buildable
 *    everywhere it is flat. It is walked by paths of its own: one along the
 *    middle of every bench wide enough to hold one, and two switchbacks climbing
 *    across them from the dune to the crest and down the other side — see
 *    {@link walksFor}.
 *
 * Everything here is a pure function of the parameters, and the seed makes it
 * reproducible: the same four numbers give the same resort, which is what lets
 * a plot be shared, benchmarked and regression-tested.
 */

import type { ModelCategory } from '../../../../voxel-gen/voxelgen.ts';
import { createRandom } from './random';
import {
  DERIVED_IDS,
  type PathEdge,
  type PathNode,
  type ResortPlan,
  type ResortPlot,
} from './resortPlan';
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
import {
  elevationFor,
  levelAt,
  raisedTilesOf,
  straddledTile,
  terraceAt,
  type Elevation,
  type ElevationSpec,
  type LevelProvider,
  type TerraceSpec,
  type TerraceSurface,
} from './elevation';
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

/**
 * The streets running west to east, kept north of the hill.
 *
 * A cross street is a straight run at one z, and the hill's benches are not
 * straight — they follow the coast. A street laid across one would spend its
 * length drifting on and off a step, which is a staircase a hundred tiles long
 * rather than a street. So the whole cross-street grid, and with it every
 * district it bounds, stops where the hill's landward foot begins; the hill is
 * reached by the north-south lanes that climb it and by walks of its own. See
 * {@link hillFor}.
 */
function bandsFor(tilesZ: number, southLimit: number): Street[] {
  const limit = Math.min(tilesZ - 2, southLimit);
  const positions = spread(1, limit, clamp(Math.round(limit / 20), 1, 6));
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
  /** How high the ground is, so nothing is laid across a terrace step. */
  readonly levelOf: LevelProvider;
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
  // The ground has to be level under the whole footprint, which `layoutResort`
  // would otherwise refuse the finished plan for — see `straddledTile`.
  const straddled = straddledTile(site.levelOf, {
    tileX,
    tileZ,
    tilesX: footprint.x,
    tilesZ: footprint.z,
  });
  return straddled === null;
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
 *
 * Both are narrower than they were, and the rows they give back go to the hill.
 * A beach is three lines of loungers, a band of palms and clubs behind them, and
 * the two rows nothing stands on — see {@link beachLineDepths}. Twenty-two rows
 * of sand was twice what that needs, and the sand it added was the part of the
 * plot with the least on it.
 */
const SHORE_INSET = { of: 0.07, min: 5 } as const;
const SHORE_BEACH = { of: 0.14, min: 10, max: 16, wander: 3 } as const;

/**
 * How the hill behind the beach is shaped.
 *
 * `dune` levels climb straight off the back of the sand, a row per step, and the
 * last of them carries the `shelf` — a flat bench of sand wide enough to stand a
 * row of bungalows and run a sidewalk between them. Behind that the ground turns
 * to grass and goes on up in `bench` steps to the crest, then comes back down
 * the far side to sea level, alternating a wide step with a narrow one so every
 * other bench is deep enough to put a house on and the ones between are the
 * flights that get there.
 *
 * `resort` is what the hill is not allowed to eat: the rows of level ground
 * behind it that the streets and districts need. A hill that used the whole plot
 * would be a hill, not a resort with a hill behind its beach.
 */
const HILL = {
  /** Levels of sand the dune climbs off the beach. */
  dune: 3,
  /** The tallest crest worth building, and the shortest thing still a hill. */
  peak: { max: 6, min: 3 },
  /** Rows of flat sand on top of the dune: where the bungalows stand. */
  shelf: { of: 0.09, min: 4, max: 11 },
  /** Rows of each grass bench on the way up to the crest. */
  bench: { of: 0.07, min: 4, max: 9 },
  /** Rows of the wide benches on the way back down. */
  step: { of: 0.05, min: 3, max: 7 },
  /** Rows of level ground the resort proper keeps behind the hill. */
  resort: 24,
} as const;

/**
 * The shortest bench a walk can be run down the middle of without drifting off
 * it.
 *
 * A walk holds one row's z between its nodes and the coast drifts under it, so a
 * bench narrower than this is one the walk would spend its length stepping on
 * and off — which is a staircase running the width of the plot rather than a
 * path. The benches that fail it are the one-row flights on the way down, and a
 * flight is not somewhere a path runs *along* anyway.
 */
const WALKABLE_BENCH = 5;

/** One step of the hill: what it climbs to, and the bench behind it. */
interface HillStep {
  readonly level: number;
  readonly surface: TerraceSurface;
  /** Rows of flat ground behind this step, before the next one moves again. */
  readonly depth: number;
}

/** The hill a plot got, as terraces and as the one number the rest of it needs. */
interface Hill {
  readonly terraces: readonly TerraceSpec[];
  /**
   * Rows landward of the water where the hill's last step falls — the beach plus
   * the whole hill on top of it.
   *
   * Every step is anchored to the water with no wobble of its own, so this is
   * exact in every column rather than approximate: `waterStartZ(x) - inset` is
   * the first row of level ground behind the hill in column `x`. That is what
   * the cross streets are held north of and where the southern gate stands.
   */
  readonly inset: number;
}

/** The steps of a hill with its crest at `peak`, seaward first. */
function hillStepsFor(
  peak: number,
  size: { shelf: number; bench: number; step: number },
): HillStep[] {
  const steps: HillStep[] = [];
  for (let level = 1; level <= HILL.dune; level++) {
    steps.push({
      level,
      surface: 'sand',
      depth: level < HILL.dune ? 1 : size.shelf,
    });
  }
  for (let level = HILL.dune + 1; level <= peak; level++) {
    steps.push({ level, surface: 'grass', depth: size.bench });
  }
  // Down the far side: a wide bench, a narrow one, a wide one. The wide ones are
  // where the houses stand and the narrow ones are the flights between them.
  for (let level = peak - 1; level >= 1; level--) {
    steps.push({
      level,
      surface: 'grass',
      depth: (peak - 1 - level) % 2 === 0 ? size.step : 1,
    });
  }
  steps.push({ level: 0, surface: 'grass', depth: 0 });
  return steps;
}

/** How many rows of the plot a run of steps takes up. */
const hillDepthOf = (steps: readonly HillStep[]): number =>
  steps.reduce((rows, step) => rows + step.depth, 0);

/**
 * The steps as terraces: the same list, with each step's inset accumulated.
 *
 * Every one of them is anchored to the **water** and given no wobble of its own,
 * and that single decision is what makes the whole hill work:
 *
 * - The steps stay exactly `depth` rows apart in every column, so they can never
 *   cross — which is the one thing `elevationFor` refuses a plan for, and here it
 *   holds by construction rather than by a margin.
 * - The hill still curves, because the coast does. A line a fixed distance in
 *   from a wandering shore wanders with it, so the dune, the shelf and every
 *   bench above them run parallel to the beach, and the flights that climb them
 *   land at a different row in every lane. A hill built off the plot's own edge
 *   instead would be a flight of straight steps, which is a stadium.
 * - The first step sits exactly on the back of the sand, so the beach keeps its
 *   whole depth at level 0 and the flight up the dune starts on the last row of
 *   it: you climb off the beach rather than walking up decking laid against it.
 */
function terracesOf(steps: readonly HillStep[], beach: number): TerraceSpec[] {
  let inset = beach;
  return steps.map((step) => {
    const terrace: TerraceSpec = {
      level: step.level,
      inset,
      anchor: 'water',
      wave: 0,
      surface: step.surface,
    };
    inset += step.depth;
    return terrace;
  });
}

/**
 * The hill a plot of this depth can carry, or null when it can carry none.
 *
 * The crest comes down a level at a time until the whole thing fits behind the
 * beach with `HILL.resort` rows of level ground still to spare, and a plot too
 * shallow even for the shortest hill is left flat — which is the same bargain
 * every other size on this plot strikes: shrink first, and refuse only at the
 * end.
 *
 * The coast's own wobble is taken off the room available rather than averaged
 * into it, because the hill hangs off the water: in the column where the sea
 * reaches furthest inland, the hill comes with it.
 */
function hillFor(params: ResortParams, shore: ShoreSpec): Hill | null {
  const size = {
    shelf: Math.round(clamp(params.tilesZ * HILL.shelf.of, HILL.shelf.min, HILL.shelf.max)),
    bench: Math.round(clamp(params.tilesZ * HILL.bench.of, HILL.bench.min, HILL.bench.max)),
    step: Math.round(clamp(params.tilesZ * HILL.step.of, HILL.step.min, HILL.step.max)),
  };
  const rows = params.tilesZ - 1 - shore.inset - shore.wave - shore.beach - HILL.resort;
  for (let peak = HILL.peak.max; peak >= HILL.peak.min; peak--) {
    const steps = hillStepsFor(peak, size);
    const depth = hillDepthOf(steps);
    if (depth <= rows) {
      return { terraces: terracesOf(steps, shore.beach), inset: shore.beach + depth };
    }
  }
  return null;
}

/** The elevation spec a hill makes, or none at all on a plot too shallow for one. */
function elevationSpecFor(hill: Hill | null, seed: number): ElevationSpec | null {
  return hill ? { terraces: hill.terraces, seed } : null;
}

/**
 * The first row of level ground behind the hill, in one column.
 *
 * Exact rather than approximate — see {@link Hill.inset} — and the plot's own
 * south edge on a plot with neither hill nor shore.
 */
function landStartZ(shore: Shore | null, hill: Hill | null, tilesZ: number, tileX: number): number {
  if (!shore) return tilesZ;
  return waterStartZ(shore, tileX) - (hill ? hill.inset : shore.spec.beach);
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

/** What the lines at the water's edge are laid with. */
const LOUNGER_ID = 'sun-lounger';
const UMBRELLA_ID = 'beach-umbrella';

/** What watches the water from the tideline. */
const LIFEGUARD_ID = 'lifeguard-tower';

/** The court the back of the beach gets first pick of a stretch of sand for. */
const VOLLEYBALL_ID = 'volleyball';

/**
 * Types the districts never draw from, because the shore is where they belong.
 *
 * The first rule of its kind on the plot, and it is worth saying why it took
 * this long to need one — and why it holds exactly one id. A beach club inland
 * is a pool club, a palm inland is a palm, and a volleyball court on a lawn is a
 * volleyball court, which is why that one is *not* here: it is offered to the
 * sand first, by being in {@link BEACH_BACK}, and is perfectly welcome in a
 * district when the sand has no six-by-four to give it. Almost everything the
 * beach carries reads somewhere else, which is why the generator has always let
 * the whole catalogue into every district and let the beach take its pick first.
 *
 * A lifeguard tower is the one that does not read anywhere else. It watches
 * water, and there is none behind the hotels.
 *
 * It stays in `missing` rather than being filtered out of the catalogue, which
 * matters: were the beach ever unable to stand one, the plot would report that
 * it does not hold the whole catalogue rather than claiming it does and being
 * caught out by `requireEveryTypePlanted`.
 */
const SHORE_ONLY: ReadonlySet<string> = new Set([LIFEGUARD_ID]);

/**
 * Tiles of shore between one lifeguard tower and the next.
 *
 * Twenty-four is a hundred metres of beach apiece, which is about what a real
 * bay is patrolled at and — the reason the number is here rather than drawn from
 * the density — what keeps a tower reading as a landmark. Scattered at the
 * density the loungers are laid at, a bay came out with a dozen of them and they
 * stopped being the thing your eye goes to along the sand.
 */
const LIFEGUARD_SPACING = 24;

/**
 * What stands on the sand behind the lines.
 *
 * Weighted by repetition rather than by a table of numbers: the back of a beach
 * is mostly palms and torches with a club, a rinse or a row of huts here and
 * there, and the shortest way to say that is to write the palms down more often.
 * The list is also the whole of the rule that a beach club does not end up on
 * the tideline.
 *
 * The cabins and the showers are here for the reason the bar is: they are what
 * the back of a beach has, and they are wanted behind the sunbathers rather than
 * among them. Neither is in {@link SHORE_ONLY} — a rinse and a row of changing
 * huts read by a pool exactly as they read on sand, so a district that draws one
 * has drawn something that belongs there.
 */
const BEACH_BACK: readonly string[] = [
  'beach-club',
  VOLLEYBALL_ID,
  'poolside-bar',
  'poolside-bar',
  'changing-cabins',
  'beach-shower',
  'beach-shower',
  'palm',
  'palm',
  'palm',
  'palm',
  'palm',
  'tikitorch',
  'tikitorch',
  'tikitorch',
  'tikitorch',
];

/**
 * Where the lines of loungers run, as depths into the sand.
 *
 * Three of them, a clear row of sand between each, starting one row up from the
 * tideline — the way a beach club actually sets its furniture out, and the thing
 * a scatter of runs never quite read as however well it was skirted. The depths
 * are fixed rather than scaled: a line is a line whatever the sand behind it is
 * doing, and the beach's own size decides how much room the palms and the clubs
 * get behind them, not how far apart the sunbathers lie.
 *
 * They are *depths*, so each line follows the coast: a fixed distance in from a
 * wandering shore wanders with it, exactly as the dune behind does. See
 * {@link layBeachLines}.
 *
 * Nobody sleeps on this beach either: the bungalows are up on the shelf on top
 * of the dune, where a row of them along a sidewalk reads as the lodgings *of*
 * the beach rather than as buildings standing in the middle of it. See
 * {@link SHELF_POOL}.
 */
const BEACH_LINES = { count: 3, first: 1, spacing: 2 } as const;

/** How many loungers stand between one parasol and the next. */
const UMBRELLA_EVERY = 4;

/** How long a gap in a line is, once the density has decided to leave one. */
const BEACH_GAP = { min: 2, max: 5 } as const;

/** The depth into the sand each line of loungers runs at, seaward first. */
function beachLineDepths(shore: Shore): number[] {
  const deepest = shore.spec.beach - 2;
  return Array.from(
    { length: BEACH_LINES.count },
    (_, index) => BEACH_LINES.first + index * BEACH_LINES.spacing,
  ).filter((depth) => depth <= deepest);
}

/** The first depth into the sand behind the lines: where the back of the beach starts. */
const beachBackDepth = (shore: Shore): number =>
  (beachLineDepths(shore).at(-1) ?? 0) + BEACH_LINES.spacing;

/**
 * How much of the buildable sand is attempted, per tile visited, at full
 * density.
 *
 * Scaled by the plot's own density like everything else on it. The beach used to
 * ignore the slider, and once the beach and the hill between them held half of
 * what stood on a plot that made the slider a control over the other half — a
 * resort at a fifth density came out barely emptier than one at full.
 */
const BEACH_DENSITY = 1;

/**
 * Draws from a pool before giving a tile up.
 *
 * A beach club is six tiles across with its skirt and will not fit in most of
 * the gaps a beach leaves; taking the first draw as final would mean every one
 * of those gaps stayed empty because a beach club happened to be named for it.
 */
const BEACH_DRAWS = 3;

/**
 * Fills the sand: the lines first, then whatever the back of the beach takes.
 *
 * The order is the point. The lines are laid on their own depths whatever else
 * wants the sand, and the back fill is then held behind them — so a beach club
 * can never land in the middle of a line of sunbathers, and the three lines read
 * as three lines all the way along the bay.
 *
 * Nothing on the sand is skirted against the *path* network any more, because
 * nothing on the sand needs one: sand is walked on, and `layoutResort` grows no
 * spur to anything standing on it. That is what lets a line of loungers lie
 * shoulder to shoulder without a boardwalk down either side of it, and it is
 * what took the two walks that used to cross the beach off it — see
 * `resortLayout.ts`.
 */
function fillBeach(parts: BeachParts): void {
  standLifeguards(parts);
  layBeachLines(parts);
  fillBeachBack(parts);
}

/**
 * Stands a lifeguard tower every {@link LIFEGUARD_SPACING} columns of shore, on
 * the seaward-most row anything is allowed to stand on.
 *
 * Before the lines rather than after them, and that order is the whole of it: a
 * tower belongs on the tideline looking at the water, which is exactly the row
 * the first line of loungers wants, and whichever of the two goes down first
 * gets it. The line is the thing that can afford to give way — it stops for a
 * tile and carries on, which is what it already does where a lane crosses the
 * sand — and a tower pushed behind the sunbathers is a tower watching the backs
 * of their heads.
 *
 * Unturned, always: the model's open side and its ladder face +z, which on every
 * generated plot is the water. This is the one thing on the sand that has a front
 * and knows where it has to point, so it is the one thing `standOne`'s quarter
 * turn is not offered to.
 */
function standLifeguards(parts: BeachParts): void {
  const { shore, types, missing, site, plots } = parts;
  const tower = types.get(LIFEGUARD_ID);
  if (!tower) return;
  for (let anchor = 0; anchor < site.tilesX; anchor += LIFEGUARD_SPACING) {
    // Walked forward from the anchor rather than dropped on it, as far as the
    // next tower's column: where a sea lane comes down to the water the anchor's
    // own tile is already spoken for, and a bay that quietly went one tower short
    // there would be a bay the catalogue is not fully stood on.
    for (let tileX = anchor; tileX < Math.min(site.tilesX, anchor + LIFEGUARD_SPACING); tileX++) {
      const tileZ = waterStartZ(shore, tileX) - 1 - BEACH_LINES.first;
      if (!isBuildableSand(shore, tileX, tileZ)) continue;
      if (site.taken.has(tileKey(tileX, tileZ))) continue;
      site.taken.add(tileKey(tileX, tileZ));
      plots.push({ id: tower.id, tileX, tileZ, rotation: 0 });
      missing.delete(tower.id);
      break;
    }
  }
}

/**
 * Lays the three lines of loungers, each at its own depth into the sand.
 *
 * A line is walked east, along the water rather than across it, and it stops for
 * nothing but a tile that is already spoken for — the lane where a street comes
 * down to the sea, which cuts the line in two and carries on. Every fourth place
 * gets a parasol instead of a lounger, counted along the line rather than off
 * the column, so a lane crossing the sand does not put all three lines' parasols
 * in step.
 *
 * The density slider breaks a line into runs rather than thinning it tile by
 * tile. A line with every third lounger missing reads as a scatter that happens
 * to be in a row; a line of eight with a gap of three and then another eight
 * reads as what it is, which is a beach filling up from one end.
 */
function layBeachLines(parts: BeachParts): void {
  const lounger = parts.types.get(LOUNGER_ID);
  const umbrella = parts.types.get(UMBRELLA_ID);
  if (!lounger || !umbrella) return;
  for (const [line, depth] of beachLineDepths(parts.shore).entries()) {
    layBeachLine({ ...parts, line, depth, lounger, umbrella });
  }
}

/** One line of loungers, walked east along the water at its own depth. */
function layBeachLine(
  parts: BeachParts & {
    readonly line: number;
    readonly depth: number;
    readonly lounger: GeneratorType;
    readonly umbrella: GeneratorType;
  },
): void {
  const { shore, line, depth, lounger, umbrella, missing, site, random, plots } = parts;
  let along = 0;
  let gap = 0;

  for (let tileX = 0; tileX < site.tilesX; tileX++) {
    const tileZ = waterStartZ(shore, tileX) - 1 - depth;
    if (!isBuildableSand(shore, tileX, tileZ)) continue;
    // A lane crossing the sand cuts the line in two and it carries on.
    if (site.taken.has(tileKey(tileX, tileZ))) continue;
    if (gap > 0) {
      gap--;
      continue;
    }
    if (random() > BEACH_DENSITY * parts.density) {
      gap = BEACH_GAP.min + Math.floor(random() * (BEACH_GAP.max - BEACH_GAP.min + 1));
      continue;
    }

    along++;
    const type = along % UMBRELLA_EVERY === line % UMBRELLA_EVERY ? umbrella : lounger;
    // A lounger faces the water, which is what it is unturned — the backrest is
    // at its northern end. A parasol has no front at all, six stripes round a
    // pole, so it is stood at a random quarter and a line of them stops reading
    // as one model stamped down the beach.
    const rotation: Rotation = type === umbrella ? normalizeRotation(Math.floor(random() * 4)) : 0;
    site.taken.add(tileKey(tileX, tileZ));
    plots.push({ id: type.id, tileX, tileZ, rotation });
    missing.delete(type.id);
  }
}

/**
 * Fills the sand behind the lines with what a beach carries: palms, torches, a
 * bar, and the odd club.
 *
 * The skirt is what matters here. A cluster is placed only when the ring of
 * tiles *around* it is free too, and that ring is claimed with it, so the clubs
 * and the palms stand clear of each other rather than packing into one block —
 * and clear of the last line of loungers, whose tiles the ring also has to find
 * free.
 */
function fillBeachBack(parts: BeachParts): void {
  const { shore, random } = parts;
  const behind = beachBackDepth(shore);
  const back: BeachParts = {
    ...parts,
    // Held behind the lines by the same check that keeps a four-tile club off
    // the tideline: what a cluster may cover, asked of every tile it covers.
    standable: (tile) =>
      isBuildableSand(shore, tile.x, tile.z) && beachDepthAt(shore, tile.x, tile.z) >= behind,
  };
  for (const tile of beachTilesOf(shore)) {
    if (beachDepthAt(shore, tile.x, tile.z) < behind) continue;
    if (!isBuildableSand(shore, tile.x, tile.z)) continue;
    if (random() > BEACH_DENSITY * parts.density) continue;
    standOnSand(back, tile);
  }
}

/** Everything filling the sand needs; the same shape each stander is handed. */
interface BeachParts extends Stand {
  readonly shore: Shore;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly missing: Set<string>;
  readonly density: number;
}

/**
 * Stands whatever the back of the beach at one tile calls for, or leaves it
 * bare.
 *
 * The walk crosses each row from the grass to the water, so the buildings get
 * their pick of the deepest sand before the palms start filling it in. Most
 * tiles come out bare, because a beach club is four tiles square and skirted,
 * and a band of palms with a bare stretch between them is what the back of a
 * beach looks like.
 */
function standOnSand(parts: BeachParts, tile: Tile): void {
  const { types, missing, random } = parts;
  for (let draw = 0; draw < BEACH_DRAWS; draw++) {
    const wanted =
      BEACH_BACK.find((id) => missing.has(id)) ??
      BEACH_BACK[Math.floor(random() * BEACH_BACK.length)]!;
    const type = types.get(wanted);
    if (!type || !standOne(parts, type, tile)) continue;
    missing.delete(type.id);
    return;
  }
}

/** What standing one object anywhere on the loose ground needs. */
interface Stand {
  readonly site: Site;
  readonly random: () => number;
  readonly plots: ResortPlot[];
  /**
   * Ground every tile the object covers has to be, beyond simply being free.
   *
   * The beach passes its own buildable band, because a coastline that wanders
   * means the tile a four-tile club is anchored on and the tile its far corner
   * lands on are at different depths into the sand — and the tideline and the
   * lane at the back of the beach are reserved by *depth*, not by row. The hill
   * needs none: what its benches reserve is levels, and the level check below
   * already covers the whole footprint.
   */
  readonly standable?: (tile: Tile) => boolean;
}

/**
 * Stands one object on loose ground, skirt and all. False if it will not go.
 *
 * Shared by the beach and the hill because the rule is the same on both: a
 * cluster goes down only when the ring around it is free too, and that ring is
 * claimed with it. What the hill adds is the level check — its benches are a few
 * rows deep and a house laid across the step at the back of one would be a plan
 * `layoutResort` refuses. The beach is flat by invariant, so the check costs it
 * one comparison and tells it nothing it did not know.
 */
function standOne(parts: Stand, type: GeneratorType, tile: Tile): boolean {
  const { site, random, plots } = parts;
  // Mostly unturned, occasionally not, with the unturned footprint always there
  // as the fallback: the same bargain `turnFor` strikes, so a turn is never the
  // reason the sand comes out bare.
  const turned: Rotation =
    random() < QUARTER_TURN_CHANCE ? normalizeRotation(Math.floor(random() * 4)) : 0;
  for (const rotation of [turned, 0] as const) {
    const footprint = footprintOf(type, rotation);
    const straddled = straddledTile(site.levelOf, {
      tileX: tile.x,
      tileZ: tile.z,
      tilesX: footprint.x,
      tilesZ: footprint.z,
    });
    if (straddled) continue;
    const covered = footprintTilesAt(footprint, tile);
    if (parts.standable && !covered.every(parts.standable)) continue;
    const region = withSkirt(covered);
    if (!tilesFree(site, region)) continue;
    claimTiles(site, region);
    plots.push({ id: type.id, tileX: tile.x, tileZ: tile.z, rotation });
    return true;
  }
  return false;
}

/**
 * What stands on the shelf of sand on top of the dune.
 *
 * Bungalows, five times out of nine, because that is what the shelf is for: a
 * row of them along the sidewalk, looking down over the beach they used to stand
 * on. The rest is what a dune carries: palms and olives, torches, and a bar to
 * walk to. The olive is the one tree of the six that belongs this close to the
 * sand, which is why it is the only one up here with the palms.
 */
const SHELF_POOL: readonly string[] = [
  'bungalow',
  'bungalow',
  'bungalow',
  'bungalow',
  'bungalow',
  'palm',
  'olive',
  'tikitorch',
  'poolside-bar',
];

/**
 * What stands on the grass benches above the shelf and down the far side.
 *
 * Houses, on whichever benches are deep enough to take one — which is every
 * other one by construction, see {@link hillStepsFor} — with the narrow steps
 * between them taking the one-tile things that will fit anywhere. A hillside of
 * houses at four different heights is the whole point of the hill.
 *
 * Four trees to every five houses, though, which is the other half of it: the
 * hill is bigger than it was, and a bigger hill at the old weighting came out as
 * a housing estate on a slope. Planted rather than built, it reads as a wooded
 * headland with a few houses in it, and a one-tile tree goes in the gaps between
 * the houses that nothing else fits.
 *
 * Four species rather than four palms. A headland of nothing but palms reads as
 * one repeated object however many of them there are, and the hill is the one
 * place on the plot with room to show that a resort is planted with more than
 * the tree on its postcard. The two-tile trees, the pine and the oak, are left
 * out: the gaps between the houses are mostly one tile wide, so a pool full of
 * them would come out as a pool that mostly fails to place anything.
 */
const HILLSIDE_POOL: readonly string[] = [
  'house',
  'house',
  'house',
  'house',
  'house',
  'palm',
  'cypress',
  'olive',
  'blossom',
  'flowerbed',
];

/**
 * How much of the hill is attempted, per tile visited, at full density.
 *
 * Lower than it was, because the hill is half again as deep as it was: a
 * hillside attempted at nine tiles in ten came out as a housing estate with a
 * path to every house in it, and the paving that took was more of the hill than
 * the grass was. Six in ten leaves the benches reading as benches — a few houses
 * and a stand of palms on each, with the walk down the middle of it doing the
 * getting about.
 */
const HILL_DENSITY = 0.6;

/** Everything filling the hill needs. */
interface HillParts extends Stand {
  readonly elevation: Elevation;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly missing: Set<string>;
  readonly density: number;
}

/**
 * Fills the raised ground: the shelf on the dune, and the benches above it.
 *
 * The same shape as {@link fillBeach} and for the same reason — a hillside is no
 * more laid out in rows than a beach is — and it borrows the skirt rule whole, so
 * the free tiles between the houses stay one connected piece and `layoutResort`
 * can walk a spur up to every one of them.
 *
 * There are no runs here, though. A run is a row of loungers facing the water,
 * and it works on the beach because the beach is one flat sheet twenty rows
 * deep; a bench of the hill is three rows deep and its back is a step. So
 * everything on the hill goes down one at a time, against the level check in
 * {@link standOne}.
 */
function fillHill(parts: HillParts): void {
  const { elevation, random } = parts;
  for (const tile of raisedTilesOf(elevation)) {
    const terrace = terraceAt(elevation, tile.x, tile.z);
    if (!terrace) continue;
    if (random() > HILL_DENSITY * parts.density) continue;
    standOnHill(parts, tile, terrace.surface ?? 'grass');
  }
}

/** Stands whatever the bench at one tile calls for, or leaves it bare. */
function standOnHill(parts: HillParts, tile: Tile, surface: TerraceSurface): void {
  const { types, missing, random } = parts;
  const pool = surface === 'sand' ? SHELF_POOL : HILLSIDE_POOL;
  for (let draw = 0; draw < BEACH_DRAWS; draw++) {
    const wanted = pool.find((id) => missing.has(id)) ?? pool[Math.floor(random() * pool.length)]!;
    const type = types.get(wanted);
    if (!type) continue;
    if (!standOne(parts, type, tile)) continue;
    missing.delete(type.id);
    return;
  }
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
 * The last row a gate this wide can stand on with flat, level ground under all
 * of it.
 *
 * On a plot with no shore that is the plot's own south edge. On one with a beach
 * and a hill behind it, it is the row the hill's landward foot reaches in the
 * shallowest of the gate's own columns — so the southern gate stands at the
 * bottom of the hill facing back up the promenade, which is where the resort
 * proper actually ends. It cannot go on the sand any more: the sand now has a
 * dune rising straight off the back of it, and a gate three tiles wide would
 * stand across the first step of it.
 */
function southGateRow(parts: {
  readonly shore: Shore | null;
  readonly hill: Hill | null;
  readonly tilesZ: number;
  readonly fromX: number;
  readonly gateTilesX: number;
  readonly gateTilesZ: number;
}): number {
  const { shore, hill, tilesZ, fromX, gateTilesX, gateTilesZ } = parts;
  if (!shore) return tilesZ - gateTilesZ;
  let landStarts = tilesZ;
  for (let x = fromX; x < fromX + gateTilesX; x++) {
    landStarts = Math.min(landStarts, landStartZ(shore, hill, tilesZ, x));
  }
  return landStarts - gateTilesZ;
}

/**
 * How far apart the nodes of a walk that follows the coast stand.
 *
 * Short, because a walk is an L between each pair of nodes: the run between two
 * of them holds the z of the first, and the coast drifts under it as it goes.
 * Five tiles is about a row and a half of drift, which is what keeps a sidewalk
 * on the shelf it was strung down the middle of.
 */
const WALK_SPACING = 5;

/**
 * A path strung along the coast at a fixed distance inland from the water.
 *
 * The two walks a resort gets are both this: the one across the middle of the
 * beach, which is what separates the runs of loungers in front of it from the
 * clubs and palms behind, and the sidewalk down the middle of the shelf on top
 * of the dune, which is what the bungalows are laid out along.
 *
 * Strung as a chain of nodes rather than as one straight edge because that is
 * the whole point of it: a boardwalk across a beach should run parallel to the
 * water, and the water is not straight. Each leg holds its own z and steps to
 * the next, so the walk comes out as the same staircase of the wandering coast
 * that the sand under it is drawn as. Neither walk needs joining to the network
 * on purpose — the north-south lanes cross both of them.
 */
function coastWalk(parts: {
  readonly shore: Shore;
  readonly inset: number;
  readonly prefix: string;
  readonly tilesX: number;
  readonly tilesZ: number;
}): { readonly nodes: readonly PathNode[]; readonly edges: readonly PathEdge[] } {
  const { shore, inset, prefix, tilesX, tilesZ } = parts;
  const columns: number[] = [];
  for (let tileX = 1; tileX < tilesX - 2; tileX += WALK_SPACING) columns.push(tileX);
  columns.push(tilesX - 2);

  const nodes = columns.map((tileX, index) => ({
    id: `${prefix}${index}`,
    tileX,
    tileZ: Math.round(clamp(waterStartZ(shore, tileX) - inset, 1, tilesZ - 2)),
  }));
  return chain(nodes);
}

/**
 * A run of nodes strung end to end into one path.
 *
 * Every leg bends `x-first`, which is what makes a chain of nodes a *walk*
 * rather than a polyline: the run along x holds the z of the node it left, and
 * the jog along z is taken at the next node's own column. Both things strung
 * this way — the walks along the coast and the switchback up the hill — want
 * exactly that, because in both the long leg is the one that follows the ground
 * and the short one is the one that crosses it.
 */
function chain(nodes: readonly PathNode[]): {
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
} {
  return {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      from: nodes[index]!.id,
      to: node.id,
      width: 1,
      bend: 'x-first' as const,
    })),
  };
}

/** How far either side of its line a switchback swings, in tiles. */
const SWITCHBACK_REACH = 6;

/** Rows of hill one leg of a switchback climbs before it turns back. */
const SWITCHBACK_RISE = 4;

/**
 * Where the switchbacks stand, as parts of the plot's width.
 *
 * Two of them, one either side of the promenade — which runs between 0.42 and
 * 0.58 of the width, so neither can ever be read as its continuation. A hill
 * with one way up it is a hill with a queue on it; with two, the walks along the
 * benches become a route rather than a dead end, because you can come down the
 * other side of the crest from wherever you went up.
 */
const SWITCHBACK_COLUMNS: readonly number[] = [0.25, 0.75];

/**
 * A path that climbs the whole hill in switchbacks rather than straight up it.
 *
 * The lanes that cross the hill climb it head on, one flight per step, which is
 * a fire escape. This is the way you would actually walk up a dune: a leg along
 * the bench, a turn, a leg up the next one. It falls out of the routing for
 * free — each edge is an L, so the leg along x runs on the bench and the leg
 * along z is the bit that climbs — and every one of those climbs lands on a
 * different row, because the benches it crosses follow the coast.
 *
 * It starts on the sidewalk along the shelf of the dune and ends on the level
 * ground behind the hill, so it is joined to the rest of the network at the
 * bottom without asking. It starts *there* rather than out on the sand because a
 * leg is a dozen tiles of one row: on a bench a row deep, or on the beach, that
 * row drifts out from under it as the coast wanders, and what should have been
 * one turn of a path came out as a boardwalk lying across the sand. On the shelf
 * there are rows to spare either side of it. The beach below needs none of it
 * anyway — sand is walked on, and you step off the dune wherever you like.
 */
function switchback(parts: {
  readonly shore: Shore;
  readonly hill: Hill;
  readonly at: number;
  readonly from: number;
  readonly prefix: string;
  readonly tilesX: number;
  readonly tilesZ: number;
}): { readonly nodes: readonly PathNode[]; readonly edges: readonly PathEdge[] } {
  const { shore, hill, at, from, prefix, tilesX, tilesZ } = parts;
  const nodes: PathNode[] = [];
  const rowAt = (inset: number, tileX: number): number =>
    Math.round(clamp(waterStartZ(shore, tileX) - inset, 1, tilesZ - 2));

  for (let inset = from, leg = 0; ; inset += SWITCHBACK_RISE, leg++) {
    const reach = leg % 2 === 0 ? -SWITCHBACK_REACH : SWITCHBACK_REACH;
    const tileX = Math.round(clamp(at + reach, 1, tilesX - 2));
    nodes.push({
      id: `${prefix}${leg}`,
      tileX,
      tileZ: rowAt(Math.min(inset, hill.inset + 2), tileX),
    });
    if (inset >= hill.inset + 2) break;
  }
  return chain(nodes);
}

/** The gate at each end of the promenade, and the fountain in its plaza. */
function landmarks(parts: {
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly promenade: Street;
  readonly plaza: { x0: number; x1: number; z0: number; z1: number };
  readonly site: Site;
  readonly shore: Shore | null;
  readonly hill: Hill | null;
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
    stand(
      gate,
      tileX,
      southGateRow({
        shore: parts.shore,
        hill: parts.hill,
        tilesZ: site.tilesZ,
        fromX: tileX,
        gateTilesX: gate.tilesX,
        gateTilesZ: gate.tilesZ,
      }),
      2,
    );
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

/**
 * Which of the north-south streets carry on past the dune and across the sand to
 * the water, as parts of the plot's width.
 *
 * Two, and every other street stops at the hill's landward foot with the cross
 * streets and the districts. That is the whole of what is paved on the beach.
 *
 * Before this, every lane on the plot ran the full depth: eight of them climbed
 * the dune head on and carried on across the sand, which paved the beach in
 * stripes and made the dune a wall of staircases. Two is enough to reach the sea
 * with, and it leaves the hill to be climbed the way a hill is walked up — by
 * the switchbacks and the walks along its benches, which is what {@link walksFor}
 * lays. A lane that does come down is the whole route: off the crest, down the
 * flights of the dune and straight out to the tideline.
 */
const SEA_LANES: readonly number[] = [0.3, 0.7];

/**
 * How far a sea lane carries on past the tideline, in tiles of pier.
 *
 * Six is twenty-four metres of jetty, which is a pier somebody walks to the end
 * of rather than a step off the sand — and it is short enough to stay inside the
 * water the plot actually owns, whose inset is `SHORE_INSET` and whose edge
 * wanders by `SHORE_BEACH.wander` either way. A lane that ran to the plot's own
 * southern edge, which is what these two used to be strung to before the water
 * could be paved at all, would be a causeway to nowhere on a deep plot and a
 * one-tile stub on a shallow one; measured off the water it is the same pier on
 * every plot. See `PathEdge.overWater`.
 */
const PIER_TILES = 6;

/** Where a sea lane's pier ends in one column: `PIER_TILES` out from the shore. */
function pierEndZ(shore: Shore, tilesZ: number, tileX: number): number {
  return Math.min(tilesZ - 1, waterStartZ(shore, tileX) + PIER_TILES - 1);
}

/**
 * The streets that run all the way to the water, by the tile they stand on.
 *
 * The promenade is never one of them. It ends at the southern gate, at the foot
 * of the hill, which is where the resort proper ends — a promenade that carried
 * on over a dune and onto a beach would not be a promenade.
 */
function seaLanesOf(
  columns: readonly Street[],
  promenade: Street,
  tilesX: number,
): ReadonlySet<number> {
  const candidates = columns.filter((street) => street !== promenade);
  const lanes = new Set<number>();
  if (candidates.length === 0) return lanes;
  for (const part of SEA_LANES) {
    const wanted = tilesX * part;
    const nearest = candidates.reduce((best, street) =>
      Math.abs(street.at - wanted) < Math.abs(best.at - wanted) ? street : best,
    );
    lanes.add(nearest.at);
  }
  return lanes;
}

/**
 * Nodes and edges for one run of parallel streets, strung between two bounds.
 *
 * `overWater` is asked of each street rather than set for the run, because only
 * two of the columns are piers and the rest of them stop at the hill's foot with
 * the cross streets. A run that says nothing is an ordinary street, which stops
 * at the tideline — see `PathEdge.overWater`.
 */
function streetGraph(
  streets: readonly Street[],
  prefix: string,
  from: (street: Street) => PathNode,
  to: (street: Street) => PathNode,
  overWater: (street: Street) => boolean = () => false,
) {
  const nodes: PathNode[] = [];
  const edges = streets.map((street, index) => {
    const head = { ...from(street), id: `${prefix}${index}-a` };
    const tail = { ...to(street), id: `${prefix}${index}-b` };
    nodes.push(head, tail);
    return { from: head.id, to: tail.id, width: street.width, overWater: overWater(street) };
  });
  return { nodes, edges };
}

/**
 * Every path that follows the coast rather than the street grid: the whole path
 * network of the hill, and the only paving the sand ever sees that is not a
 * street coming down to the water.
 *
 * Two kinds, and between them they are what a hill is walked with:
 *
 * - a **bench walk** down the middle of every bench deep enough to hold one —
 *   the sidewalk along the shelf of the dune that the bungalows are laid out on,
 *   and one along each grass bench above it, up over the crest and down the far
 *   side. Each is a level walk with the houses of its own bench either side of
 *   it, and each is strung as a chain that follows the coast, so it curves with
 *   the bay rather than cutting across it;
 * - two **switchbacks**, which climb the whole hill in legs rather than head on,
 *   and which cross every bench walk on the way — so the walks are one network
 *   rather than a stack of parallel dead ends.
 *
 * The beach gets nothing of its own at all. Sand is walked on, so nothing
 * standing on it needs a path to reach it, and the two walks that used to cross
 * it are gone: what crosses the sand now is the handful of streets that carry on
 * past the dune to the water, and nothing else. See {@link seaLaneOf}.
 */
function walksFor(parts: {
  readonly shore: Shore;
  readonly hill: Hill | null;
  readonly tilesX: number;
  readonly tilesZ: number;
}): { readonly nodes: readonly PathNode[]; readonly edges: readonly PathEdge[] } {
  const { shore, hill, tilesX, tilesZ } = parts;
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const lay = (walk: { nodes: readonly PathNode[]; edges: readonly PathEdge[] }): void => {
    nodes.push(...walk.nodes);
    edges.push(...walk.edges);
  };
  if (!hill) return { nodes, edges };

  // Down the middle of each bench, so a walk has rows of its own either side and
  // stays on the bench it was strung along as the coast drifts under it.
  const walkable = benchesOf(hill)
    .filter((bench) => bench.depth >= WALKABLE_BENCH)
    .map((bench) => bench.inset + Math.floor(bench.depth / 2));
  for (const [index, inset] of walkable.entries()) {
    lay(coastWalk({ shore, inset, prefix: `benchwalk${index}-`, tilesX, tilesZ }));
  }

  // The switchbacks start on the lowest of those walks — the sidewalk along the
  // shelf of the dune — which is what joins them to everything below. A hill
  // with no bench wide enough to walk along is a hill the lanes climb head on,
  // and it gets none.
  const foot = walkable[0];
  if (foot === undefined) return { nodes, edges };
  for (const [index, part] of SWITCHBACK_COLUMNS.entries()) {
    lay(
      switchback({
        shore,
        hill,
        at: Math.round(tilesX * part),
        from: foot,
        prefix: `climb${index}-`,
        tilesX,
        tilesZ,
      }),
    );
  }
  return { nodes, edges };
}

/**
 * The flat ground behind each of the hill's steps: where it starts, and how many
 * rows of it there are.
 *
 * Walked off the terraces rather than remembered from the sizes they were built
 * with, because the hill knows its own shape and asking it is what keeps a walk
 * on its bench when that shape changes. The last terrace is the one that comes
 * back to sea level and has no bench of its own, which falls out as a depth of
 * zero rather than needing a case.
 */
function benchesOf(hill: Hill): { readonly inset: number; readonly depth: number }[] {
  return hill.terraces.map((terrace, index) => {
    const behind = hill.terraces[index + 1];
    return { inset: terrace.inset, depth: (behind ? behind.inset : hill.inset) - terrace.inset };
  });
}

/**
 * Grows a whole resort from four numbers.
 *
 * The catalogue is passed in rather than imported so this stays a pure function
 * of its arguments — the art is data to the generator, exactly as it is to the
 * rest of the layout.
 */
export function generateResort(types: readonly GeneratorType[], asked: ResortParams): ResortPlan {
  const params = clampParams(asked);
  const { tilesX, tilesZ, density, seed } = params;
  const random = createRandom(seed);

  const buildable = types.filter((type) => !DERIVED_IDS.has(type.id));
  const byId = new Map(buildable.map((type) => [type.id, type]));
  // Largest first, so a tennis court gets its pick of the districts while there
  // is still a district that will take it — and without the two the shore keeps
  // to itself, which the beach stands and a district never should. See
  // `SHORE_ONLY`.
  const bySize = buildable
    .filter((type) => !SHORE_ONLY.has(type.id))
    .toSorted((a, b) => b.tilesX * b.tilesZ - a.tilesX * a.tilesZ);

  const shoreSpec = shoreSpecFor(params);
  const shore = shoreFor({ tilesX, tilesZ, shore: shoreSpec });
  // The hill comes before the streets rather than after them, which is the other
  // way round from the bench it replaced: it is anchored to the water, so it owes
  // the street grid nothing, and the street grid has to be told where it ends.
  const hill = shore ? hillFor(params, shoreSpec) : null;
  // Absent rather than present-and-flat on a plot too shallow to terrace, which
  // is what `exactOptionalPropertyTypes` asks of an optional field.
  const terraces = elevationSpecFor(hill, seed);

  const columns = columnsFor(random, tilesX);
  let hillFoot = tilesZ - 2;
  for (let tileX = 0; tileX < tilesX; tileX++) {
    hillFoot = Math.min(hillFoot, landStartZ(shore, hill, tilesZ, tileX) - 1);
  }
  const bands = bandsFor(tilesZ, hillFoot);
  const promenade = columns.find((street) => street.width === PROMENADE_WIDTH) ?? columns[0]!;
  const plaza = plazaAt(promenade, bands[Math.floor(bands.length / 2)]!, tilesX, tilesZ);

  // Only the sea lanes cross the hill and the beach; every other street stops
  // where the level ground does, with the cross streets it bounds districts
  // with. See `seaLanesOf` and `walksFor`.
  const seaLanes = seaLanesOf(columns, promenade, tilesX);
  const down = streetGraph(
    columns,
    'col',
    (street) => ({ id: '', tileX: street.at, tileZ: 1 }),
    (street) => ({
      id: '',
      tileX: street.at,
      tileZ: seaLanes.has(street.at) && shore ? pierEndZ(shore, tilesZ, street.at) : hillFoot,
    }),
    (street) => seaLanes.has(street.at),
  );
  const across = streetGraph(
    bands,
    'band',
    (street) => ({ id: '', tileX: columns[0]!.at, tileZ: street.at }),
    (street) => ({ id: '', tileX: columns[columns.length - 1]!.at, tileZ: street.at }),
  );
  // The walks: one down the middle of every bench of the hill, and two
  // switchbacks climbing across them. All of them follow the coast rather than
  // the grid, which is what the grid cannot do — see `coastWalk`.
  const walks = shore ? walksFor({ shore, hill, tilesX, tilesZ }) : { nodes: [], edges: [] };

  const skeleton: ResortPlan = {
    tilesX,
    tilesZ,
    plots: [],
    nodes: [...down.nodes, ...across.nodes, ...walks.nodes],
    edges: [...down.edges, ...across.edges, ...walks.edges],
    plazas: [plaza],
    shore: shoreSpec,
    ...(terraces ? { elevation: terraces } : {}),
  };

  const terraced = elevationFor(skeleton);
  const site: Site = {
    taken: new Set(),
    tilesX,
    tilesZ,
    levelOf: (tileX2, tileZ2) => levelAt(terraced, tileX2, tileZ2),
  };
  const missing = new Set(buildable.map((type) => type.id));
  // The sea is spoken for before anything is stood, so nothing below has to
  // check for it: a district, a landmark and a lane all just find the tiles
  // taken.
  for (const tile of waterTilesOf(shore)) site.taken.add(tileKey(tile.x, tile.z));
  const streets = streetTiles(skeleton);

  // Landmarks are stood before the streets are marked, because both of them are
  // meant to sit on the paving: the gates straddle the promenade's ends and the
  // fountain stands in the middle of its plaza.
  const plots = landmarks({ types: byId, promenade, plaza, site, shore, hill, missing });

  for (const tile of streets) site.taken.add(tileKey(tile.x, tile.z));

  // The beach and the hill are filled *before* the districts, on their own
  // terms, and whatever they leave bare is then reserved against the districts
  // wholesale. Two things follow from that order, and both are the point of it:
  // a bungalow ends up on the shelf and a lounger on the sand rather than in
  // whichever district the walk reached first, and no district ever spills onto
  // ground that a row grid is the wrong shape for.
  if (shore) {
    fillBeach({ shore, types: byId, site, missing, density, random, plots });
  }
  if (terraced) {
    fillHill({ elevation: terraced, types: byId, site, missing, density, random, plots });
  }
  for (const tile of [...beachTilesOf(shore), ...raisedTilesOf(terraced)]) {
    site.taken.add(tileKey(tile.x, tile.z));
  }

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
  const shore = shoreSpecFor(params);
  const terraces = elevationSpecFor(hillFor(params, shore), params.seed);
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
    shore,
    ...(terraces ? { elevation: terraces } : {}),
    standsWholeCatalogue: false,
  };
}
