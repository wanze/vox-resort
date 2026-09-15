/**
 * The venues standing on the plot: somewhere a guest could decide to go.
 *
 * Nothing here knows what a bakery is. It reads the venue the art declared and
 * copies it onto the placement that is standing, so a new venue is a model file
 * and this module never learns its name. See `ModelVenue` in
 * `voxel-gen/voxelgen.ts`.
 *
 * The list is derived on demand rather than kept: the placements change under a
 * hand edit, and a cached list would be a second thing to keep in step with the
 * plot for no gain at the rate anybody asks for it.
 */

import type {
  GuestNeed,
  ModelDoor,
  NeedRelief,
  VenueRole,
} from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { placedDoors } from '../../layout/domain/doorStep';

export interface Venue {
  /** The placement's key, e.g. `"bakery#2"`; unique on the plot. */
  readonly key: string;
  /** Catalogue id, e.g. `"bakery"`. */
  readonly id: string;
  /** What the HUD calls it. */
  readonly label: string;
  readonly role: VenueRole;
  readonly satisfies: readonly NeedRelief[];
  readonly capacity: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  /** Centre of the footprint, in world voxels: what a distance is measured to. */
  readonly x: number;
  readonly z: number;
  /**
   * Tile the footprint starts on, and how many tiles it claims.
   *
   * Carried as well as the centre because a door is found from the tiles and
   * not from the middle of the building: see `doors.ts`. Copied straight off
   * the placement, which already holds them turned, so a rotated venue needs no
   * handling here.
   */
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  /**
   * Ways in, in world voxels, already turned with the placement. Empty where
   * the art declares none, which `doors.ts` reads as "any side will do".
   */
  readonly doors: readonly ModelDoor[];
}

/**
 * Every venue standing on the plot, in placement order.
 *
 * Lodging is left out. A bed is not somewhere a guest walks to during the day,
 * and `guests/domain/homes.ts` already owns where everybody sleeps; the plan
 * that gives lodging a daytime reader is 019, and it will want its own list
 * rather than this one filtered again.
 *
 * Placement order rather than any sort, so the result is deterministic and a
 * chosen index means the same thing on two runs of the same plot.
 */
export function venuesOn(placements: readonly Placement[]): Venue[] {
  const venues: Venue[] = [];
  for (const placement of placements) {
    const venue = venueOf(placement.id);
    if (!venue || venue.role === 'lodging') continue;
    const type = objectTypeById(placement.id);
    venues.push({
      key: placement.key,
      id: placement.id,
      label: type.label,
      role: venue.role,
      satisfies: venue.satisfies ?? [],
      capacity: venue.capacity,
      dwellSeconds: venue.dwellSeconds,
      // The placement's own corner plus half its extent: a distance is measured
      // to the middle of a building rather than to whichever corner it was
      // drawn from.
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      tilesX: placement.tilesX,
      tilesZ: placement.tilesZ,
      // Off the model rather than the placement, whose size is already turned;
      // see `placedDoors`.
      doors: placedDoors(placement, venue.doors ?? [], type.model.width, type.model.depth),
    });
  }
  return venues;
}

/**
 * How much of `need` one visit here sees to, or 0 where it serves it not at all.
 *
 * The amount is handed back as the art declared it, negative included: an hour
 * of basketball is fun and it is tiring, and clamping that away here would lose
 * the half of it the model was explicit about.
 */
export function reliefAt(venue: Venue, need: GuestNeed): number {
  return venue.satisfies.find((relief) => relief.need === need)?.amount ?? 0;
}
