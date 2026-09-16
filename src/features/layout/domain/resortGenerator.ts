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
 * 1. **Streets first.** A promenade, cross streets at intervals — one along the
 *    north edge and one along the foot of the hill among them — and service
 *    lanes down the flanks and between the columns. Gates stand only on the
 *    plot's edges, where a street comes in from outside. The
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
 * 6. **The beach is a grid and a band.** Loungers and parasols lie in three
 *    lines at fixed depths into the sand, following the water the way the dune
 *    behind them does, in sets that stand one behind the other, with the clubs
 *    and the palms in the band behind. What a model holds to the beach
 *    (`placement.ground`) stands nowhere else, and what it holds to a number
 *    (`placement.perResort`) — the courts, the pedalo rental — is stood on its
 *    own. Nothing
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
 * 8. **Parks and blocks.** Some districts are laid out by design rather than by
 *    the row fill: parks in one of several mirrored designs, with ponds,
 *    bridges, trees, tables and sometimes a fountain, and blocks of one kind of
 *    house in back-to-back rows facing the streets, with villas mixed in and a
 *    shop at the ends of their lanes. Both only take the room the rest of the
 *    catalogue can spare. See {@link planDistricts}, `districtLayouts.ts` and
 *    `parkShapes.ts`.
 *
 * 9. **Settings.** `ResortParams.config` carries the advanced settings — park
 *    and villa shares, housing style, beach preset, street trees, gate squares —
 *    each with a default that grows the resort the generator grew before it.
 *    See `resortConfig.ts`.
 *
 * Everything here is a pure function of the parameters, and the seed makes it
 * reproducible: the same parameters give the same resort, which is what lets
 * a plot be shared, benchmarked and regression-tested.
 */

import type { ModelCategory, ModelPlacement } from '../../../../voxel-gen/voxelgen.ts';
import { createRandom } from './random';
import {
  DERIVED_IDS,
  type PathEdge,
  type PathNode,
  type Plaza,
  type ResortPlan,
  type ResortPlot,
} from './resortPlan';
import {
  housingBlock,
  lotAnchor,
  parkDesignsFor,
  parkLayout,
  type BlockLot,
  type HousingBlock,
  type ParkLayout,
} from './districtLayouts';
import { WOBBLE_LIMIT, type TileRect } from './parkShapes';
import { gateSquare, type GateSquare } from './gateSquares';
import { neighbourPairs, spreadPairs, uncutRuns, type LaneCut } from './districtMerge';
import { SHORE_REACH } from './placementGround';
import type { TerrainEdit } from './terrain';
import { routeEdgeTiles, streetTiles, tileKey, widthOffsets, type Tile } from './resortLayout';
import { riverEditsFor } from './river';
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
import { beachDensityOf, clampConfig, type ResortConfig } from './resortConfig';

/** The gate object, stood at both ends of the promenade. */
const GATE_ID = 'entrance';

/** The object dropped in the middle of the promenade's plaza. */
const PLAZA_ID = 'fountain';

/**
 * Plot sizes the generator will work at, in tiles.
 *
 * The largest is three times the width the resort was first built to, nine
 * times its area: a stress test more than a resort anybody would lay out by
 * hand, and what the level of detail is there to keep drawable.
 */
export const PLOT_TILES = { min: 48, max: 480 } as const;

/** How built-up a plot can be asked to be. */
export const PLOT_DENSITY = { min: 0.2, max: 1 } as const;

export interface ResortParams {
  readonly tilesX: number;
  readonly tilesZ: number;
  /** How much of each district gets built on, 0..1. */
  readonly density: number;
  /** Any integer; the same one gives the same resort. */
  readonly seed: number;
  /** The advanced settings; whatever is left out takes its default. See `resortConfig.ts`. */
  readonly config?: Partial<ResortConfig>;
}

/** What the generator needs to know about one catalogue entry. */
export interface GeneratorType {
  readonly id: string;
  readonly category: ModelCategory;
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Where the model says it belongs, and how many a resort wants. */
  readonly placement?: ModelPlacement;
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
    config: clampConfig(params.config),
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
  // A street along the north edge and one along the foot of the hill, so every
  // district is bounded by streets on all four sides: the flank lanes are the
  // other two. The north one leaves the plot's first row for the gate.
  const north = { at: NORTH_STREET_AT, width: CROSS_STREET_WIDTH };
  const foot = { at: limit, width: CROSS_STREET_WIDTH };
  const positions = spread(north.at, limit, clamp(Math.round(limit / 20), 1, 6));
  return thin(
    [north, foot],
    positions.map((at) => ({ at, width: CROSS_STREET_WIDTH })),
    MIN_DISTRICT_DEPTH,
  );
}

/** Where the street along the plot's north edge runs: rows 1 and 2, behind the gate. */
const NORTH_STREET_AT = 2;

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
  readonly allowed: (type: GeneratorType) => boolean;
}): GeneratorType | null {
  const room = (type: GeneratorType): boolean =>
    type.tilesX <= parts.space.x && type.tilesZ <= parts.space.z;
  const candidates = parts.types.filter((type) => room(type) && parts.allowed(type));
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
  /** How many of each type stand so far, for the types a resort holds to a number. */
  readonly stood: Map<string, number>;
  /** How many of a type this resort may stand at most. */
  readonly allowance: (type: GeneratorType) => number;
  /** Whether lodging is drawn in among the rest, rather than laid out in blocks. */
  readonly lodgingDrawn: boolean;
}

/**
 * Whether a district row may draw this type at all.
 *
 * Two things hold a type back. A type the model caps per resort — a minigolf
 * course — stops being drawn once the resort has its share. And lodging is laid
 * out in blocks of its own (see {@link standHousing}), so a mixed district only
 * draws a house when the resort would otherwise have none of that kind: a lone
 * villa between a snack bar and a spa is what the blocks are there to stop.
 */
function drawable(parts: FillParts, type: GeneratorType): boolean {
  if (parts.missing.has(type.id)) return true;
  if (NEVER_DRAWN.has(type.id)) return false;
  if (type.category === 'lodging' && (!parts.lodgingDrawn || type.placement?.perResort)) {
    return false;
  }
  return (parts.stood.get(type.id) ?? 0) < parts.allowance(type);
}

/**
 * What a district row never draws once the catalogue has one: the fountain,
 * which stands in the plazas and at the heart of a park, and the lounger, which
 * lies on the beach and beside a pool — see {@link lineThePool}. A scatter of
 * either between a spa and a snack bar reads as furniture left out, not placed.
 */
const NEVER_DRAWN: ReadonlySet<string> = new Set(['fountain', 'sun-lounger']);

/** What a pool in a district is lined with. */
const POOL_ID = 'swimming-pool';

/**
 * Lines a pool's eastern side with loungers facing it, one every other tile, in
 * the column just past it — and reports how many columns that took: one, or none
 * where the column is not free for the whole length of the pool.
 *
 * The column is inside the pool's own row, so the free rows either side of the
 * row, which are what every object in it is reached by, stay free.
 */
function lineThePool(parts: FillParts, pool: { x: number; z: number; footprint: Extent }): number {
  const lounger = parts.types.find((type) => type.id === LOUNGER_ID);
  const column = pool.x + pool.footprint.x;
  if (!lounger || column > parts.district.x1) return 0;
  const tiles = Array.from({ length: Math.ceil(pool.footprint.z / 2) }, (_, index) => ({
    x: column,
    z: pool.z + 2 * index,
  }));
  const one = { x: 1, z: 1 };
  if (!tiles.every((tile) => fits(parts.site, one, tile.x, tile.z))) return 0;
  for (const tile of tiles) {
    claim(parts.site, one, tile.x, tile.z);
    // A quarter turn back: the backrest to the east, the lounger facing the pool.
    parts.plots.push({ id: lounger.id, tileX: tile.x, tileZ: tile.z, rotation: 3 });
  }
  return 1;
}

/** Lays one row across a district, and reports how deep it turned out. */
function fillRow(parts: FillParts, z: number, rowTurn: Rotation): number {
  const { district, site, random, missing } = parts;
  let depth = 1;

  for (let x = district.x0; x <= district.x1;) {
    const space = { x: district.x1 - x + 1, z: district.z1 - z + 1 };
    const type = pickType({
      ...parts,
      theme: district.theme,
      space,
      allowed: (candidate) => drawable(parts, candidate),
    });
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

    const footprint = standInRow(parts, type, { x, z }, rowTurn);
    // Measured off the footprint rather than the type, so a quarter-turned villa
    // pushes the row's own depth out and the free row below it moves with it.
    depth = Math.max(depth, footprint.z);
    const lined = type.id === POOL_ID ? lineThePool(parts, { x, z, footprint }) : 0;
    x += footprint.x + lined + (lined > 0 || random() < 0.4 ? 1 : 0);
  }
  return depth;
}

/** Stands one drawn type at a place in a row, and reports the tiles it took. */
function standInRow(parts: FillParts, type: GeneratorType, at: Tile, rowTurn: Rotation): Extent {
  const { site, random } = parts;
  // A house faces the street its row is on, like the houses in the blocks do.
  const rotation =
    type.category === 'lodging'
      ? rowTurn
      : turnFor({ rowTurn, type, site, tileX: at.x, tileZ: at.z, random });
  const footprint = footprintOf(type, rotation);
  claim(site, footprint, at.x, at.z);
  parts.plots.push({ id: type.id, tileX: at.x, tileZ: at.z, rotation });
  parts.missing.delete(type.id);
  parts.stood.set(type.id, (parts.stood.get(type.id) ?? 0) + 1);
  return footprint;
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

/**
 * What stands on the sand behind the lines.
 *
 * Weighted by repetition rather than by a table of numbers: the back of a beach
 * is mostly palms and torches with a club, a bar, a kiosk, a rinse or a row of
 * huts here and there, and the shortest way to say that is to write the palms
 * down more often. The list is also the whole of the rule that a beach club does
 * not end up on the tideline.
 *
 * The snack bar and the ice-cream cart are here so that a day on the sand can be
 * spent there: a guest on a pitch walks over the beach to whatever serves what
 * they want and back again, and without food on the sand the only errands to run
 * were for a drink. See `sim/domain/router.ts`.
 *
 * The volleyball court and the pedalo rental are not here: a resort holds both
 * to a number (`placement.perResort`), which a weighted draw cannot be asked for,
 * so they are stood on their own — see {@link standBeachFeatures}.
 */
const BEACH_BACK: readonly string[] = [
  'beach-club',
  'poolside-bar',
  'poolside-bar',
  'snack-bar',
  'snack-bar',
  'icecream',
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
 * tideline. They are *depths*, so each line follows the coast: a fixed distance
 * in from a wandering shore wanders with it, exactly as the dune behind does.
 */
const BEACH_LINES = { count: 3, first: 1, spacing: 2 } as const;

/**
 * One set of beach furniture, west to east: a lounger either side of a parasol,
 * and a column of open sand before the next set.
 *
 * Every line lays the same sets in the same columns, so the three lines stand
 * one behind the other and the beach reads as a grid rather than a scatter.
 */
const BEACH_SET: readonly ('lounger' | 'umbrella' | null)[] = [
  'lounger',
  'umbrella',
  'lounger',
  null,
];

/**
 * Sets to a bay. After each bay one set's worth of sand is left open, which is
 * where the lifeguard towers stand and where people walk down to the water.
 */
const BEACH_BAY = 5;

/** Columns from the start of one bay to the start of the next. */
const BAY_COLUMNS = BEACH_SET.length * (BEACH_BAY + 1);

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

/** The column the first bay starts in, which centres the bays on the plot. */
const bayOrigin = (tilesX: number): number =>
  Math.floor((tilesX % BAY_COLUMNS) / 2) + Math.floor(BEACH_SET.length / 2);

/**
 * How many of a bay's sets a density keeps: an odd number, so the kept sets sit
 * in the middle of the bay and a thinner beach is still symmetric.
 */
function keptSets(density: number): number {
  const kept = 2 * Math.round((BEACH_BAY * density - 1) / 2) + 1;
  return clamp(kept, 1, BEACH_BAY);
}

/**
 * Draws from a pool before giving a tile up.
 *
 * A beach club is six tiles across with its skirt and will not fit in most of
 * the gaps a beach leaves; taking the first draw as final would mean every one
 * of those gaps stayed empty because a beach club happened to be named for it.
 */
const BEACH_DRAWS = 3;

/**
 * Fills the sand: the features a resort holds to a number, the towers, the
 * lines, and then whatever the back of the beach takes.
 *
 * The order is the point. The features get their pick of the sand first, the
 * towers stand in the gaps between the bays, and the lines are laid round both —
 * so a set of loungers is never cut in half by a court.
 *
 * Nothing on the sand is paved to: sand is walked on, and `layoutResort` grows no
 * spur to anything standing on it.
 */
function fillBeach(parts: BeachParts): void {
  standBeachFeatures(parts);
  standLifeguards(parts);
  layBeachLines(parts);
  fillBeachBack(parts);
}

/**
 * Stands the beach types a resort holds to a number: the volleyball courts and
 * the pedalo rental, as their models declare.
 *
 * A `shore` type — the hire hut — goes right at the water beside a pier, which
 * is where its boats go out from; a `beach` type — a court — is spread evenly
 * along the bay, behind the lines where the sand is deep enough and in among
 * them where it is not. Every one is unturned: the hut's counter and its rack of
 * boats face +z, which on every generated plot is the water, and a court laid
 * along the shore is the way round the sand has room for.
 */
function standBeachFeatures(parts: BeachParts): void {
  const { site, shore } = parts;
  for (const { type, count } of parts.features) {
    const shoreline = type.placement?.ground === 'shore';
    const evenly = Array.from({ length: count }, (_, index) =>
      Math.round((site.tilesX * (index + 1)) / (count + 1) - type.tilesX / 2),
    );
    const anchors = shoreline
      ? [...parts.seaLanes.map((lane) => lane + 2), ...evenly].slice(0, count)
      : evenly;
    const depths = shoreline
      ? [{ min: BEACH_LINES.first, max: SHORE_REACH - 1 }]
      : [
          { min: beachBackDepth(shore), max: shore.spec.beach - 2 },
          { min: BEACH_LINES.first + 1, max: shore.spec.beach - 2 },
        ];
    for (const anchor of anchors) {
      if (depths.some((band) => standFeatureNear(parts, type, anchor, band))) {
        parts.missing.delete(type.id);
      }
    }
  }
}

/**
 * Stands one feature as near a column as it will go, with every tile it covers
 * between two depths into the sand. False if nowhere along the bay will do.
 *
 * The row is taken as close to the water as the band allows, measured in the
 * column where the sea comes furthest in, so a wandering coast never pushes a
 * tile of it onto the tideline.
 */
function standFeatureNear(
  parts: BeachParts,
  type: GeneratorType,
  anchor: number,
  band: { readonly min: number; readonly max: number },
): boolean {
  const { shore } = parts;
  const footprint = footprintOf(type, 0);
  const standable = (tile: Tile): boolean => {
    const depth = beachDepthAt(shore, tile.x, tile.z);
    return isBuildableSand(shore, tile.x, tile.z) && depth >= band.min && depth <= band.max;
  };
  for (const tileX of columnsOutward(anchor, parts.site.tilesX - footprint.x)) {
    let water = Number.POSITIVE_INFINITY;
    for (let x = tileX; x < tileX + footprint.x; x++)
      water = Math.min(water, waterStartZ(shore, x));
    const tile = { x: tileX, z: water - footprint.z - band.min };
    const covered = footprintTilesAt(footprint, tile);
    if (covered.every(standable) && standSkirted(parts, type, covered, tile, 0)) return true;
  }
  return false;
}

/** Every column from `0` to `last`, nearest `anchor` first. */
function columnsOutward(anchor: number, last: number): number[] {
  const columns: number[] = [];
  const start = clamp(anchor, 0, last);
  for (let offset = 0; offset <= last; offset++) {
    if (start + offset <= last) columns.push(start + offset);
    if (offset > 0 && start - offset >= 0) columns.push(start - offset);
  }
  return columns;
}

/**
 * Claims a cluster of tiles and the ring around them, and stands the object on
 * them. False, and nothing claimed, when the ring is not free.
 */
function standSkirted(
  parts: Stand,
  type: GeneratorType,
  covered: readonly Tile[],
  tile: Tile,
  rotation: Rotation,
): boolean {
  const region = withSkirt(covered);
  if (!tilesFree(parts.site, region)) return false;
  claimTiles(parts.site, region);
  parts.plots.push({ id: type.id, tileX: tile.x, tileZ: tile.z, rotation });
  return true;
}

/**
 * Stands a lifeguard tower in the open sand between every two bays, on the
 * seaward-most row anything is allowed to stand on.
 *
 * A bay is 24 columns, a hundred metres of beach, which is about what a real bay
 * is patrolled at and what keeps a tower reading as a landmark. Standing it in
 * the gap between the bays puts it on the tideline without taking a set of
 * loungers from the line in front of it.
 *
 * Unturned, always: the model's open side and its ladder face +z, which on every
 * generated plot is the water.
 */
function standLifeguards(parts: BeachParts): void {
  const { shore, types, missing, site, plots } = parts;
  const tower = types.get(LIFEGUARD_ID);
  if (!tower) return;
  const gap = BEACH_BAY * BEACH_SET.length + Math.floor(BEACH_SET.length / 2);
  for (let bay = bayOrigin(site.tilesX) - BAY_COLUMNS; bay < site.tilesX; bay += BAY_COLUMNS) {
    // Walked forward through the gap rather than dropped on its middle: where a
    // sea lane comes down to the water that tile is already spoken for.
    for (let step = 0; step < BEACH_SET.length; step++) {
      const tileX = bay + gap + step;
      if (tileX < 0 || tileX >= site.tilesX) continue;
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
 * Lays the three lines of loungers and parasols as a grid of sets.
 *
 * Every line lays its sets in the same columns, so a parasol stands behind a
 * parasol and a lounger behind a lounger all the way along the bay. A set goes
 * down whole or not at all: where a pier, a tower or a court is in the way the
 * set is left out rather than cut in half, which is what keeps the grid reading
 * as one. The density slider keeps the middle sets of each bay and drops the
 * outer ones, so a quiet beach is the same grid with wider walkways.
 */
function layBeachLines(parts: BeachParts): void {
  const lounger = parts.types.get(LOUNGER_ID);
  const umbrella = parts.types.get(UMBRELLA_ID);
  if (!lounger || !umbrella) return;
  const { shore, site, plots, missing } = parts;
  const kept = keptSets(parts.density);
  const first = Math.floor((BEACH_BAY - kept) / 2);
  const origin = bayOrigin(site.tilesX);

  for (const depth of beachLineDepths(shore)) {
    for (let start = origin; start < site.tilesX; start += BEACH_SET.length) {
      const slot = Math.round((start - origin) / BEACH_SET.length) % (BEACH_BAY + 1);
      if (slot < first || slot >= first + kept) continue;
      const set = BEACH_SET.flatMap((item, offset) => {
        if (item === null) return [];
        const tileX = start + offset;
        return [
          {
            type: item === 'umbrella' ? umbrella : lounger,
            tileX,
            tileZ: waterStartZ(shore, tileX) - 1 - depth,
          },
        ];
      });
      const clear = set.every(
        ({ tileX, tileZ }) =>
          tileX < site.tilesX &&
          isBuildableSand(shore, tileX, tileZ) &&
          !site.taken.has(tileKey(tileX, tileZ)),
      );
      if (!clear) continue;
      for (const { type, tileX, tileZ } of set) {
        // Unturned: a lounger's backrest is at its northern end, so it faces the
        // water, and a row of parasols all stood the same way is part of the grid.
        site.taken.add(tileKey(tileX, tileZ));
        plots.push({ id: type.id, tileX, tileZ, rotation: 0 });
        missing.delete(type.id);
      }
    }
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
    if (random() > parts.density) continue;
    standFromPool(back, BEACH_BACK, tile);
  }
}

/** Everything filling the sand needs; the same shape each stander is handed. */
interface BeachParts extends Stand {
  readonly shore: Shore;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly missing: Set<string>;
  readonly density: number;
  /** The beach types a resort holds to a number, and how many this one gets. */
  readonly features: readonly { readonly type: GeneratorType; readonly count: number }[];
  /** The columns the streets that run out to sea come down, west to east. */
  readonly seaLanes: readonly number[];
}

/**
 * Stands one of a pool at a tile, or leaves it bare.
 *
 * Whatever the pool still owes the catalogue is tried first, each in turn, and
 * then a few seeded draws. Trying only the first type still owed used to spend
 * every draw on a beach club that would never fit a narrow beach, which left the
 * back of the smallest beach bare.
 */
function standFromPool(
  parts: Stand & {
    readonly types: ReadonlyMap<string, GeneratorType>;
    readonly missing: Set<string>;
  },
  pool: readonly string[],
  tile: Tile,
): void {
  const { types, missing, random } = parts;
  const owed = [...new Set(pool.filter((id) => missing.has(id)))];
  const drawn = Array.from(
    { length: BEACH_DRAWS },
    () => pool[Math.floor(random() * pool.length)]!,
  );
  for (const id of [...owed, ...drawn]) {
    const type = types.get(id);
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
  const { site, random } = parts;
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
    if (standSkirted(parts, type, covered, tile, rotation)) return true;
  }
  return false;
}

/**
 * What stands on the shelf of sand on top of the dune, between the bungalows.
 *
 * The bungalows themselves are lined up along the sidewalk — see
 * {@link lineBenchWalks}. What is left is what a dune carries: palms and olives,
 * torches, and a bar to walk to. The olive is the one tree of the six that
 * belongs this close to the sand, which is why it is the only one up here with
 * the palms.
 */
const SHELF_POOL: readonly string[] = ['palm', 'palm', 'olive', 'tikitorch', 'poolside-bar'];

/**
 * What stands on the grass benches above the shelf and down the far side,
 * around the houses lined along the walks — see {@link lineBenchWalks}.
 *
 * Four species rather than four palms. A headland of nothing but palms reads as
 * one repeated object however many of them there are, and the hill is the one
 * place on the plot with room to show that a resort is planted with more than
 * the tree on its postcard. The two-tile trees, the pine and the oak, are left
 * out: the gaps between the houses are mostly one tile wide, so a pool full of
 * them would come out as a pool that mostly fails to place anything.
 */
const HILLSIDE_POOL: readonly string[] = ['palm', 'cypress', 'olive', 'blossom', 'flowerbed'];

/** What lines a walk along the hill, by the ground the walk runs on. */
const BENCH_LODGING = { sand: 'bungalow', grass: 'house' } as const;

/** Columns of grass between one house along a walk and the next. */
const BENCH_LOT_GAP = 2;

/**
 * Lines every walk along the hill with houses, both sides, at an even pitch.
 *
 * A house stands with its front to the walk — north of it facing south, south of
 * it facing north — so each bench reads as a street of houses rather than a
 * scatter, and every one of them is on its walk without a path of its own. The
 * pitch is centred on the plot and the same for every bench, so the houses on
 * one bench stand above the houses on the next. A lot the bench is too shallow
 * for, or that falls across a step, is left to the trees. Below full density
 * the lots are thinned by a regular stride rather than at random.
 */
function lineBenchWalks(parts: WalkParts): void {
  const stride = Math.max(1, Math.round(1 / parts.density));
  for (const walk of parts.walks) {
    const surface = benchSurfaceOf(parts, walk);
    const type = surface ? parts.types.get(BENCH_LODGING[surface]) : undefined;
    if (!type) continue;
    const rows = rowsOfWalk(walk);
    const pitch = type.tilesX + BENCH_LOT_GAP;
    const origin = Math.floor((parts.site.tilesX % pitch) / 2);
    const accentEvery = accentStride(parts, type);
    for (let tileX = origin, lot = 0; tileX + type.tilesX <= parts.site.tilesX; lot++) {
      const accented = accentEvery > 0 && lot % accentEvery === Math.floor(accentEvery / 2);
      const candidates = (): GeneratorType[] => {
        const accent = accented ? allowedAccent(parts) : undefined;
        return accent ? [accent, type] : [type];
      };
      standFacingWalk(parts, candidates, { tileX, rows, facesSea: surface === 'sand' });
      tileX += pitch * stride;
    }
  }
}

/** Everything lining the walks needs: the hill, the walks, and the villas mixed in. */
interface WalkParts extends HillParts {
  readonly walks: readonly (readonly Tile[])[];
  readonly accent: GeneratorType | undefined;
  readonly accentShare: number;
  readonly allowance: (type: GeneratorType) => number;
}

/**
 * How many lots along a walk make room for one accent; zero where the walk is
 * lined with nothing smaller than it, or the resort wants no villas.
 */
function accentStride(parts: WalkParts, type: GeneratorType): number {
  if (!parts.accent || !hostsAccent(type, parts.accent) || parts.accentShare <= 0) return 0;
  return Math.max(2, Math.round(1 / parts.accentShare));
}

/**
 * Whether a lodging type is one an accent is mixed in among: a smaller house. A
 * villa among cottages or bungalows is a grander house on the street; a villa in
 * a street of hotels is not.
 */
const hostsAccent = (type: GeneratorType, accent: GeneratorType): boolean =>
  type.tilesX * type.tilesZ < accent.tilesX * accent.tilesZ;

/** The ground a walk runs on: the sand shelf, or a grass bench. */
function benchSurfaceOf(parts: HillParts, walk: readonly Tile[]): TerraceSurface | undefined {
  const middle = walk[Math.floor(walk.length / 2)];
  if (!middle) return undefined;
  return terraceAt(parts.elevation, middle.x, middle.z)?.surface ?? 'grass';
}

/** The rows a walk covers in each column it crosses: one, or two where it jogs. */
function rowsOfWalk(walk: readonly Tile[]): Map<number, { min: number; max: number }> {
  const rows = new Map<number, { min: number; max: number }>();
  for (const tile of walk) {
    const known = rows.get(tile.x);
    rows.set(tile.x, {
      min: Math.min(known?.min ?? tile.z, tile.z),
      max: Math.max(known?.max ?? tile.z, tile.z),
    });
  }
  return rows;
}

/** The rows a walk covers across a run of columns, or null where it misses one. */
function walkSpanOver(
  rows: ReadonlyMap<number, { min: number; max: number }>,
  tileX: number,
  width: number,
): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let x = tileX; x < tileX + width; x++) {
    const row = rows.get(x);
    if (!row) return null;
    min = Math.min(min, row.min);
    max = Math.max(max, row.max);
  }
  return { min, max };
}

/**
 * Stands a house either side of a walk, wherever the lot is free and level:
 * fronts to the walk on a grass bench, and fronts to the sea on the shelf.
 *
 * A bungalow is a beach house, and its veranda is the reason for it: the model
 * faces +z, which on every generated plot is the water, so the row south of
 * the sidewalk stands with its back to the walk rather than to the view.
 */
function standFacingWalk(
  parts: HillParts,
  candidates: () => readonly GeneratorType[],
  lot: {
    readonly tileX: number;
    readonly rows: ReadonlyMap<number, { min: number; max: number }>;
    readonly facesSea: boolean;
  },
): void {
  for (const north of [true, false]) {
    for (const type of candidates()) {
      if (standBesideWalk(parts, type, lot, north)) break;
    }
  }
}

/** Stands one type on one side of a walk, fronted to it. False where it will not go. */
function standBesideWalk(
  parts: HillParts,
  type: GeneratorType,
  lot: {
    readonly tileX: number;
    readonly rows: ReadonlyMap<number, { min: number; max: number }>;
    readonly facesSea: boolean;
  },
  north: boolean,
): boolean {
  const { site, plots, missing } = parts;
  const { tileX } = lot;
  const span = walkSpanOver(lot.rows, tileX, type.tilesX);
  if (!span) return false;
  const tileZ = north ? span.min - type.tilesZ : span.max + 1;
  const rotation: Rotation = north || lot.facesSea ? 0 : 2;
  const footprint = footprintOf(type, rotation);
  if (!fits(site, footprint, tileX, tileZ)) return false;
  claim(site, footprint, tileX, tileZ);
  plots.push({ id: type.id, tileX, tileZ, rotation });
  missing.delete(type.id);
  return true;
}

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
  standFromPool(parts, surface === 'sand' ? SHELF_POOL : HILLSIDE_POOL, tile);
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

/**
 * The gates, and the fountain in the plaza.
 *
 * Every gate stands on the plot's own edge, where a street comes in from
 * outside: one where the promenade meets the north edge, and one at either end of
 * the cross street the plaza is on, turned to face into the resort. A gate is
 * the way in, so none stands anywhere a guest is already inside.
 */
function landmarks(parts: {
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly promenade: Street;
  readonly gateBand: Street;
  readonly plaza: Plaza;
  readonly site: Site;
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
    if (!type || !fits(site, footprintOf(type, rotation), tileX, tileZ)) return;
    claim(site, footprintOf(type, rotation), tileX, tileZ);
    plots.push({ id: type.id, tileX, tileZ, rotation });
    missing.delete(type.id);
  };

  const gate = types.get(GATE_ID);
  if (gate) {
    // Straddling the street it closes, so its carriageway is the street's own
    // two tiles: the model faces +z, so unturned it looks into the plot from the
    // north edge, a quarter turn looks in from the west and three from the east.
    const across = Math.floor(gate.tilesX / 2);
    stand(gate, parts.promenade.at - across, 0);
    stand(gate, 0, parts.gateBand.at - across, 1);
    stand(gate, site.tilesX - gate.tilesZ, parts.gateBand.at - across, 3);
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
}): Walks {
  const { shore, hill, tilesX, tilesZ } = parts;
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const benches: Tile[][] = [];
  const lay = (walk: { nodes: readonly PathNode[]; edges: readonly PathEdge[] }): void => {
    nodes.push(...walk.nodes);
    edges.push(...walk.edges);
  };
  if (!hill) return { nodes, edges, benches };

  // Down the middle of each bench, so a walk has rows of its own either side and
  // stays on the bench it was strung along as the coast drifts under it.
  const walkable = benchesOf(hill)
    .filter((bench) => bench.depth >= WALKABLE_BENCH)
    .map((bench) => bench.inset + Math.floor(bench.depth / 2));
  for (const [index, inset] of walkable.entries()) {
    const walk = coastWalk({ shore, inset, prefix: `benchwalk${index}-`, tilesX, tilesZ });
    lay(walk);
    benches.push(
      walk.edges.flatMap((edge, leg) =>
        routeEdgeTiles(walk.nodes[leg]!, walk.nodes[leg + 1]!, 1, edge.bend ?? 'x-first'),
      ),
    );
  }

  // The switchbacks start on the lowest of those walks — the sidewalk along the
  // shelf of the dune — which is what joins them to everything below. A hill
  // with no bench wide enough to walk along is a hill the lanes climb head on,
  // and it gets none.
  const foot = walkable[0];
  if (foot === undefined) return { nodes, edges, benches };
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
  return { nodes, edges, benches };
}

/** The paths of the hill, and the tiles of each walk along one of its benches. */
interface Walks {
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
  readonly benches: readonly (readonly Tile[])[];
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
 * The plot size at which a type the model holds to a number reaches its most.
 *
 * Measured as the side of a square plot of the same area. The smallest plot the
 * generator builds gets `perResort.min`, a plot this size or larger gets `max`,
 * and everything between is a straight line.
 */
const ALLOWANCE_FULL_SIZE = 200;

/** How many of a type this resort may stand; unbounded unless its model says. */
function allowanceOf(type: GeneratorType, params: ResortParams): number {
  const range = type.placement?.perResort;
  if (!range) return Number.POSITIVE_INFINITY;
  const size = Math.sqrt(params.tilesX * params.tilesZ);
  const grown = clamp((size - PLOT_TILES.min) / (ALLOWANCE_FULL_SIZE - PLOT_TILES.min), 0, 1);
  return Math.round(range.min + (range.max - range.min) * grown);
}

/** What a district is laid out as. */
type DistrictPlan =
  | { readonly role: 'mixed'; readonly district: District }
  | { readonly role: 'park'; readonly district: District; readonly park: ParkLayout }
  | {
      readonly role: 'housing';
      readonly district: District;
      readonly type: GeneratorType;
      readonly block: HousingBlock;
      /** What the lots at the ends of the block's streets stand, if any fits. */
      readonly shop: GeneratorType | undefined;
    };

/** The fewest districts with streets all round a plot needs before it spares one for a park. */
const PARKS = { fromDistricts: 4 } as const;

/**
 * Decides what every district is: a park, a block of houses, or a mixed row fill.
 *
 * Only a district with a street on all four sides can be a park or a block —
 * both hang their paths off those streets — which is every district but the
 * strip below the street along the hill's foot. Parks are spread evenly over the
 * districts big enough for one. A district themed on lodging becomes a block of
 * one lodging type, taking the types in turn so the resort gets a street of
 * villas as well as a street of cottages.
 */
function planDistricts(parts: DistrictParts): {
  plans: DistrictPlan[];
  cuts: LaneCut[];
} {
  const { districts, merged, cuts } = mergedForParks(districtsOf(parts), parts);
  const free = (district: District) => !parts.keepMixed.some((rect) => overlaps(rect, district));
  const bounded = districts
    .filter((entry) => entry.bounded && free(entry.district))
    .map((entry) => entry.district);
  const affords = budgetOf(bounded, parts.reserved);
  const parkPicks = parkPicksOf(bounded, parts.config.parkShare, merged);
  const housingPicks = bounded.filter(
    (district) =>
      parts.config.housing === 'blocks' &&
      district.theme === 'lodging' &&
      !parkPicks.includes(district),
  );

  // A park, then a block, then a park: when the room runs out before the list
  // does, the resort still gets some of each.
  const planned = new Map<District, DistrictPlan>();
  let turn = Math.floor(parts.random() * Math.max(1, parts.lodging.length));
  for (let index = 0; index < Math.max(parkPicks.length, housingPicks.length); index++) {
    const park = parkPlanOf(parkPicks[index], parts.random);
    if (park && affords(park.district)) planned.set(park.district, park);
    const block = housingPlanOf(housingPicks[index], parts, turn);
    if (block && affords(block.plan.district)) {
      turn = block.turn;
      planned.set(block.plan.district, block.plan);
    }
  }
  const plans = districts.map(
    ({ district }): DistrictPlan => planned.get(district) ?? { role: 'mixed', district },
  );
  return { plans, cuts };
}

/** Whether two rectangles share a tile. */
const overlaps = (a: TileRect, b: TileRect): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

/**
 * The plot size, as the side of a square of the same area, from which a park
 * may take two districts and the lane between them.
 */
const BIG_PARKS_FROM = 200;

/**
 * Districts with some neighbouring pairs made one, for the parks a large plot
 * can afford to make bigger: the pairs a service lane separates, spread evenly,
 * a quarter as many as the parks the share asks for. The lane between each pair
 * is cut, so the merged district still has a street on all four sides.
 */
function mergedForParks(
  districts: { bounded: boolean; district: District }[],
  parts: DistrictParts,
): { districts: { bounded: boolean; district: District }[]; merged: District[]; cuts: LaneCut[] } {
  const { tilesX, tilesZ, config, columns, seaLanes } = parts;
  if (Math.sqrt(tilesX * tilesZ) < BIG_PARKS_FROM || config.parkShare <= 0) {
    return { districts, merged: [], cuts: [] };
  }
  const bounded = districts.filter(
    (entry) => entry.bounded && !parts.keepMixed.some((rect) => overlaps(rect, entry.district)),
  );
  const droppable = (column: number) =>
    !seaLanes.has(column) && columns.some((street) => street.at === column && street.width === 1);
  const pairs = neighbourPairs(
    bounded.map((entry) => entry.district),
    droppable,
  ).filter((pair) => parkDesignsFor(pair.merged).includes('lake'));
  const chosen = spreadPairs(pairs, Math.round((bounded.length * config.parkShare) / 4));
  const gone = new Set(chosen.map((pair) => bounded[pair.east]!));
  const merged = new Map(
    chosen.map((pair) => {
      const west = bounded[pair.west]!;
      return [west, { ...pair.merged, theme: west.district.theme }] as const;
    }),
  );
  return {
    districts: districts
      .filter((entry) => !gone.has(entry))
      .map((entry) => ({ bounded: entry.bounded, district: merged.get(entry) ?? entry.district })),
    merged: [...merged.values()],
    cuts: chosen.map((pair) => pair.cut),
  };
}

interface DistrictParts {
  readonly columns: readonly Street[];
  readonly bands: readonly Street[];
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly density: number;
  readonly random: () => number;
  readonly lodging: readonly GeneratorType[];
  /** The lodging a resort holds to a number, mixed in among the houses rather than given blocks. */
  readonly accent: GeneratorType | undefined;
  /** What a block's shops are drawn from. */
  readonly shops: readonly GeneratorType[];
  readonly config: ResortConfig;
  readonly seaLanes: ReadonlySet<number>;
  /** Rectangles whose districts are left mixed: the gate squares reach into them. */
  readonly keepMixed: readonly TileRect[];
  /** District area kept mixed however many parks and blocks the plot could have. */
  readonly reserved: number;
}

/**
 * Every district, row by row, and whether it has a street on all four sides —
 * which is every one but the strip below the street along the hill's foot.
 */
function districtsOf(parts: DistrictParts): { bounded: boolean; district: District }[] {
  const { columns, bands, tilesX, tilesZ, random } = parts;
  const columnGaps = gapsBetween(columns, 0, tilesX - 1, false);
  const foot = spanOf(bands.at(-1)!).high;
  const rows = [
    ...gapsBetween(bands, 0, tilesZ - 1, false).map((gap) => ({
      low: gap.low,
      high: gap.high,
      bounded: true,
    })),
    ...gapsBetween(bands, 0, tilesZ - 1, true)
      .filter((gap) => gap.low > foot)
      .map((gap) => ({ low: gap.low, high: gap.high, bounded: false })),
  ];
  const themes = themesFor(random, rows.length * columnGaps.length);
  return rows.flatMap((row, rowIndex) =>
    columnGaps.map((column, columnIndex) => ({
      bounded: row.bounded,
      district: {
        x0: column.low,
        x1: column.high,
        z0: row.low,
        z1: row.high,
        theme: themes[rowIndex * columnGaps.length + columnIndex]!,
      },
    })),
  );
}

/** Tiles a district covers. */
const areaOf = (district: District): number =>
  (district.x1 - district.x0 + 1) * (district.z1 - district.z0 + 1);

/**
 * What the mixed districts can give up and still hold the rest of the
 * catalogue: every district handed to a park or a block is taken off it, and
 * one that would take it below nothing stays mixed.
 */
function budgetOf(bounded: readonly District[], reserved: number): (district: District) => boolean {
  let spare = bounded.reduce((sum, district) => sum + areaOf(district), 0) - reserved;
  return (district) => {
    if (spare < areaOf(district)) return false;
    spare -= areaOf(district);
    return true;
  };
}

/** The districts parks go in: a share of them, spread evenly over those big enough. */
function parkPicksOf(
  bounded: readonly District[],
  share: number,
  merged: readonly District[],
): District[] {
  const roomy = bounded.filter(
    (district) => parkLayout(district) !== null && !merged.includes(district),
  );
  const first = merged.filter((district) => bounded.includes(district));
  if (share <= 0 || bounded.length < PARKS.fromDistricts || roomy.length === 0) return first;
  const count = clamp(Math.round(bounded.length * share) - first.length, 0, roomy.length);
  return [
    ...first,
    ...Array.from(
      { length: count },
      (_, index) => roomy[Math.floor(((index + 0.5) * roomy.length) / count)]!,
    ),
  ];
}

/**
 * A district laid out as a park, or null when there is none or it is too small.
 *
 * The design is drawn from the ones the district is big enough for, and the
 * water given a wobble and a margin of its own, so no two parks of a resort
 * need come out alike.
 */
function parkPlanOf(
  district: District | undefined,
  random: () => number,
): Extract<DistrictPlan, { role: 'park' }> | null {
  if (!district) return null;
  const designs = parkDesignsFor(district);
  const style = {
    design: designs[Math.floor(random() * designs.length)] ?? 'canal',
    wobble: { lobes: (random() * 2 - 1) * WOBBLE_LIMIT, lean: (random() * 2 - 1) * WOBBLE_LIMIT },
    margin: Math.floor(random() * 3),
  };
  const park = parkLayout(district, style) ?? parkLayout(district);
  return park ? { role: 'park', district, park } : null;
}

/** A district laid out as a block, and the turn the next block starts from. */
function housingPlanOf(
  district: District | undefined,
  parts: DistrictParts,
  turn: number,
): { plan: Extract<DistrictPlan, { role: 'housing' }>; turn: number } | null {
  const found = district ? blockFor(district, parts, turn) : null;
  if (!district || !found) return null;
  const lot = found.block.lots.find((candidate) => candidate.role === 'shop');
  const shops = lot
    ? parts.shops.filter((shop) => shop.tilesX <= lot.width && shop.tilesZ <= lot.depth)
    : [];
  const shop = shops[Math.floor(parts.random() * shops.length)];
  return {
    plan: { role: 'housing', district, type: found.type, block: found.block, shop },
    turn: found.turn,
  };
}

/**
 * The block a district would be, taking the lodging types in turn from `turn`,
 * and the turn the next block starts from. Null when no type fits.
 */
function blockFor(
  district: District,
  parts: DistrictParts,
  turn: number,
): { type: GeneratorType; block: HousingBlock; turn: number } | null {
  const { lodging, density, accent, config } = parts;
  for (let tried = 0; tried < lodging.length; tried++) {
    const type = lodging[(turn + tried) % lodging.length]!;
    // Villas go among the smaller houses, and only among them: a villa on its
    // own between a snack bar and a spa is what the blocks are there to stop.
    const accented = accent && hostsAccent(type, accent) && config.villaShare > 0;
    const block = housingBlock(district, { x: type.tilesX, z: type.tilesZ }, density, {
      shops: true,
      ...(accented
        ? {
            accent: { footprint: { x: accent.tilesX, z: accent.tilesZ }, share: config.villaShare },
          }
        : {}),
    });
    if (block) return { type, block, turn: turn + tried + 1 };
  }
  return null;
}

/** What stands at the ends of a block's streets: something to walk down to. */
const SHOP_IDS: readonly string[] = ['bakery', 'coffee-shop', 'resort-bar', 'snack-bar'];

/**
 * How much room the mixed districts need per tile of what they owe the
 * catalogue: a type and the free row and column around it, with slack for the
 * rows a district cannot pack.
 */
const CATALOGUE_ROOM = 1.6;

/** The district area the rest of the catalogue needs to find a place in. */
function catalogueRoomOf(types: readonly GeneratorType[]): number {
  return (
    CATALOGUE_ROOM * types.reduce((sum, type) => sum + (type.tilesX + 1) * (type.tilesZ + 1), 0)
  );
}

/**
 * The paths the planned districts lay for themselves: a lane between each pair
 * of rows of a block, and a park's ring and its crossing. Each runs street to
 * street, so all of it is joined to the network by construction.
 */
function districtPaths(plans: readonly DistrictPlan[]): {
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
} {
  const nodes: PathNode[] = [];
  const edges: PathEdge[] = [];
  const run = (id: string, from: Tile, to: Tile): void => {
    nodes.push(
      { id: `${id}-a`, tileX: from.x, tileZ: from.z },
      { id: `${id}-b`, tileX: to.x, tileZ: to.z },
    );
    edges.push({ from: `${id}-a`, to: `${id}-b`, width: 1 });
  };
  plans.forEach((plan, index) => {
    if (plan.role === 'housing') {
      const { x0, x1 } = plan.district;
      plan.block.lanes.forEach((z, lane) =>
        run(`block${index}-${lane}`, { x: x0 - 1, z }, { x: x1 + 1, z }),
      );
    } else if (plan.role === 'park') {
      plan.park.runs.forEach((path, step) => run(`park${index}-${step}`, path.from, path.to));
    }
  });
  return { nodes, edges };
}

/** What standing a block's lots needs. */
interface HousingParts {
  readonly site: Site;
  readonly plots: ResortPlot[];
  readonly missing: Set<string>;
  readonly allowance: (type: GeneratorType) => number;
  readonly accent: GeneratorType | undefined;
}

/**
 * Stands a block's lots, each where it is still free: a house, or on an accent's
 * lot the accent while the resort still allows one, or on a shop's lot the
 * block's shop — and a house wherever the grander answer will not go.
 */
function standHousing(plan: Extract<DistrictPlan, { role: 'housing' }>, parts: HousingParts): void {
  for (const lot of plan.block.lots) {
    const wanted =
      lot.role === 'shop' ? plan.shop : lot.role === 'accent' ? allowedAccent(parts) : undefined;
    for (const type of wanted ? [wanted, plan.type] : [plan.type]) {
      if (standInLot(parts, type, lot)) break;
    }
  }
}

/**
 * Stands the one accent the catalogue still owes beside a smaller house, when no
 * block and no walk had a lot for it.
 *
 * Tried beside each house on level ground in turn, a tile of lawn between them,
 * and only where the ring round the accent is free — so it walls in nothing
 * that stood before it. Whatever is still owed after this is left to the mixed
 * districts, which is the last resort on a plot with no houses at all.
 */
function standOwedAccent(
  parts: HousingParts & {
    readonly types: ReadonlyMap<string, GeneratorType>;
    readonly random: () => number;
  },
): void {
  const { accent, missing } = parts;
  if (!accent || !missing.has(accent.id)) return;
  for (const house of parts.plots) {
    const type = parts.types.get(house.id);
    if (!type || type.category !== 'lodging' || !hostsAccent(type, accent)) continue;
    if (parts.site.levelOf(house.tileX, house.tileZ) !== 0) continue;
    if (standBesideHouse(parts, accent, house, type)) {
      missing.delete(accent.id);
      return;
    }
  }
}

/** Stands an accent east or west of a house, fronts in line, a tile of lawn between. */
function standBesideHouse(
  parts: Stand,
  accent: GeneratorType,
  house: ResortPlot,
  type: GeneratorType,
): boolean {
  const rotation = house.rotation ?? 0;
  const footprint = footprintOf(accent, 0);
  const size = footprintOf(type, rotation);
  const tileZ = house.tileZ + size.z - footprint.z;
  return [house.tileX + size.x + 1, house.tileX - footprint.x - 1].some((tileX) => {
    const tile = { x: tileX, z: tileZ };
    if (!fits(parts.site, footprint, tileX, tileZ)) return false;
    return standSkirted(parts, accent, footprintTilesAt(footprint, tile), tile, rotation);
  });
}

/** The accent, if the resort has one and has not yet stood all it allows. */
function allowedAccent(parts: {
  readonly plots: readonly ResortPlot[];
  readonly allowance: (type: GeneratorType) => number;
  readonly accent: GeneratorType | undefined;
}): GeneratorType | undefined {
  const { accent } = parts;
  if (!accent) return undefined;
  const stood = parts.plots.filter((plot) => plot.id === accent.id).length;
  return stood < parts.allowance(accent) ? accent : undefined;
}

/** Stands one type in a lot of a block, fronted to its street. False where it will not go. */
function standInLot(parts: HousingParts, type: GeneratorType, lot: BlockLot): boolean {
  const footprint = footprintOf(type, lot.rotation);
  if (footprint.x > lot.width || footprint.z > lot.depth) return false;
  const { tileX, tileZ } = lotAnchor(lot, footprint);
  if (!fits(parts.site, footprint, tileX, tileZ)) return false;
  claim(parts.site, footprint, tileX, tileZ);
  parts.plots.push({ id: type.id, tileX, tileZ, rotation: lot.rotation });
  parts.missing.delete(type.id);
  return true;
}

/** The trees a park is planted with, two to a park. */
const PARK_TREES: readonly string[] = ['blossom', 'olive', 'cypress', 'palm'];

/**
 * Furnishes a park: its fountain, its lawns with its two species in the
 * checkerboard it was laid out with, its flower beds and its picnic tables.
 *
 * Stood before the streets are marked, like the landmarks, because a plaza is
 * paving and its fountain and beds are meant to stand on it.
 */
function standPark(
  plan: Extract<DistrictPlan, { role: 'park' }>,
  parts: {
    readonly types: ReadonlyMap<string, GeneratorType>;
    readonly site: Site;
    readonly plots: ResortPlot[];
    readonly missing: Set<string>;
    readonly random: () => number;
  },
): void {
  const { types, random, site, plots, missing } = parts;
  const first = Math.floor(random() * PARK_TREES.length);
  const second = (first + 1 + Math.floor(random() * (PARK_TREES.length - 1))) % PARK_TREES.length;
  const species = [types.get(PARK_TREES[first]!), types.get(PARK_TREES[second]!)] as const;
  const { park } = plan;
  const furniture = [
    ...(park.centrepiece
      ? [{ type: types.get(PLAZA_ID), tile: park.centrepiece, rotation: 0 }]
      : []),
    ...park.trees.map((tree) => ({ type: species[tree.species], tile: tree.tile, rotation: 0 })),
    ...park.beds.map((tile) => ({ type: types.get(PARK_BED_ID), tile, rotation: 0 })),
    ...park.tables.map(({ tile, rotation }) => ({ type: types.get(TABLE_ID), tile, rotation })),
  ];
  for (const { type, tile, rotation } of furniture) {
    if (!type) continue;
    const footprint = footprintOf(type, rotation as Rotation);
    if (!fits(site, footprint, tile.x, tile.z)) continue;
    claim(site, footprint, tile.x, tile.z);
    plots.push({ id: type.id, tileX: tile.x, tileZ: tile.z, rotation: rotation as Rotation });
    missing.delete(type.id);
  }
}

/** What the beds of a park are planted with. */
const PARK_BED_ID = 'flowerbed';

/** What a park's lawns are furnished with, along its paths. */
const TABLE_ID = 'picnic-table';

/**
 * Grows a whole resort from four numbers.
 *
 * The catalogue is passed in rather than imported so this stays a pure function
 * of its arguments — the art is data to the generator, exactly as it is to the
 * rest of the layout.
 */
export function generateResort(types: readonly GeneratorType[], asked: ResortParams): ResortPlan {
  const params = clampParams(asked);
  const config = clampConfig(params.config);
  const random = createRandom(params.seed);
  const catalogue = catalogueOf(types);
  const land = landOf(params);
  const town = townOf(params, land, random);
  const gate = catalogue.byId.get(GATE_ID);
  // The squares' rectangles are known before the streets are, and the districts
  // they reach into are kept mixed; what stands on them waits for the streets.
  const squareRects =
    config.gatePlazas && gate ? gateSquaresOf(town, gate, params, () => false) : [];
  const { plans, cuts } = planDistricts({
    columns: town.columns,
    bands: town.bands,
    seaLanes: town.seaLanes,
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    density: params.density,
    random,
    config,
    lodging: catalogue.lodging,
    accent: catalogue.accent,
    shops: catalogue.shops,
    reserved: catalogueRoomOf(catalogue.bySize),
    keepMixed: squareRects.map((square) => square.plaza),
  });
  const grid = streetGridOf({
    ...town,
    ...land,
    cuts,
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
  });
  const onStreet = streetPredicateOf(grid, params);
  const squares = config.gatePlazas && gate ? gateSquaresOf(town, gate, params, onStreet) : [];
  // The walks: one down the middle of every bench of the hill, and two
  // switchbacks climbing across them. All of them follow the coast rather than
  // the grid, which is what the grid cannot do — see `coastWalk`.
  const walks = land.shore
    ? walksFor({ shore: land.shore, hill: land.hill, tilesX: params.tilesX, tilesZ: params.tilesZ })
    : { nodes: [], edges: [], benches: [] };
  const inside = districtPaths(plans);
  const avenues = config.streetTrees ? avenuesOf(town, land, catalogue, random, params) : null;
  const skeleton: ResortPlan = {
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    plots: [],
    nodes: [...grid.nodes, ...walks.nodes, ...inside.nodes],
    edges: [...grid.edges, ...walks.edges, ...inside.edges],
    plazas: [town.plaza, ...squares.map((square) => square.plaza), ...parkPlazasOf(plans)],
    shore: land.shoreSpec,
    ...(land.terraces ? { elevation: land.terraces } : {}),
    ...parklandOf(plans),
    ...(avenues ? { avenues } : {}),
  };
  return standResort({
    skeleton,
    params,
    config,
    catalogue,
    land,
    town,
    walks,
    plans,
    squares,
    random,
  });
}

/** The catalogue sorted into what each part of the generator draws from. */
interface Catalogue {
  readonly buildable: readonly GeneratorType[];
  readonly byId: ReadonlyMap<string, GeneratorType>;
  /** What the districts draw from, largest first. */
  readonly bySize: readonly GeneratorType[];
  /** What the housing blocks are laid out for. */
  readonly lodging: readonly GeneratorType[];
  readonly accent: GeneratorType | undefined;
  readonly shops: readonly GeneratorType[];
}

function catalogueOf(types: readonly GeneratorType[]): Catalogue {
  const buildable = types.filter((type) => !DERIVED_IDS.has(type.id));
  const byId = new Map(buildable.map((type) => [type.id, type]));
  return {
    buildable,
    byId,
    // Largest first, so a tennis court gets its pick of the districts while there
    // is still a district that will take it — and without the types a model holds
    // to the beach, which the beach stands and a district never should, and the
    // gate, which only ever stands on the plot's edge.
    bySize: buildable
      .filter((type) => !type.placement?.ground && type.id !== GATE_ID)
      .toSorted((a, b) => b.tilesX * b.tilesZ - a.tilesX * a.tilesZ),
    lodging: buildable.filter(
      (type) =>
        type.category === 'lodging' && !type.placement?.ground && !type.placement?.perResort,
    ),
    accent: accentOf(buildable),
    shops: SHOP_IDS.flatMap((id) => byId.get(id) ?? []),
  };
}

/** The ground a plot of this size and seed gets: its coast, its hill, and where level ground starts. */
interface Land {
  readonly shoreSpec: ShoreSpec;
  readonly shore: Shore | null;
  readonly hill: Hill | null;
  readonly terraces: ElevationSpec | null;
  readonly hillFoot: number;
}

function landOf(params: ResortParams): Land {
  const { tilesX, tilesZ } = params;
  const shoreSpec = shoreSpecFor(params);
  const shore = shoreFor({ tilesX, tilesZ, shore: shoreSpec });
  // The hill comes before the streets rather than after them: it is anchored to
  // the water, so it owes the street grid nothing, and the street grid has to be
  // told where it ends.
  const hill = shore ? hillFor(params, shoreSpec) : null;
  return {
    shoreSpec,
    shore,
    hill,
    // Absent rather than present-and-flat on a plot too shallow to terrace, which
    // is what `exactOptionalPropertyTypes` asks of an optional field.
    terraces: elevationSpecFor(hill, params.seed),
    hillFoot: hillFootOf(shore, hill, tilesX, tilesZ),
  };
}

/** The streets a plot is laid out on, before any district is decided. */
interface Town {
  readonly columns: readonly Street[];
  readonly bands: readonly Street[];
  readonly promenade: Street;
  readonly gateBand: Street;
  readonly plaza: Plaza;
  readonly seaLanes: ReadonlySet<number>;
}

function townOf(params: ResortParams, land: Land, random: () => number): Town {
  const { tilesX, tilesZ } = params;
  const columns = columnsFor(random, tilesX);
  const bands = bandsFor(tilesZ, land.hillFoot);
  const promenade = columns.find((street) => street.width === PROMENADE_WIDTH) ?? columns[0]!;
  // The plaza, and the side gates, are on the middle of the cross streets between
  // the one along the north edge and the one along the hill's foot.
  const between = bands.slice(1, -1);
  const gateBand = between[Math.floor(between.length / 2)] ?? bands[0]!;
  return {
    columns,
    bands,
    promenade,
    gateBand,
    plaza: plazaAt(promenade, gateBand, tilesX, tilesZ),
    // Only the sea lanes cross the hill and the beach; every other street stops
    // where the level ground does. See `seaLanesOf` and `walksFor`.
    seaLanes: seaLanesOf(columns, promenade, tilesX),
  };
}

/** Whether a tile is on one of the grid's streets, plazas aside. */
function streetPredicateOf(
  grid: { readonly nodes: readonly PathNode[]; readonly edges: readonly PathEdge[] },
  params: ResortParams,
): (tileX: number, tileZ: number) => boolean {
  const tiles = streetTiles({
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    plots: [],
    nodes: grid.nodes,
    edges: grid.edges,
    plazas: [],
  });
  const keys = new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));
  return (tileX, tileZ) => keys.has(tileKey(tileX, tileZ));
}

/**
 * The squares inside the gates: one where the promenade comes in from the north
 * edge, and one inside either end of the plaza's cross street — the same tiles
 * {@link landmarks} stands the gates on.
 */
function gateSquaresOf(
  town: Town,
  gate: GeneratorType,
  params: ResortParams,
  onStreet: (tileX: number, tileZ: number) => boolean,
): GateSquare[] {
  const across = Math.floor(gate.tilesX / 2);
  const north = town.promenade.at - across;
  const side = town.gateBand.at - across;
  const eastX = params.tilesX - gate.tilesZ;
  return [
    gateSquare(
      { x0: north, x1: north + gate.tilesX - 1, z0: 0, z1: gate.tilesZ - 1 },
      'south',
      onStreet,
    ),
    gateSquare(
      { x0: 0, x1: gate.tilesZ - 1, z0: side, z1: side + gate.tilesX - 1 },
      'east',
      onStreet,
    ),
    gateSquare(
      { x0: eastX, x1: params.tilesX - 1, z0: side, z1: side + gate.tilesX - 1 },
      'west',
      onStreet,
    ),
  ];
}

/** The sign posts and flower beds of the gate squares, stood before the streets are marked. */
function standGateSquares(
  squares: readonly GateSquare[],
  parts: HousingParts & { readonly types: ReadonlyMap<string, GeneratorType> },
): void {
  const one = { x: 1, z: 1 };
  for (const square of squares) {
    const furniture = [
      ...(square.sign ? [{ id: SIGN_ID, tile: square.sign }] : []),
      ...square.beds.map((tile) => ({ id: PARK_BED_ID, tile })),
    ];
    for (const { id, tile } of furniture) {
      const type = parts.types.get(id);
      if (!type || !fits(parts.site, one, tile.x, tile.z)) continue;
      claim(parts.site, one, tile.x, tile.z);
      parts.plots.push({ id, tileX: tile.x, tileZ: tile.z, rotation: 0 });
      parts.missing.delete(id);
    }
  }
}

/** What reads a gate square's way in. */
const SIGN_ID = 'sign-post';

/** The trees an avenue may be planted with; one species to a resort. */
const AVENUE_TREES: readonly string[] = ['palm', 'cypress'];

/** The promenade and the cross streets, as the rectangles their trees are lined along. */
function avenuesOf(
  town: Town,
  land: Land,
  catalogue: Catalogue,
  random: () => number,
  params: ResortParams,
): ResortPlan['avenues'] | null {
  const trees = AVENUE_TREES.filter((id) => catalogue.byId.has(id));
  const tree = trees[Math.floor(random() * trees.length)];
  if (!tree) return null;
  const promenade = spanOf(town.promenade);
  const west = town.columns[0]!.at;
  const east = town.columns.at(-1)!.at;
  return {
    tree,
    streets: [
      { x0: promenade.low, x1: promenade.high, z0: 1, z1: land.hillFoot },
      ...town.bands.map((band) => {
        const span = spanOf(band);
        const wide = band === town.gateBand;
        return {
          x0: wide ? 1 : west,
          x1: wide ? params.tilesX - 2 : east,
          z0: span.low,
          z1: span.high,
        };
      }),
    ],
  };
}

/** Everything standing a resort on its skeleton needs. */
interface StandParts {
  readonly skeleton: ResortPlan;
  readonly params: ResortParams;
  readonly config: ResortConfig;
  readonly catalogue: Catalogue;
  readonly land: Land;
  readonly town: Town;
  readonly walks: Walks;
  readonly plans: readonly DistrictPlan[];
  readonly squares: readonly GateSquare[];
  readonly random: () => number;
}

/**
 * Stands everything on a resort's skeleton, in the order the plot is grown:
 * what sits on the paving, then the beach and the hill, then the districts.
 */
function standResort(parts: StandParts): ResortPlan {
  const { skeleton, params, catalogue, land, town, plans, random } = parts;
  const terraced = elevationFor(skeleton);
  const site: Site = {
    taken: new Set(),
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    levelOf: (tileX, tileZ) => levelAt(terraced, tileX, tileZ),
  };
  const missing = new Set(catalogue.buildable.map((type) => type.id));
  // The sea and the ponds are spoken for before anything is stood, so nothing
  // below has to check for them: a district, a landmark and a lane all just find
  // the tiles taken.
  for (const tile of waterTilesOf(land.shore)) site.taken.add(tileKey(tile.x, tile.z));
  for (const pond of skeleton.terrain ?? []) site.taken.add(tileKey(pond.tileX, pond.tileZ));
  const streets = streetTiles(skeleton);

  // Landmarks are stood before the streets are marked, because they are meant to
  // sit on the paving: the gates close the streets' ends, the fountain stands in
  // the middle of its plaza, and a square's sign and a park's fountain on theirs.
  const types = catalogue.byId;
  const plots = landmarks({ ...town, types, site, missing });
  const housing = {
    types,
    site,
    plots,
    missing,
    random,
    accent: catalogue.accent,
    allowance: (type: GeneratorType) => allowanceOf(type, params),
  };
  standGateSquares(parts.squares, housing);
  for (const plan of plans) {
    if (plan.role === 'park') standPark(plan, housing);
  }
  for (const tile of streets) site.taken.add(tileKey(tile.x, tile.z));

  fillShoreAndHill(parts, { site, plots, missing, terraced });
  fillDistricts(plans, {
    ...housing,
    bySize: catalogue.bySize,
    density: params.density,
    lodgingDrawn: parts.config.housing === 'mixed',
  });
  return { ...skeleton, plots, standsWholeCatalogue: missing.size === 0 };
}

/**
 * Fills the beach and the hill, *before* the districts and on their own terms,
 * and reserves whatever they leave bare against the districts wholesale. Two
 * things follow from that order, and both are the point of it: a bungalow ends
 * up on the shelf and a lounger on the sand rather than in whichever district
 * the walk reached first, and no district ever spills onto ground that a row
 * grid is the wrong shape for.
 */
function fillShoreAndHill(
  parts: StandParts,
  stood: {
    readonly site: Site;
    readonly plots: ResortPlot[];
    readonly missing: Set<string>;
    readonly terraced: Elevation | null;
  },
): void {
  const { params, config, catalogue, land, town, walks, random } = parts;
  const { site, plots, missing, terraced } = stood;
  const types = catalogue.byId;
  if (land.shore) {
    fillBeach({
      shore: land.shore,
      types,
      site,
      missing,
      density: beachDensityOf(config.beach, params.density),
      random,
      plots,
      features: catalogue.buildable
        .filter((type) => type.placement?.ground && type.placement.perResort)
        .map((type) => ({ type, count: allowanceOf(type, params) })),
      seaLanes: [...town.seaLanes].toSorted((a, b) => a - b),
    });
  }
  if (terraced) {
    const hillParts = {
      elevation: terraced,
      types,
      site,
      missing,
      density: params.density,
      random,
      plots,
    };
    lineBenchWalks({
      ...hillParts,
      walks: walks.benches,
      accent: catalogue.accent,
      accentShare: config.villaShare,
      allowance: (type) => allowanceOf(type, params),
    });
    fillHill(hillParts);
  }
  for (const tile of [...beachTilesOf(land.shore), ...raisedTilesOf(terraced)]) {
    site.taken.add(tileKey(tile.x, tile.z));
  }
}

/**
 * Fills every district as it was planned: the blocks first, so a mixed district
 * knows which lodging the blocks have already stood when it decides whether it
 * owes the catalogue a house. The parks were furnished before the streets were
 * marked; see {@link standPark}.
 */
function fillDistricts(
  plans: readonly DistrictPlan[],
  parts: {
    readonly types: ReadonlyMap<string, GeneratorType>;
    readonly bySize: readonly GeneratorType[];
    readonly site: Site;
    readonly plots: ResortPlot[];
    readonly missing: Set<string>;
    readonly random: () => number;
    readonly density: number;
    readonly allowance: (type: GeneratorType) => number;
    readonly lodgingDrawn: boolean;
    readonly accent: GeneratorType | undefined;
  },
): void {
  for (const plan of plans) {
    if (plan.role === 'housing') standHousing(plan, parts);
  }
  standOwedAccent(parts);
  const stood = new Map<string, number>();
  for (const plot of parts.plots) stood.set(plot.id, (stood.get(plot.id) ?? 0) + 1);
  for (const plan of plans) {
    if (plan.role !== 'mixed') continue;
    fillDistrict({ ...parts, district: plan.district, types: parts.bySize, stood });
  }
}

/** The first row of level ground in the column where the hill reaches furthest inland, less one. */
function hillFootOf(
  shore: Shore | null,
  hill: Hill | null,
  tilesX: number,
  tilesZ: number,
): number {
  let foot = tilesZ - 2;
  for (let tileX = 0; tileX < tilesX; tileX++) {
    foot = Math.min(foot, landStartZ(shore, hill, tilesZ, tileX) - 1);
  }
  return foot;
}

/**
 * The street grid: the columns, two of which run out to sea as piers and the
 * rest of which stop at the hill's foot, and the cross streets between the flank
 * lanes — except the gate band, which runs on to the gates on the plot's edges.
 */
function streetGridOf(parts: {
  readonly columns: readonly Street[];
  readonly bands: readonly Street[];
  readonly gateBand: Street;
  readonly seaLanes: ReadonlySet<number>;
  readonly shore: Shore | null;
  readonly hillFoot: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Stretches of lane given over to a park either side of them. */
  readonly cuts: readonly LaneCut[];
}): { readonly nodes: readonly PathNode[]; readonly edges: readonly PathEdge[] } {
  const { columns, bands, gateBand, seaLanes, shore, hillFoot, tilesX, tilesZ } = parts;
  const endOf = (street: Street): number =>
    seaLanes.has(street.at) && shore ? pierEndZ(shore, tilesZ, street.at) : hillFoot;
  const down = { nodes: [] as PathNode[], edges: [] as PathEdge[] };
  columns.forEach((street, index) => {
    uncutRuns(street.at, 1, endOf(street), parts.cuts).forEach((run, piece) => {
      const id = `col${index}-${piece}`;
      down.nodes.push(
        { id: `${id}-a`, tileX: street.at, tileZ: run.from },
        { id: `${id}-b`, tileX: street.at, tileZ: run.to },
      );
      down.edges.push({
        from: `${id}-a`,
        to: `${id}-b`,
        width: street.width,
        overWater: seaLanes.has(street.at),
      });
    });
  });
  const west = columns[0]!.at;
  const east = columns[columns.length - 1]!.at;
  const across = streetGraph(
    bands,
    'band',
    (street) => ({ id: '', tileX: street === gateBand ? 1 : west, tileZ: street.at }),
    (street) => ({ id: '', tileX: street === gateBand ? tilesX - 2 : east, tileZ: street.at }),
  );
  return { nodes: [...down.nodes, ...across.nodes], edges: [...down.edges, ...across.edges] };
}

/** The lodging a resort holds to a number: the villa, mixed in among the houses. */
function accentOf(types: readonly GeneratorType[]): GeneratorType | undefined {
  return types.find(
    (type) => type.category === 'lodging' && !type.placement?.ground && type.placement?.perResort,
  );
}

/** The squares the parks pave whole. */
function parkPlazasOf(plans: readonly DistrictPlan[]): Plaza[] {
  return plans.flatMap((plan) =>
    plan.role === 'park' && plan.park.plaza ? [plan.park.plaza] : [],
  );
}

/** The ponds the parks dig, as terrain edits, and the parks' own rectangles. */
function parklandOf(plans: readonly DistrictPlan[]): {
  terrain?: readonly TerrainEdit[];
  parks?: readonly Plaza[];
} {
  const parks = plans.flatMap((plan) => (plan.role === 'park' ? [plan] : []));
  if (parks.length === 0) return {};
  return {
    terrain: parks.flatMap((plan) =>
      plan.park.water.map((tile) => ({
        tileX: tile.x,
        tileZ: tile.z,
        level: 0,
        surface: 'water' as const,
      })),
    ),
    parks: parks.map(({ district }) => ({
      x0: district.x0,
      x1: district.x1,
      z0: district.z0,
      z1: district.z1,
    })),
  };
}

/**
 * Bare ground of a given size: no objects, no streets, nothing built.
 *
 * The starting point for building a resort by hand rather than being handed one,
 * and it is bare ground rather than *blank* ground. A cleared plot is a
 * landscape — a bay, a beach, a terraced hill behind it and a river coming down
 * off that hill into the sea — because a blank green rectangle is not somewhere
 * anybody wants to start building, and every one of those is a fact about the
 * plot rather than about what has been put on it.
 *
 * The seed is the whole landscape, exactly as it is the whole resort: clearing
 * with a different one gives a different coast, a different hill and a different
 * river.
 *
 * It is the one plan that cannot claim to stand the whole catalogue, which is
 * why `standsWholeCatalogue` exists at all.
 */
export function emptyResortPlan(tilesX: number, tilesZ: number, seed = 0): ResortPlan {
  const params = clampParams({ tilesX, tilesZ, density: 1, seed });
  const shoreSpec = shoreSpecFor(params);
  const terraces = elevationSpecFor(hillFor(params, shoreSpec), params.seed);
  const plan: ResortPlan = {
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    plots: [],
    nodes: [],
    edges: [],
    plazas: [],
    shore: shoreSpec,
    ...(terraces ? { elevation: terraces } : {}),
    standsWholeCatalogue: false,
  };
  // Carved against the plan's own ground, so the river reads the levels the hill
  // actually stands at — and carried as terrain edits, because a channel running
  // down the plot is not a line that can be strung across it. See `river.ts`.
  const river = riverEditsFor({
    shore: shoreFor(plan),
    elevation: elevationFor(plan),
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    seed: params.seed,
  });
  return river.length > 0 ? { ...plan, terrain: river } : plan;
}
