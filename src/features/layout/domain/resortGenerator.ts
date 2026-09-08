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
 * 4. **The catalogue first, the filling after.** Every type that has not been
 *    placed yet is placed before anything is repeated, so the showcase shows the
 *    whole catalogue whatever the density asks for.
 *
 * Everything here is a pure function of the parameters, and the seed makes it
 * reproducible: the same four numbers give the same resort, which is what lets
 * a plot be shared, benchmarked and regression-tested.
 */

import type { ModelCategory } from "../../../../voxel-gen/voxelgen.ts";
import {
  HEDGE_ID,
  LAMP_ID,
  PATH_ID,
  type PathNode,
  type ResortPlan,
  type ResortPlot,
} from "./resortPlan";
import { streetTiles, tileKey, widthOffsets } from "./resortLayout";

/** The gate object, stood at both ends of the promenade. */
const GATE_ID = "entrance";

/** The object dropped in the middle of the promenade's plaza. */
const PLAZA_ID = "fountain";

/** Object types the layout scatters itself, which no plan should place. */
const DERIVED = new Set([PATH_ID, LAMP_ID, HEDGE_ID]);

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
  const pool: ModelCategory[] = ["lodging", "amenities", "leisure"];
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

function fits(site: Site, type: GeneratorType, tileX: number, tileZ: number): boolean {
  if (tileX < 0 || tileZ < 0) return false;
  if (tileX + type.tilesX > site.tilesX || tileZ + type.tilesZ > site.tilesZ) return false;
  for (let z = tileZ; z < tileZ + type.tilesZ; z++) {
    for (let x = tileX; x < tileX + type.tilesX; x++) {
      if (site.taken.has(tileKey(x, z))) return false;
    }
  }
  return true;
}

function claim(site: Site, type: GeneratorType, tileX: number, tileZ: number): void {
  for (let z = tileZ; z < tileZ + type.tilesZ; z++) {
    for (let x = tileX; x < tileX + type.tilesX; x++) site.taken.add(tileKey(x, z));
  }
}

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
 * Lays one district out in rows, leaving a free tile row between them.
 *
 * The free row is load-bearing. `layoutResort` grows a spur from every object to
 * the nearest street and throws if it cannot reach one, so a district packed
 * solid would be a plan it refuses. A row of objects with a clear row above and
 * below always has a way out to the street the district borders.
 */
function fillDistrict(parts: FillParts): void {
  const { district } = parts;
  for (let z = district.z0; z <= district.z1;) {
    z += fillRow(parts, z) + 1;
  }
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
function fillRow(parts: FillParts, z: number): number {
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
    if (!fits(site, type, x, z)) {
      x += 1;
      continue;
    }

    claim(site, type, x, z);
    plots.push({ id: type.id, tileX: x, tileZ: z });
    missing.delete(type.id);
    depth = Math.max(depth, type.tilesZ);
    x += type.tilesX + (random() < 0.4 ? 1 : 0);
  }
  return depth;
}

/** The gate at each end of the promenade, and the fountain in its plaza. */
function landmarks(parts: {
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly promenade: Street;
  readonly plaza: { x0: number; x1: number; z0: number; z1: number };
  readonly site: Site;
  readonly missing: Set<string>;
}): ResortPlot[] {
  const { types, site, missing } = parts;
  const plots: ResortPlot[] = [];
  const stand = (type: GeneratorType | undefined, tileX: number, tileZ: number): void => {
    if (!type || !fits(site, type, tileX, tileZ)) return;
    claim(site, type, tileX, tileZ);
    plots.push({ id: type.id, tileX, tileZ });
    missing.delete(type.id);
  };

  // Both gates straddle the promenade's ends, which is what makes them read as
  // the way in rather than as two more buildings.
  const gate = types.get(GATE_ID);
  if (gate) {
    const tileX = parts.promenade.at - Math.floor(gate.tilesX / 2);
    stand(gate, tileX, 0);
    stand(gate, tileX, site.tilesZ - gate.tilesZ);
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

  const buildable = types.filter((type) => !DERIVED.has(type.id));
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
    "col",
    (street) => ({ id: "", tileX: street.at, tileZ: 1 }),
    (street) => ({ id: "", tileX: street.at, tileZ: tilesZ - 2 }),
  );
  const across = streetGraph(
    bands,
    "band",
    (street) => ({ id: "", tileX: columns[0]!.at, tileZ: street.at }),
    (street) => ({ id: "", tileX: columns[columns.length - 1]!.at, tileZ: street.at }),
  );
  const skeleton: ResortPlan = {
    tilesX,
    tilesZ,
    plots: [],
    nodes: [...down.nodes, ...across.nodes],
    edges: [...down.edges, ...across.edges],
    plazas: [plaza],
  };

  const site: Site = { taken: new Set(), tilesX, tilesZ };
  const missing = new Set(buildable.map((type) => type.id));
  // Landmarks are stood before the streets are marked, because both of them are
  // meant to sit on the paving: the gates straddle the promenade's ends and the
  // fountain stands in the middle of its plaza.
  const plots = landmarks({ types: byId, promenade, plaza, site, missing });
  for (const tile of streetTiles(skeleton)) site.taken.add(tileKey(tile.x, tile.z));

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
  const { tilesX: x, tilesZ: z } = clampParams({ tilesX, tilesZ, density: 1, seed: 0 });
  return {
    tilesX: x,
    tilesZ: z,
    plots: [],
    nodes: [],
    edges: [],
    plazas: [],
    standsWholeCatalogue: false,
  };
}
