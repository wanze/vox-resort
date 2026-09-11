/**
 * Where the swimming stops and the boating starts.
 *
 * A bay with a beach on it has two uses at once, and a resort keeps them apart
 * with a line of buoys: swimmers inside it, craft outside it. That line is the
 * whole of this module, and everything else here follows from it — the moorings
 * the buoys are strung on, and the water the boats are then allowed into, which
 * is defined as *the rest of the bay*.
 *
 * The line is described the way the coast is, per tile **column** and as a depth
 * out from the water's edge, which is what makes it follow the bay: a fixed
 * distance out from a wandering shore wanders with it, exactly as the beach's
 * lines of loungers and the hill's terraces do. See `layout/domain/shoreline.ts`.
 *
 * Nothing here is placed on a tile, and nothing here is a `Placement`: the
 * layout refuses anything standing in the sea, which is the right rule for the
 * things that stand on ground. A buoy floats. See `features/sea/`.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';

/**
 * Tiles out from the tideline the buoys are moored.
 *
 * Twelve metres of water, which is about where a bathing area is actually
 * marked: far enough out that the line is not in the wading depth people stand
 * about in, close enough in that it reads as belonging to the beach behind it
 * rather than as a row of marks in the middle distance.
 */
const SWIM_TILES = 3;

/**
 * Tiles of shore between one buoy and the next.
 *
 * Sixteen metres apart, which is what a real bathing area is roped at and — the
 * reason the number is here rather than drawn from the plot's density — what
 * keeps the line reading as a line. Scattered, buoys stop meaning anything: the
 * point of the thing is that you can see where the next one is.
 */
const BUOY_TILES = 4;

/**
 * Tiles of clear water the craft keep outside the buoys.
 *
 * The line means something because of this number: a boat that sailed up to the
 * buoys would be a boat among the swimmers as far as anybody watching is
 * concerned, and a bay whose boats stay a clear eight metres outside the marks
 * is a bay where the marks are being obeyed.
 *
 * Two tiles rather than one, and the extra one is not taste. A mooring is placed
 * in the middle of a whole tile at the *rounded* coast, and the limit below is
 * taken off the coast as a curve at the craft's own continuous x — so the two
 * are measured half a tile apart on both axes, and a single tile of clearance
 * came out as none at all wherever the rounding went the wrong way.
 */
const KEEP_CLEAR_TILES = 2;

/**
 * Tiles either side of the hire hut that the swimming area is cut back for, and
 * the tiles the cut is flared out over.
 *
 * The rental's boats have to get to the beach and back, and a bathing area
 * strung unbroken across the bay would have them crossing it every trip. So the
 * line has a **gap in front of the hut**: no buoys in those columns, and the
 * craft allowed right in to the shallows there. It is what a hire beach actually
 * does, and it is what makes the rest of the line mean something — the marks are
 * obeyed everywhere they exist.
 *
 * Twenty metres of corridor, which is the hut and a tile either side of it, and
 * eight metres of flare so the limit ramps rather than steps. A step would put a
 * craft that drifted sideways out of the corridor instantly inside the limit and
 * turn it hard; a ramp walks it back out.
 */
const CORRIDOR_TILES = 2;
const CORRIDOR_FLARE = 2;

/** Tiles off the tideline a craft may come in to, inside the corridor. */
const LANDING_TILES = 1;

/** How far past the plot's own south edge the craft carry on, in tiles. */
const OFFING_TILES = 6;

/** Where one buoy is moored, in voxels. */
export interface Mooring {
  readonly x: number;
  readonly z: number;
}

/** Where the hire hut stands, in voxels; the corridor is cut in front of it. */
export interface Rental {
  readonly x: number;
  readonly z: number;
}

/**
 * Tiles from the hire hut's own column, or `Infinity` on a bay with no rental.
 *
 * One helper because two things read the corridor and must agree about where it
 * is: the line of buoys leaves a gap in it, and the craft are allowed into it.
 */
const offRental = (rental: Rental | null, x: number): number =>
  rental ? Math.abs(x - rental.x) / TILE_VOXELS : Infinity;

/**
 * Tiles of water the craft are kept off the tideline at a point: the full
 * bathing area out in the bay, the landing inside the corridor, and a straight
 * ramp between the two.
 */
function clearanceAt(rental: Rental | null, x: number): number {
  const open = SWIM_TILES + KEEP_CLEAR_TILES;
  const off = offRental(rental, x);
  if (off <= CORRIDOR_TILES) return LANDING_TILES;
  if (off >= CORRIDOR_TILES + CORRIDOR_FLARE) return open;
  return LANDING_TILES + ((open - LANDING_TILES) * (off - CORRIDOR_TILES)) / CORRIDOR_FLARE;
}

export interface SwimAreaOptions {
  /** The coast. A plot with no sea is a plot with nothing to mark. */
  readonly shore: Shore | null;
  /**
   * The hire hut, if the bay has one. Its columns get no buoys: see
   * {@link CORRIDOR_TILES}.
   */
  readonly rental?: Rental | null;
  /**
   * Tiles something already stands on, so a buoy is never moored in a pier.
   *
   * The sea lanes run six tiles of jetty out from the tideline — see
   * `PIER_TILES` in `resortGenerator.ts` — which is straight through the line
   * this strings. A buoy in the middle of the decking would be a buoy nobody
   * moored, so the line stops for a paved tile and carries on, exactly as the
   * beach's lines of loungers do where a lane crosses the sand.
   */
  readonly claimed?: (tileX: number, tileZ: number) => boolean;
}

/**
 * The buoys marking the swimming area, west to east.
 *
 * One every {@link BUOY_TILES} columns, moored in the middle of its tile at
 * {@link SWIM_TILES} out from that column's own tideline. A plot with no shore
 * gets none at all, which is a resort with no sea rather than a mistake — the
 * field then draws nothing.
 */
export function swimAreaMoorings(options: SwimAreaOptions): Mooring[] {
  const { shore, claimed } = options;
  const rental = options.rental ?? null;
  if (!shore) return [];

  const moorings: Mooring[] = [];
  for (let tileX = Math.floor(BUOY_TILES / 2); tileX < shore.tilesX; tileX += BUOY_TILES) {
    const tileZ = waterStartZ(shore, tileX) + SWIM_TILES;
    // Past the plot's own southern edge is water the renderer draws but the
    // camera is never framed on, and a buoy there is a buoy nobody sees.
    if (tileZ >= shore.tilesZ) continue;
    // The gap the hire boats come in through; see CORRIDOR_TILES.
    if (offRental(rental, (tileX + 0.5) * TILE_VOXELS) <= CORRIDOR_TILES) continue;
    if (claimed?.(tileX, tileZ)) continue;
    moorings.push({ x: (tileX + 0.5) * TILE_VOXELS, z: (tileZ + 0.5) * TILE_VOXELS });
  }
  return moorings;
}

/**
 * The water the craft have to themselves: everything seaward of the buoys, out
 * to the offing and no further than the plot is wide.
 *
 * The landward limit is a function rather than a number for two reasons. It
 * follows the coast, for the reason the moorings are depths — and it is taken
 * off {@link waterEdgeZ}, the coastline as a *curve*, rather than off the
 * rounded tile edge, because a boat moves continuously and a limit that stepped
 * a whole tile at every column boundary would make one turn sharply in open
 * water. And it comes in to the shallows in front of the hire hut, which is the
 * corridor the rental's own boats go home through.
 */
export interface SailingGround {
  /** Voxels: the western and eastern ends of the bay. */
  readonly westX: number;
  readonly eastX: number;
  /** Voxels: how far out to sea the craft go. */
  readonly seawardZ: number;
  /** Voxels: the landward limit at a point, which the craft stay south of. */
  landwardZ(x: number): number;
}

/** The sailing ground a plot's bay comes out as. */
export function sailingGroundFor(shore: Shore, rental: Rental | null = null): SailingGround {
  return {
    westX: 0,
    eastX: shore.tilesX * TILE_VOXELS,
    seawardZ: (shore.tilesZ + OFFING_TILES) * TILE_VOXELS,
    landwardZ: (x) => (waterEdgeZ(shore, x / TILE_VOXELS) + clearanceAt(rental, x)) * TILE_VOXELS,
  };
}
