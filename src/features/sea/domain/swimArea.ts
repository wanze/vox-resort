import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';

const SWIM_TILES = 3;

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

export interface Mooring {
  readonly x: number;
  readonly z: number;
}

export interface Rental {
  readonly x: number;
  readonly z: number;
}

// Shared by the buoy gap and the craft limit so both agree on where the corridor is.
const offRental = (rental: Rental | null, x: number): number =>
  rental ? Math.abs(x - rental.x) / TILE_VOXELS : Infinity;

function clearanceAt(rental: Rental | null, x: number): number {
  const open = SWIM_TILES + KEEP_CLEAR_TILES;
  const off = offRental(rental, x);
  if (off <= CORRIDOR_TILES) return LANDING_TILES;
  if (off >= CORRIDOR_TILES + CORRIDOR_FLARE) return open;
  return LANDING_TILES + ((open - LANDING_TILES) * (off - CORRIDOR_TILES)) / CORRIDOR_FLARE;
}

export interface SwimAreaOptions {
  readonly shore: Shore | null;
  readonly rental?: Rental | null;
  // The pier lanes run straight through the buoy line.
  readonly claimed?: (tileX: number, tileZ: number) => boolean;
}

export function swimAreaMoorings(options: SwimAreaOptions): Mooring[] {
  const { shore, claimed } = options;
  const rental = options.rental ?? null;
  if (!shore) return [];

  const moorings: Mooring[] = [];
  for (let tileX = Math.floor(BUOY_TILES / 2); tileX < shore.tilesX; tileX += BUOY_TILES) {
    const tileZ = waterStartZ(shore, tileX) + SWIM_TILES;
    // The camera never frames past the plot's south edge, so a buoy there goes unseen.
    if (tileZ >= shore.tilesZ) continue;
    if (offRental(rental, (tileX + 0.5) * TILE_VOXELS) <= CORRIDOR_TILES) continue;
    if (claimed?.(tileX, tileZ)) continue;
    moorings.push({ x: (tileX + 0.5) * TILE_VOXELS, z: (tileZ + 0.5) * TILE_VOXELS });
  }
  return moorings;
}

// The limit follows the coast as a curve: stepping a tile per column would turn boats
// sharply in open water.
export interface SailingGround {
  readonly westX: number;
  readonly eastX: number;
  readonly seawardZ: number;
  landwardZ(x: number): number;
}

export function sailingGroundFor(shore: Shore, rental: Rental | null = null): SailingGround {
  return {
    westX: 0,
    eastX: shore.tilesX * TILE_VOXELS,
    seawardZ: (shore.tilesZ + OFFING_TILES) * TILE_VOXELS,
    landwardZ: (x) => (waterEdgeZ(shore, x / TILE_VOXELS) + clearanceAt(rental, x)) * TILE_VOXELS,
  };
}
