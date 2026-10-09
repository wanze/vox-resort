import type { Placement } from '../../layout/domain/resortLayout';
import { SUNSET_TIME, skyStateFor } from '../../lighting/domain/dayNight';
import { outlookFor, type OutlookParts } from './outlook';
import { SCENERY_REACH, type SceneryField } from './scenery';
import { TICKS_PER_DAY } from './simClock';
import { isNamed, type Venue } from './venues';
import type { Weather } from './weather';

// The water close by, a pond or the sea under a pier; the sea across the sand is outlook.ts's.
export const VIEW_REACH = 6;

// Below 1, so a garden alone barely reaches the bar for a photo; with the sea it clears it.
const SCENERY_SHARE = 0.7;

// A sea view reads 0.6 by day: just over PHOTO_FROM, so the promenade is photographed now and
// then, and the golden hour lifts it to a sure thing.
const SEA_SHARE = 0.6;

// A bare hilltop reaches the bar for a photo; a dressed one, or one above the sea, clears it.
const HEIGHT_SHARE = 0.5;

// A sight in view counts beside the scenery it spreads, which saturates: a plaza around a fountain
// scored no better than a bare sea view, and was hardly ever photographed.
const SIGHT_SHARE = 0.3;

// A pond, a canal or a river close by; the sea is counted on its own, across the sand.
const POND_SHARE = 0.4;

// Tiles of inland water within VIEW_REACH for the full share: two short canals by a bridge.
const POND_FULL = 12;

// A fountain, a statue or a bed of flowers is a sight; a hedge or a plain tree (0.3, 0.4) dresses
// a tile, but nobody photographs it.
const SIGHT_FROM = 0.5;

// A show is seen from the next street, not across the resort.
const SHOW_REACH = 6;

const GOLDEN_SHARE = 0.5;

const SHOW_SHARE = 0.5;

const FIREWORKS_SHARE = 0.8;

// The hour the first walkers are out; before it only a show or the fireworks are worth a picture.
const DAYLIGHT_FROM = 7 / 24;

const GOLDEN_SPAN = 1.5 / 24;

// Wide enough that the pier and the far beach are two spots, small enough that a stretch of
// promenade is one.
const SPOT_CELL = 8;

// A spot is named after a named venue this close, so the day report tells two stretches of sea
// apart; further away it is just the sea.
const NAMED_REACH = 12;

// Facing the sun half an hour before it sets, when the golden hour is at its best.
const SUNSET_HEADING = (() => {
  const sun = skyStateFor(SUNSET_TIME - 1 / 48).sunDirection;
  return Math.atan2(sun.x, sun.z);
})();

export interface Sight {
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
}

type ViewVenue = Pick<
  Venue,
  | 'key'
  | 'label'
  | 'kind'
  | 'x'
  | 'z'
  | 'tileX'
  | 'tileZ'
  | 'tilesX'
  | 'tilesZ'
  | 'stage'
  | 'hearth'
>;

export interface Views {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly base: Float32Array;
  // The share of water within VIEW_REACH.
  readonly water: Float32Array;
  // How much sea is in view, close by or across open ground.
  readonly sea: Float32Array;
  // Towards the nearest water, or else along the clearest line to the sea; NaN with neither.
  readonly seaHeading: Float32Array;
  // How far the tile stands above the ground around it.
  readonly overlook: Float32Array;
  // Down the slope, NaN on the flat.
  readonly downhill: Float32Array;
  // An index into sights, -1 for none.
  readonly sight: Int32Array;
  // That sight's strength, less with distance as the scenery spreads it; 0 for none.
  readonly sightScore: Float32Array;
  // The share of POND_FULL tiles of water within VIEW_REACH that is not the sea.
  readonly pond: Float32Array;
  // A venue index of a stage or hearth within SHOW_REACH, -1 for none.
  readonly stage: Int32Array;
  readonly sights: readonly Sight[];
}

export interface Moment {
  readonly wet: boolean;
  readonly daylight: boolean;
  readonly golden: number;
  readonly fireworks: boolean;
}

export const PHOTO_KINDS = [
  'sight',
  'sea',
  'sunset',
  'show',
  'fireworks',
  'view',
  'water',
] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

export interface PhotoSubject {
  readonly kind: PhotoKind;
  readonly key: string;
  readonly label: string;
  // A sight or a stage is faced; a view is looked out over, so it has no point.
  readonly at: { readonly x: number; readonly z: number } | null;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const gapTo = (tile: number, start: number, size: number): number =>
  tile < start ? start - tile : tile >= start + size ? tile - (start + size - 1) : 0;

type Footprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ'>;

// In whole tiles, as scenery.ts measures its reach: 0 on the footprint itself.
export const tilesFrom = (footprint: Footprint, tileX: number, tileZ: number): number =>
  Math.max(
    gapTo(tileX, footprint.tileX, footprint.tilesX),
    gapTo(tileZ, footprint.tileZ, footprint.tilesZ),
  );

interface WaterGrid {
  readonly water: Uint8Array;
  // One wider than the padded plot on each axis, so a box sum needs no edge case.
  readonly sums: Int32Array;
  readonly width: number;
}

const WET = { sea: 1, pond: 2 } as const;

// The terrain asked once a tile over the padded plot, as all three water grids read it.
function waterKindsOf(tilesX: number, tilesZ: number, parts: Pick<ViewParts, 'isWater' | 'isSea'>) {
  const width = tilesX + 2 * VIEW_REACH;
  const kinds = new Uint8Array(width * (tilesZ + 2 * VIEW_REACH));
  for (let z = 0; z < tilesZ + 2 * VIEW_REACH; z++) {
    for (let x = 0; x < width; x++) {
      const tileX = x - VIEW_REACH;
      const tileZ = z - VIEW_REACH;
      if (!parts.isWater(tileX, tileZ)) continue;
      kinds[z * width + x] = parts.isSea(tileX, tileZ) ? WET.sea : WET.pond;
    }
  }
  return (mask: number) => (tileX: number, tileZ: number) =>
    (kinds[(tileZ + VIEW_REACH) * width + tileX + VIEW_REACH]! & mask) !== 0;
}

// Over the plot and a VIEW_REACH margin, which the terrain answers as sea or apron.
function waterGridOf(
  tilesX: number,
  tilesZ: number,
  isWater: (tileX: number, tileZ: number) => boolean,
): WaterGrid {
  const width = tilesX + 2 * VIEW_REACH;
  const depth = tilesZ + 2 * VIEW_REACH;
  const water = new Uint8Array(width * depth);
  const sums = new Int32Array((width + 1) * (depth + 1));
  for (let z = 0; z < depth; z++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const wet = isWater(x - VIEW_REACH, z - VIEW_REACH) ? 1 : 0;
      water[z * width + x] = wet;
      row += wet;
      sums[(z + 1) * (width + 1) + x + 1] = sums[z * (width + 1) + x + 1]! + row;
    }
  }
  return { water, sums, width };
}

// Against the half of the square beyond a straight shore, so the shore itself reads 1.
const SHORE_FULL = (2 * VIEW_REACH + 1) * VIEW_REACH;

function waterShares(tilesX: number, tilesZ: number, grid: WaterGrid, full: number): Float32Array {
  const sea = new Float32Array(tilesX * tilesZ);
  const side = 2 * VIEW_REACH + 1;
  const stride = grid.width + 1;
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      // Padded, the square around (x, z) starts at (x, z) itself.
      const count =
        grid.sums[(z + side) * stride + x + side]! -
        grid.sums[z * stride + x + side]! -
        grid.sums[(z + side) * stride + x]! +
        grid.sums[z * stride + x]!;
      sea[z * tilesX + x] = Math.min(1, count / full);
    }
  }
  return sea;
}

// The nearer ring first, then the straighter within it, or a shore dead ahead would be
// photographed at an angle. The tile itself is skipped: a bridge stands on water.
const remoteness = (dx: number, dz: number): number =>
  dx === 0 && dz === 0
    ? Number.POSITIVE_INFINITY
    : Math.max(Math.abs(dx), Math.abs(dz)) * 4 * VIEW_REACH * VIEW_REACH + dx * dx + dz * dz;

function nearestWaterHeading(grid: WaterGrid, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  let heading = Number.NaN;
  for (let dz = -VIEW_REACH; dz <= VIEW_REACH; dz++) {
    const row = (z + VIEW_REACH + dz) * grid.width + x + VIEW_REACH;
    for (let dx = -VIEW_REACH; dx <= VIEW_REACH; dx++) {
      const far = remoteness(dx, dz);
      if (far >= best || grid.water[row + dx] !== 1) continue;
      best = far;
      heading = Math.atan2(dx, dz);
    }
  }
  return heading;
}

// The water close by is faced first: a guest on a pier photographs the sea under it.
function seaHeadings(
  tilesX: number,
  tilesZ: number,
  water: Float32Array,
  grid: WaterGrid,
  across: Float32Array,
): Float32Array {
  const heading = across.slice();
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      if (water[z * tilesX + x]! > 0) heading[z * tilesX + x] = nearestWaterHeading(grid, x, z);
    }
  }
  return heading;
}

// Scored as scenery.ts spreads an item, so the sight is what adds most to the tile's scenery.
function sightsOf(
  tilesX: number,
  tilesZ: number,
  placements: readonly Placement[],
  strengthOf: (id: string) => number,
  labelOf: (id: string) => string,
) {
  const sight = new Int32Array(tilesX * tilesZ).fill(-1);
  const best = new Float32Array(tilesX * tilesZ);
  const sights: Sight[] = [];
  for (const placement of placements) {
    const strength = strengthOf(placement.id);
    if (strength < SIGHT_FROM) continue;
    const index = sights.length;
    sights.push({
      key: placement.key,
      label: labelOf(placement.id),
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
    });
    const { tileX, tileZ } = placement;
    for (
      let z = Math.max(0, tileZ - SCENERY_REACH);
      z <= tileZ + placement.tilesZ - 1 + SCENERY_REACH && z < tilesZ;
      z++
    ) {
      const dz = gapTo(z, tileZ, placement.tilesZ);
      for (
        let x = Math.max(0, tileX - SCENERY_REACH);
        x <= tileX + placement.tilesX - 1 + SCENERY_REACH && x < tilesX;
        x++
      ) {
        const distance = Math.max(dz, gapTo(x, tileX, placement.tilesX));
        const score = strength * (1 - distance / (SCENERY_REACH + 1));
        const tile = z * tilesX + x;
        if (score <= best[tile]!) continue;
        best[tile] = score;
        sight[tile] = index;
      }
    }
  }
  return { sight, sightScore: best, sights };
}

function stagesNear(tilesX: number, tilesZ: number, venues: readonly ViewVenue[]): Int32Array {
  const stage = new Int32Array(tilesX * tilesZ).fill(-1);
  const nearest = new Int32Array(tilesX * tilesZ).fill(SHOW_REACH + 1);
  venues.forEach((venue, index) => {
    if (venue.stage !== true && venue.hearth !== true) return;
    const { tileX, tileZ } = venue;
    for (
      let z = Math.max(0, tileZ - SHOW_REACH);
      z <= tileZ + venue.tilesZ - 1 + SHOW_REACH && z < tilesZ;
      z++
    ) {
      const dz = gapTo(z, tileZ, venue.tilesZ);
      for (
        let x = Math.max(0, tileX - SHOW_REACH);
        x <= tileX + venue.tilesX - 1 + SHOW_REACH && x < tilesX;
        x++
      ) {
        const distance = Math.max(dz, gapTo(x, tileX, venue.tilesX));
        const tile = z * tilesX + x;
        if (distance >= nearest[tile]!) continue;
        nearest[tile] = distance;
        stage[tile] = index;
      }
    }
  });
  return stage;
}

export interface ViewParts extends OutlookParts {
  readonly scenery: SceneryField;
  // Everything that can be a sight, paving included; `standing` is what blocks a view.
  readonly placements: readonly Placement[];
  readonly strengthOf: (id: string) => number;
  readonly labelOf: (id: string) => string;
  readonly isWater: (tileX: number, tileZ: number) => boolean;
  readonly venues: readonly ViewVenue[];
}

// Once per edit, beside the scenery field: nothing per tick scans the plot.
export function viewsFor(parts: ViewParts): Views {
  const { tilesX, tilesZ, scenery } = parts;
  const wetAt = waterKindsOf(tilesX, tilesZ, parts);
  const grid = waterGridOf(tilesX, tilesZ, wetAt(WET.sea | WET.pond));
  const water = waterShares(tilesX, tilesZ, grid, SHORE_FULL);
  const seaWater = waterShares(
    tilesX,
    tilesZ,
    waterGridOf(tilesX, tilesZ, wetAt(WET.sea)),
    SHORE_FULL,
  );
  const pond = waterShares(tilesX, tilesZ, waterGridOf(tilesX, tilesZ, wetAt(WET.pond)), POND_FULL);
  const outlook = outlookFor(parts);
  const sights = sightsOf(tilesX, tilesZ, parts.placements, parts.strengthOf, parts.labelOf);
  const sea = new Float32Array(tilesX * tilesZ);
  const base = new Float32Array(tilesX * tilesZ);
  for (let tile = 0; tile < base.length; tile++) {
    sea[tile] = Math.max(seaWater[tile]!, outlook.horizon[tile]!);
    base[tile] = clamp01(
      SCENERY_SHARE * scenery.value[tile]! +
        SEA_SHARE * sea[tile]! +
        HEIGHT_SHARE * outlook.overlook[tile]! +
        SIGHT_SHARE * sights.sightScore[tile]! +
        POND_SHARE * pond[tile]!,
    );
  }
  return {
    tilesX,
    tilesZ,
    base,
    water,
    sea,
    pond,
    seaHeading: seaHeadings(tilesX, tilesZ, water, grid, outlook.horizonHeading),
    overlook: outlook.overlook,
    downhill: outlook.downhill,
    ...sights,
    stage: stagesNear(tilesX, tilesZ, parts.venues),
  };
}

export function momentAt(tickOfDay: number, weather: Weather, fireworks: boolean): Moment {
  const time = tickOfDay / TICKS_PER_DAY;
  const wet = weather === 'rain' || weather === 'storm';
  const goldenFrom = SUNSET_TIME - GOLDEN_SPAN;
  const golden =
    !wet && time >= goldenFrom && time < SUNSET_TIME ? (time - goldenFrom) / GOLDEN_SPAN : 0;
  return { wet, daylight: time >= DAYLIGHT_FROM && time < SUNSET_TIME, golden, fireworks };
}

// The negatives, litter and breakdowns, are the caller's: they live outside this module.
export function scenicAt(
  views: Views,
  tile: number,
  moment: Moment,
  showing: (venue: number) => boolean,
): number {
  if (moment.wet) return 0;
  const sea = views.sea[tile]!;
  const stage = views.stage[tile]!;
  let value = GOLDEN_SHARE * moment.golden * sea;
  if (moment.daylight) value += views.base[tile]!;
  if (stage >= 0 && showing(stage)) value += SHOW_SHARE;
  if (moment.fireworks) value += FIREWORKS_SHARE * sea;
  return clamp01(value);
}

// From the middle of the cell, so every photo of one spot gets the same name.
function nearestNamed(venues: readonly ViewVenue[], cellX: number, cellZ: number) {
  const tileX = cellX * SPOT_CELL + SPOT_CELL / 2;
  const tileZ = cellZ * SPOT_CELL + SPOT_CELL / 2;
  let nearest: ViewVenue | null = null;
  let nearestTiles = NAMED_REACH + 1;
  for (const venue of venues) {
    const tiles = tilesFrom(venue, tileX, tileZ);
    if (tiles >= nearestTiles || !isNamed(venue)) continue;
    nearest = venue;
    nearestTiles = tiles;
  }
  return nearest;
}

function viewOf(
  views: Views,
  tile: number,
  venues: readonly ViewVenue[],
  kind: 'sea' | 'sunset' | 'fireworks' | 'view' | 'water',
  label: string,
): PhotoSubject {
  const cellX = Math.floor((tile % views.tilesX) / SPOT_CELL);
  const cellZ = Math.floor(Math.floor(tile / views.tilesX) / SPOT_CELL);
  const near = kind === 'fireworks' ? null : nearestNamed(venues, cellX, cellZ);
  const named = near ? `${label} by ${near.label}` : label;
  return { kind, key: `${kind}@${cellX},${cellZ}`, label: named, at: null };
}

// The most striking thing in view goes first: the fireworks, a show, the sunset, a sight. The
// venues are the resort's own, so a renamed one is named as it is now.
export function subjectAt(
  views: Views,
  tile: number,
  moment: Moment,
  showing: (venue: number) => boolean,
  venues: readonly ViewVenue[],
): PhotoSubject {
  const sea = views.sea[tile]!;
  if (moment.fireworks && sea > 0) return viewOf(views, tile, venues, 'fireworks', 'Fireworks');
  const stage = views.stage[tile]!;
  const venue = venues[stage];
  if (venue && showing(stage)) {
    return { kind: 'show', key: venue.key, label: `Show at ${venue.label}`, at: venue };
  }
  if (moment.golden > 0 && sea >= 0.5) return viewOf(views, tile, venues, 'sunset', 'Sunset');
  const sight = views.sights[views.sight[tile]!];
  if (sight) return { kind: 'sight', key: sight.key, label: sight.label, at: sight };
  if (sea > 0) return viewOf(views, tile, venues, 'sea', 'Sea');
  if (views.pond[tile]! > 0) return viewOf(views, tile, venues, 'water', 'Water');
  return viewOf(views, tile, venues, 'view', 'View');
}

// From a body at (x, z) in voxels on the tile; a view with nothing to face keeps `fallback`.
export function headingFor(
  views: Views,
  subject: PhotoSubject,
  tile: number,
  x: number,
  z: number,
  fallback: number,
): number {
  if (subject.at) return Math.atan2(subject.at.x - x, subject.at.z - z);
  if (subject.kind === 'sunset') return SUNSET_HEADING;
  // seaHeading faces the nearest water of any kind, so a pond as well as the sea.
  const facing = subject.kind === 'view' ? views.downhill[tile]! : views.seaHeading[tile]!;
  return Number.isNaN(facing) ? fallback : facing;
}
