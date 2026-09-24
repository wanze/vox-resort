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

const GATE_ID = 'entrance';

const PLAZA_ID = 'fountain';

export const PLOT_TILES = { min: 48, max: 480 } as const;

export const PLOT_DENSITY = { min: 0.2, max: 1 } as const;

export interface ResortParams {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly density: number;
  readonly seed: number;
  readonly config?: Partial<ResortConfig>;
}

export interface GeneratorType {
  readonly id: string;
  readonly category: ModelCategory;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly placement?: ModelPlacement;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// Pulled in rather than refused: these come off HUD sliders, and a slider must not throw.
export function clampParams(params: ResortParams): ResortParams {
  return {
    tilesX: Math.round(clamp(params.tilesX, PLOT_TILES.min, PLOT_TILES.max)),
    tilesZ: Math.round(clamp(params.tilesZ, PLOT_TILES.min, PLOT_TILES.max)),
    density: clamp(params.density, PLOT_DENSITY.min, PLOT_DENSITY.max),
    seed: Math.abs(Math.trunc(params.seed)) % 0xffffffff,
    config: clampConfig(params.config),
  };
}

interface Street {
  readonly at: number;
  readonly width: number;
}

function spanOf(street: Street): { readonly low: number; readonly high: number } {
  const offsets = widthOffsets(street.width);
  return { low: street.at + offsets[0]!, high: street.at + offsets[offsets.length - 1]! };
}

function spread(low: number, high: number, count: number): number[] {
  const step = (high - low) / (count + 1);
  return Array.from({ length: count }, (_, index) => Math.round(low + step * (index + 1)));
}

const EDGE_MARGIN = 2;

const MIN_DISTRICT_WIDTH = 8;

const MIN_DISTRICT_DEPTH = 6;

const PROMENADE_WIDTH = 2;
const CROSS_STREET_WIDTH = 2;

interface District {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly theme: ModelCategory;
}

const byPosition = (a: Street, b: Street): number => a.at - b.at;

function districtWidths(streets: readonly Street[]): number[] {
  return streets
    .slice(1)
    .map((street, index) => spanOf(street).low - spanOf(streets[index]!).high - 1);
}

function thin(fixed: readonly Street[], candidates: readonly Street[], minimum: number): Street[] {
  let chosen = fixed.toSorted(byPosition);
  for (const candidate of candidates) {
    const next = [...chosen, candidate].toSorted(byPosition);
    if (districtWidths(next).every((width) => width >= minimum)) chosen = next;
  }
  return chosen;
}

function columnsFor(random: () => number, tilesX: number): Street[] {
  const west = { at: EDGE_MARGIN, width: 1 };
  const east = { at: tilesX - 1 - EDGE_MARGIN, width: 1 };
  // Off centre per seed: a promenade exactly halfway makes both halves of every resort the same size.
  const promenade = { at: Math.round(tilesX * (0.42 + random() * 0.16)), width: PROMENADE_WIDTH };
  const lanes = spread(west.at, east.at, clamp(Math.round(tilesX / 16), 1, 9)).map((at) => ({
    at,
    width: 1,
  }));
  return thin([west, promenade, east], lanes, MIN_DISTRICT_WIDTH);
}

function bandsFor(tilesZ: number, southLimit: number): Street[] {
  const limit = Math.min(tilesZ - 2, southLimit);
  const north = { at: NORTH_STREET_AT, width: CROSS_STREET_WIDTH };
  const foot = { at: limit, width: CROSS_STREET_WIDTH };
  const positions = spread(north.at, limit, clamp(Math.round(limit / 20), 1, 6));
  return thin(
    [north, foot],
    positions.map((at) => ({ at, width: CROSS_STREET_WIDTH })),
    MIN_DISTRICT_DEPTH,
  );
}

const NORTH_STREET_AT = 2;

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

function themesFor(random: () => number, count: number): ModelCategory[] {
  const pool: ModelCategory[] = ['lodging', 'amenities', 'leisure'];
  return Array.from({ length: count }, (_, index) => {
    // Walk the pool rather than draw from it so a resort never gets five lodging districts in a row.
    const drift = random() < 0.3 ? 1 : 0;
    return pool[(index + drift) % pool.length]!;
  });
}

interface Site {
  readonly taken: Set<string>;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly levelOf: LevelProvider;
}

function fits(site: Site, footprint: Extent, tileX: number, tileZ: number): boolean {
  if (tileX < 0 || tileZ < 0) return false;
  if (tileX + footprint.x > site.tilesX || tileZ + footprint.z > site.tilesZ) return false;
  for (let z = tileZ; z < tileZ + footprint.z; z++) {
    for (let x = tileX; x < tileX + footprint.x; x++) {
      if (site.taken.has(tileKey(x, z))) return false;
    }
  }
  // layoutResort refuses a finished plan with a footprint across a terrace step.
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

const footprintOf = (type: GeneratorType, rotation: Rotation): Extent =>
  rotateExtent(type.tilesX, type.tilesZ, rotation);

interface Space {
  readonly x: number;
  readonly z: number;
}

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

const ROW_TURNS: readonly Rotation[] = [0, 2];

// The free row between rows is load-bearing: layoutResort throws for an object that cannot reach a street.
function fillDistrict(parts: FillParts): void {
  const { district } = parts;
  let row = 0;
  for (let z = district.z0; z <= district.z1; row++) {
    z += fillRow(parts, z, ROW_TURNS[row % ROW_TURNS.length]!) + 1;
  }
}

const QUARTER_TURN_CHANCE = 0.3;

// A quarter turn swaps the footprint, so it is only offered when those tiles are free; the row's
// half turn keeps the measured footprint and is always the fallback.
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
  readonly stood: Map<string, number>;
  readonly allowance: (type: GeneratorType) => number;
  readonly lodgingDrawn: boolean;
}

function drawable(parts: FillParts, type: GeneratorType): boolean {
  if (parts.missing.has(type.id)) return true;
  if (NEVER_DRAWN.has(type.id)) return false;
  if (type.category === 'lodging' && (!parts.lodgingDrawn || type.placement?.perResort)) {
    return false;
  }
  return (parts.stood.get(type.id) ?? 0) < parts.allowance(type);
}

const NEVER_DRAWN: ReadonlySet<string> = new Set(['fountain', 'sun-lounger']);

const POOL_ID = 'swimming-pool';

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
    // Rotation 3 puts the backrest to the east, facing the pool.
    parts.plots.push({ id: lounger.id, tileX: tile.x, tileZ: tile.z, rotation: 3 });
  }
  return 1;
}

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

    // Never skip a type nothing has stood yet: an empty lawn is a choice, a missing catalogue entry is a bug.
    if (!missing.has(type.id) && random() > parts.density) {
      x += 1 + Math.floor(random() * 3);
      continue;
    }
    if (!fits(site, footprintOf(type, 0), x, z)) {
      x += 1;
      continue;
    }

    const footprint = standInRow(parts, type, { x, z }, rowTurn);
    depth = Math.max(depth, footprint.z);
    const lined = type.id === POOL_ID ? lineThePool(parts, { x, z, footprint }) : 0;
    x += footprint.x + lined + (lined > 0 || random() < 0.4 ? 1 : 0);
  }
  return depth;
}

function standInRow(parts: FillParts, type: GeneratorType, at: Tile, rowTurn: Rotation): Extent {
  const { site, random } = parts;
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

// The beach is capped as well as floored: sand that grew with a large plot would be a desert.
const SHORE_INSET = { of: 0.07, min: 5 } as const;
const SHORE_BEACH = { of: 0.14, min: 10, max: 16, wander: 3 } as const;

const HILL = {
  dune: 3,
  peak: { max: 6, min: 3 },
  shelf: { of: 0.09, min: 4, max: 11 },
  bench: { of: 0.07, min: 4, max: 9 },
  step: { of: 0.05, min: 3, max: 7 },
  resort: 24,
} as const;

// A walk holds one z while the coast drifts under it, so on a narrower bench it would step on and off.
const WALKABLE_BENCH = 5;

interface HillStep {
  readonly level: number;
  readonly surface: TerraceSurface;
  readonly depth: number;
}

interface Hill {
  readonly terraces: readonly TerraceSpec[];
  // Exact per column, because every step is anchored to the water with no wobble of its own.
  readonly inset: number;
}

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

const hillDepthOf = (steps: readonly HillStep[]): number =>
  steps.reduce((rows, step) => rows + step.depth, 0);

// Every step is anchored to the water with no wobble of its own, so steps stay exactly `depth` apart
// and never cross, and the hill still curves with the coast.
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

// The coast's wobble is subtracted rather than averaged: the hill hangs off the water and comes
// furthest inland where the sea does.
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

function elevationSpecFor(hill: Hill | null, seed: number): ElevationSpec | null {
  return hill ? { terraces: hill.terraces, seed } : null;
}

function landStartZ(shore: Shore | null, hill: Hill | null, tilesZ: number, tileX: number): number {
  if (!shore) return tilesZ;
  return waterStartZ(shore, tileX) - (hill ? hill.inset : shore.spec.beach);
}

function shoreSpecFor(params: ResortParams): ShoreSpec {
  return {
    inset: Math.max(SHORE_INSET.min, Math.round(params.tilesZ * SHORE_INSET.of)),
    beach: Math.round(clamp(params.tilesZ * SHORE_BEACH.of, SHORE_BEACH.min, SHORE_BEACH.max)),
    wave: SHORE_BEACH.wander,
    seed: params.seed,
  };
}

// The tideline and the last row against the grass stay bare on purpose: the landward row is the lane
// boardwalks come in along, and reserving it stops spurs paving the sand edge to edge.
function isBuildableSand(shore: Shore, tileX: number, tileZ: number): boolean {
  const depth = beachDepthAt(shore, tileX, tileZ);
  return depth >= 1 && depth <= shore.spec.beach - 2;
}

const LOUNGER_ID = 'sun-lounger';
const UMBRELLA_ID = 'beach-umbrella';

const LIFEGUARD_ID = 'lifeguard-tower';

// Weighted by repetition. The volleyball court and pedalo rental are held to a number per resort,
// which a weighted draw cannot do, so standBeachFeatures stands them.
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

const BEACH_LINES = { count: 3, first: 1, spacing: 2 } as const;

const BEACH_SET: readonly ('lounger' | 'umbrella' | null)[] = [
  'lounger',
  'umbrella',
  'lounger',
  null,
];

const BEACH_BAY = 5;

const BAY_COLUMNS = BEACH_SET.length * (BEACH_BAY + 1);

function beachLineDepths(shore: Shore): number[] {
  const deepest = shore.spec.beach - 2;
  return Array.from(
    { length: BEACH_LINES.count },
    (_, index) => BEACH_LINES.first + index * BEACH_LINES.spacing,
  ).filter((depth) => depth <= deepest);
}

const beachBackDepth = (shore: Shore): number =>
  (beachLineDepths(shore).at(-1) ?? 0) + BEACH_LINES.spacing;

const bayOrigin = (tilesX: number): number =>
  Math.floor((tilesX % BAY_COLUMNS) / 2) + Math.floor(BEACH_SET.length / 2);

function keptSets(density: number): number {
  const kept = 2 * Math.round((BEACH_BAY * density - 1) / 2) + 1;
  return clamp(kept, 1, BEACH_BAY);
}

// A beach club is too wide for most gaps; taking the first draw as final would leave those gaps empty.
const BEACH_DRAWS = 3;

// Order matters: features pick first, towers stand between bays, and the lines go round both so a
// set of loungers is never cut in half by a court.
function fillBeach(parts: BeachParts): void {
  standBeachFeatures(parts);
  standLifeguards(parts);
  layBeachLines(parts);
  fillBeachBack(parts);
}

// Unturned: the hut's counter and boats face +z, which on every generated plot is the water.
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

function columnsOutward(anchor: number, last: number): number[] {
  const columns: number[] = [];
  const start = clamp(anchor, 0, last);
  for (let offset = 0; offset <= last; offset++) {
    if (start + offset <= last) columns.push(start + offset);
    if (offset > 0 && start - offset >= 0) columns.push(start - offset);
  }
  return columns;
}

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

// Unturned: the tower's open side and ladder face +z, which on every generated plot is the water.
function standLifeguards(parts: BeachParts): void {
  const { shore, types, missing, site, plots } = parts;
  const tower = types.get(LIFEGUARD_ID);
  if (!tower) return;
  const gap = BEACH_BAY * BEACH_SET.length + Math.floor(BEACH_SET.length / 2);
  for (let bay = bayOrigin(site.tilesX) - BAY_COLUMNS; bay < site.tilesX; bay += BAY_COLUMNS) {
    // Walked forward rather than dropped in the middle: a sea lane may already hold that tile.
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
        // Unturned: a lounger's backrest is at its northern end, so it faces the water.
        site.taken.add(tileKey(tileX, tileZ));
        plots.push({ id: type.id, tileX, tileZ, rotation: 0 });
        missing.delete(type.id);
      }
    }
  }
}

// The ring around a cluster is claimed with it, so clusters stand clear of each other and of the lounger lines.
function fillBeachBack(parts: BeachParts): void {
  const { shore, random } = parts;
  const behind = beachBackDepth(shore);
  const back: BeachParts = {
    ...parts,
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

interface BeachParts extends Stand {
  readonly shore: Shore;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly missing: Set<string>;
  readonly density: number;
  readonly features: readonly { readonly type: GeneratorType; readonly count: number }[];
  readonly seaLanes: readonly number[];
}

// Tries every type still owed, not only the first, or every draw is spent on a beach club that never fits.
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

interface Stand {
  readonly site: Site;
  readonly random: () => number;
  readonly plots: ResortPlot[];
  // The beach passes its own band: on a wandering coast a footprint's corners lie at different depths
  // into the sand, and the tideline and back lane are reserved by depth, not by row.
  readonly standable?: (tile: Tile) => boolean;
}

function standOne(parts: Stand, type: GeneratorType, tile: Tile): boolean {
  const { site, random } = parts;
  // The unturned footprint is always the fallback, so a turn is never the reason the sand stays bare.
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

const SHELF_POOL: readonly string[] = ['palm', 'palm', 'olive', 'tikitorch', 'poolside-bar'];

// The two-tile trees are left out: the gaps between houses are mostly one tile wide.
const HILLSIDE_POOL: readonly string[] = ['palm', 'cypress', 'olive', 'blossom', 'flowerbed'];

const BENCH_LODGING = { sand: 'bungalow', grass: 'house' } as const;

const BENCH_LOT_GAP = 2;

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

interface WalkParts extends HillParts {
  readonly walks: readonly (readonly Tile[])[];
  readonly accent: GeneratorType | undefined;
  readonly accentShare: number;
  readonly allowance: (type: GeneratorType) => number;
}

function accentStride(parts: WalkParts, type: GeneratorType): number {
  if (!parts.accent || !hostsAccent(type, parts.accent) || parts.accentShare <= 0) return 0;
  return Math.max(2, Math.round(1 / parts.accentShare));
}

const hostsAccent = (type: GeneratorType, accent: GeneratorType): boolean =>
  type.tilesX * type.tilesZ < accent.tilesX * accent.tilesZ;

function benchSurfaceOf(parts: HillParts, walk: readonly Tile[]): TerraceSurface | undefined {
  const middle = walk[Math.floor(walk.length / 2)];
  if (!middle) return undefined;
  return terraceAt(parts.elevation, middle.x, middle.z)?.surface ?? 'grass';
}

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

// A bungalow faces +z, the water, so the row south of the sidewalk stands with its back to the walk.
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

// Higher densities turned the hill into a housing estate with a path paved to every house.
const HILL_DENSITY = 0.6;

interface HillParts extends Stand {
  readonly elevation: Elevation;
  readonly types: ReadonlyMap<string, GeneratorType>;
  readonly missing: Set<string>;
  readonly density: number;
}

function fillHill(parts: HillParts): void {
  const { elevation, random } = parts;
  for (const tile of raisedTilesOf(elevation)) {
    const terrace = terraceAt(elevation, tile.x, tile.z);
    if (!terrace) continue;
    if (random() > HILL_DENSITY * parts.density) continue;
    standOnHill(parts, tile, terrace.surface ?? 'grass');
  }
}

function standOnHill(parts: HillParts, tile: Tile, surface: TerraceSurface): void {
  standFromPool(parts, surface === 'sand' ? SHELF_POOL : HILLSIDE_POOL, tile);
}

function footprintTilesAt(footprint: Extent, tile: Tile): Tile[] {
  const tiles: Tile[] = [];
  for (let x = tile.x; x < tile.x + footprint.x; x++) {
    for (let z = tile.z; z < tile.z + footprint.z; z++) tiles.push({ x, z });
  }
  return tiles;
}

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

// Short, because each leg holds one z while the coast drifts under it; five tiles keeps a walk on its bench.
const WALK_SPACING = 5;

// Strung as a chain of nodes so the walk runs parallel to a coast that is not straight.
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

// Every leg bends x-first: the long x leg follows the ground and the short z jog crosses it.
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

const SWITCHBACK_REACH = 6;

const SWITCHBACK_RISE = 4;

// Either side of the promenade (0.42 to 0.58 of the width), so neither reads as its continuation.
const SWITCHBACK_COLUMNS: readonly number[] = [0.25, 0.75];

// Starts on the shelf sidewalk rather than the sand: on the beach or a one-row bench the coast drifts
// out from under a long leg.
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
    // Straddles the street it closes. The model faces +z: unturned it looks into the plot from the north
    // edge, a quarter turn from the west, three quarters from the east.
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

function plazaAt(promenade: Street, band: Street, tilesX: number, tilesZ: number) {
  const span = spanOf(promenade);
  return {
    x0: Math.max(0, span.low - 1),
    x1: Math.min(tilesX - 1, span.high + 1),
    z0: Math.max(0, band.at - 2),
    z1: Math.min(tilesZ - 1, band.at + 1),
  };
}

// Only two lanes cross the beach; running every lane to the sea paved the beach in stripes and made
// the dune a wall of staircases.
const SEA_LANES: readonly number[] = [0.3, 0.7];

// Measured off the water rather than the plot edge, so it is the same pier on every plot and stays
// inside the water the plot owns.
const PIER_TILES = 6;

function pierEndZ(shore: Shore, tilesZ: number, tileX: number): number {
  return Math.min(tilesZ - 1, waterStartZ(shore, tileX) + PIER_TILES - 1);
}

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

// overWater is asked per street because only two of the columns are piers.
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

  // Down the middle of each bench, so a walk stays on it as the coast drifts under it.
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

interface Walks {
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
  readonly benches: readonly (readonly Tile[])[];
}

function benchesOf(hill: Hill): { readonly inset: number; readonly depth: number }[] {
  return hill.terraces.map((terrace, index) => {
    const behind = hill.terraces[index + 1];
    return { inset: terrace.inset, depth: (behind ? behind.inset : hill.inset) - terrace.inset };
  });
}

const ALLOWANCE_FULL_SIZE = 200;

function allowanceOf(type: GeneratorType, params: ResortParams): number {
  const range = type.placement?.perResort;
  if (!range) return Number.POSITIVE_INFINITY;
  const size = Math.sqrt(params.tilesX * params.tilesZ);
  const grown = clamp((size - PLOT_TILES.min) / (ALLOWANCE_FULL_SIZE - PLOT_TILES.min), 0, 1);
  return Math.round(range.min + (range.max - range.min) * grown);
}

type DistrictPlan =
  | { readonly role: 'mixed'; readonly district: District }
  | { readonly role: 'park'; readonly district: District; readonly park: ParkLayout }
  | {
      readonly role: 'housing';
      readonly district: District;
      readonly type: GeneratorType;
      readonly block: HousingBlock;
      readonly shop: GeneratorType | undefined;
    };

const PARKS = { fromDistricts: 4 } as const;

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

  // A park, then a block, then a park: when room runs out the resort still gets some of each.
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

const overlaps = (a: TileRect, b: TileRect): boolean =>
  a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

const BIG_PARKS_FROM = 200;

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
  readonly accent: GeneratorType | undefined;
  readonly shops: readonly GeneratorType[];
  readonly config: ResortConfig;
  readonly seaLanes: ReadonlySet<number>;
  readonly keepMixed: readonly TileRect[];
  readonly reserved: number;
}

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

const areaOf = (district: District): number =>
  (district.x1 - district.x0 + 1) * (district.z1 - district.z0 + 1);

function budgetOf(bounded: readonly District[], reserved: number): (district: District) => boolean {
  let spare = bounded.reduce((sum, district) => sum + areaOf(district), 0) - reserved;
  return (district) => {
    if (spare < areaOf(district)) return false;
    spare -= areaOf(district);
    return true;
  };
}

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

function blockFor(
  district: District,
  parts: DistrictParts,
  turn: number,
): { type: GeneratorType; block: HousingBlock; turn: number } | null {
  const { lodging, density, accent, config } = parts;
  for (let tried = 0; tried < lodging.length; tried++) {
    const type = lodging[(turn + tried) % lodging.length]!;
    // Villas only go among smaller houses: a lone villa between a snack bar and a spa is what blocks prevent.
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

const SHOP_IDS: readonly string[] = ['bakery', 'coffee-shop', 'resort-bar', 'snack-bar'];

// A type plus the free row and column around it, with slack for rows a district cannot pack.
const CATALOGUE_ROOM = 1.6;

function catalogueRoomOf(types: readonly GeneratorType[]): number {
  return (
    CATALOGUE_ROOM * types.reduce((sum, type) => sum + (type.tilesX + 1) * (type.tilesZ + 1), 0)
  );
}

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

interface HousingParts {
  readonly site: Site;
  readonly plots: ResortPlot[];
  readonly missing: Set<string>;
  readonly allowance: (type: GeneratorType) => number;
  readonly accent: GeneratorType | undefined;
}

function standHousing(plan: Extract<DistrictPlan, { role: 'housing' }>, parts: HousingParts): void {
  for (const lot of plan.block.lots) {
    const wanted =
      lot.role === 'shop' ? plan.shop : lot.role === 'accent' ? allowedAccent(parts) : undefined;
    for (const type of wanted ? [wanted, plan.type] : [plan.type]) {
      if (standInLot(parts, type, lot)) break;
    }
  }
}

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

const PARK_TREES: readonly string[] = ['blossom', 'olive', 'cypress', 'palm'];

// Stood before the streets are marked: a plaza is paving, and its fountain and beds stand on it.
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

const PARK_BED_ID = 'flowerbed';

const TABLE_ID = 'picnic-table';

export function generateResort(types: readonly GeneratorType[], asked: ResortParams): ResortPlan {
  const params = clampParams(asked);
  const config = clampConfig(params.config);
  const random = createRandom(params.seed);
  const catalogue = catalogueOf(types);
  const land = landOf(params);
  const town = townOf(params, land, random);
  const gate = catalogue.byId.get(GATE_ID);
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

interface Catalogue {
  readonly buildable: readonly GeneratorType[];
  readonly byId: ReadonlyMap<string, GeneratorType>;
  readonly bySize: readonly GeneratorType[];
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
    // Largest first so a tennis court gets its pick while a district can still take it. Beach types and
    // the gate never stand in a district.
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
  // The hill comes before the streets: it is anchored to the water, and the street grid needs to know where it ends.
  const hill = shore ? hillFor(params, shoreSpec) : null;
  return {
    shoreSpec,
    shore,
    hill,
    // Absent rather than flat, as exactOptionalPropertyTypes requires of an optional field.
    terraces: elevationSpecFor(hill, params.seed),
    hillFoot: hillFootOf(shore, hill, tilesX, tilesZ),
  };
}

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
  const between = bands.slice(1, -1);
  const gateBand = between[Math.floor(between.length / 2)] ?? bands[0]!;
  return {
    columns,
    bands,
    promenade,
    gateBand,
    plaza: plazaAt(promenade, gateBand, tilesX, tilesZ),
    seaLanes: seaLanesOf(columns, promenade, tilesX),
  };
}

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

const SIGN_ID = 'sign-post';

const AVENUE_TREES: readonly string[] = ['palm', 'cypress'];

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
  // Water is claimed first so nothing below has to check for it.
  for (const tile of waterTilesOf(land.shore)) site.taken.add(tileKey(tile.x, tile.z));
  for (const pond of skeleton.terrain ?? []) site.taken.add(tileKey(pond.tileX, pond.tileZ));
  const streets = streetTiles(skeleton);

  // Landmarks are stood before the streets are marked because they sit on the paving.
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

// Filled before the districts so bungalows and loungers end up here rather than in whichever district
// came first, and no district spills onto ground a row grid does not fit.
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

// Blocks first, so a mixed district knows which lodging they already stood.
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

function streetGridOf(parts: {
  readonly columns: readonly Street[];
  readonly bands: readonly Street[];
  readonly gateBand: Street;
  readonly seaLanes: ReadonlySet<number>;
  readonly shore: Shore | null;
  readonly hillFoot: number;
  readonly tilesX: number;
  readonly tilesZ: number;
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

function accentOf(types: readonly GeneratorType[]): GeneratorType | undefined {
  return types.find(
    (type) => type.category === 'lodging' && !type.placement?.ground && type.placement?.perResort,
  );
}

function parkPlazasOf(plans: readonly DistrictPlan[]): Plaza[] {
  return plans.flatMap((plan) =>
    plan.role === 'park' && plan.park.plaza ? [plan.park.plaza] : [],
  );
}

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
  // Carved against the plan's own ground so the river follows the hill's levels.
  const river = riverEditsFor({
    shore: shoreFor(plan),
    elevation: elevationFor(plan),
    tilesX: params.tilesX,
    tilesZ: params.tilesZ,
    seed: params.seed,
  });
  return river.length > 0 ? { ...plan, terrain: river } : plan;
}
