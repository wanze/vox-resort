import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { TileSpan } from '../../land/domain/landRights';
import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';

export const SWIM_TILES = 5;

// A shallow bay pulls the line in to the plot's last row rather than losing it, but never nearer.
const SWIM_TILES_MIN = 3;

const BUOY_TILES = 4;

// Two tiles, not one: moorings sit mid-tile on the rounded coast while the craft limit is
// taken off the curve at continuous x, so one tile of clearance could round to none.
const KEEP_CLEAR_TILES = 2;

// Flared so the limit ramps rather than steps: a step would turn a craft that drifted out
// of the corridor hard.
const CORRIDOR_TILES = 2;
const CORRIDOR_FLARE = 2;

const LANDING_TILES = 1;

const OFFING_TILES = 6;

// Craft nobody hired keep well out past the buoys, so the bay reads as open sea and not a harbour.
const OPEN_WATER = { pastBuoys: 6, offing: 14, band: 6 } as const;

export interface Mooring {
  readonly x: number;
  readonly z: number;
}

export interface Rental {
  readonly x: number;
  readonly z: number;
}

// Shared by the buoy gap and the craft limit so both agree on where the corridors are. The
// nearest hut's, so each hut cuts its own.
function offRental(rentals: readonly Rental[], x: number): number {
  let off = Infinity;
  for (const rental of rentals) off = Math.min(off, Math.abs(x - rental.x) / TILE_VOXELS);
  return off;
}

// Unrounded, as the craft limit is a curve; the buoys take the same reach off the rounded edge.
function swimReachAt(shore: Shore, tileX: number): number {
  const reach = shore.tilesZ - 1 - waterEdgeZ(shore, tileX);
  return Math.min(SWIM_TILES, Math.max(SWIM_TILES_MIN, reach));
}

function buoyRowAt(shore: Shore, tileX: number): number {
  const water = waterStartZ(shore, tileX);
  return water + Math.min(SWIM_TILES, Math.max(SWIM_TILES_MIN, shore.tilesZ - 1 - water));
}

function clearanceAt(shore: Shore, rentals: readonly Rental[], x: number): number {
  const open = swimReachAt(shore, x / TILE_VOXELS) + KEEP_CLEAR_TILES;
  const off = offRental(rentals, x);
  if (off <= CORRIDOR_TILES) return LANDING_TILES;
  if (off >= CORRIDOR_TILES + CORRIDOR_FLARE) return open;
  return LANDING_TILES + ((open - LANDING_TILES) * (off - CORRIDOR_TILES)) / CORRIDOR_FLARE;
}

export interface SwimAreaOptions {
  readonly shore: Shore | null;
  readonly rentals?: readonly Rental[];
  // The pier lanes run straight through the buoy line.
  readonly claimed?: (tileX: number, tileZ: number) => boolean;
  // The columns of land owned; the whole coast when left out.
  readonly span?: TileSpan;
}

const spanOf = (options: SwimAreaOptions, shore: Shore): TileSpan =>
  options.span ?? { from: 0, to: shore.tilesX };

// On the same phase whatever the span, so buying land adds buoys rather than moving them.
const firstBuoyFrom = (from: number): number =>
  from + ((((Math.floor(BUOY_TILES / 2) - from) % BUOY_TILES) + BUOY_TILES) % BUOY_TILES);

export function swimAreaMoorings(options: SwimAreaOptions): Mooring[] {
  const { shore, claimed } = options;
  const rentals = options.rentals ?? [];
  if (!shore) return [];

  const moorings: Mooring[] = [];
  const span = spanOf(options, shore);
  for (let tileX = firstBuoyFrom(span.from); tileX < span.to; tileX += BUOY_TILES) {
    const tileZ = buoyRowAt(shore, tileX);
    // The camera never frames past the plot's south edge, so a buoy there goes unseen.
    if (tileZ >= shore.tilesZ) continue;
    if (offRental(rentals, (tileX + 0.5) * TILE_VOXELS) <= CORRIDOR_TILES) continue;
    if (claimed?.(tileX, tileZ)) continue;
    moorings.push({ x: (tileX + 0.5) * TILE_VOXELS, z: (tileZ + 0.5) * TILE_VOXELS });
  }
  return moorings;
}

// Where a guest may swim: inside the buoy line and clear of every hire corridor, flare and all,
// since craft are let in short of the buoys there. Off the tile-rounded edge, where the sand stops.
export function swimmableAt(
  options: SwimAreaOptions,
  x: number,
): { readonly fromZ: number; readonly toZ: number } | null {
  const { shore } = options;
  if (!shore) return null;
  const span = spanOf(options, shore);
  if (x < span.from * TILE_VOXELS || x >= span.to * TILE_VOXELS) return null;
  if (offRental(options.rentals ?? [], x) < CORRIDOR_TILES + CORRIDOR_FLARE) return null;
  const tileX = Math.floor(x / TILE_VOXELS);
  const water = waterStartZ(shore, tileX);
  if (water >= shore.tilesZ) return null;
  // One tile short of the buoys, which are moored mid-tile.
  return { fromZ: water * TILE_VOXELS, toZ: (buoyRowAt(shore, tileX) - 0.5) * TILE_VOXELS };
}

// The limit follows the coast as a curve: stepping a tile per column would turn boats
// sharply in open water.
export interface SailingGround {
  readonly westX: number;
  readonly eastX: number;
  readonly seawardZ: number;
  landwardZ(x: number): number;
  // Where craft nobody hired drift; left out, they share the hire boats' water.
  readonly drifting?: SailingGround;
}

export function sailingGroundFor(shore: Shore, rentals: readonly Rental[] = []): SailingGround {
  return {
    westX: 0,
    eastX: shore.tilesX * TILE_VOXELS,
    seawardZ: (shore.tilesZ + OFFING_TILES) * TILE_VOXELS,
    landwardZ: (x) =>
      (waterEdgeZ(shore, x / TILE_VOXELS) + clearanceAt(shore, rentals, x)) * TILE_VOXELS,
    drifting: openWaterFor(shore),
  };
}

// Pushed further out where the coast comes furthest out, so the band never closes.
function openWaterFor(shore: Shore): SailingGround {
  const off = SWIM_TILES + OPEN_WATER.pastBuoys;
  let furthest = -Infinity;
  for (let tileX = 0; tileX <= shore.tilesX; tileX++) {
    furthest = Math.max(furthest, waterEdgeZ(shore, tileX));
  }
  const seaward = Math.max(shore.tilesZ + OPEN_WATER.offing, furthest + off + OPEN_WATER.band);
  return {
    westX: 0,
    eastX: shore.tilesX * TILE_VOXELS,
    seawardZ: seaward * TILE_VOXELS,
    landwardZ: (x) => (waterEdgeZ(shore, x / TILE_VOXELS) + off) * TILE_VOXELS,
  };
}
