/**
 * The lodgings standing on the plot: somewhere a guest goes to sleep.
 *
 * `venuesOn` with the filter turned round, and **deliberately disjoint from
 * it**. Somewhere to sleep is not somewhere to go when you are bored: a bungalow
 * in the venue list would be a candidate for `chooseVenue`, and a guest with
 * nothing better to do would walk into a stranger's bedroom. The router walks a
 * guest to a lodging for one reason only, which is that it is their bedtime and
 * it is theirs. See `night.ts`.
 *
 * Nothing here knows what a hotel is. The beds, the night's length and the
 * doors are all read off the art, as a venue's are.
 */

import type { ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import { placedDoors } from '../../layout/domain/doorStep';
import type { Placement } from '../../layout/domain/resortLayout';

/** Somewhere to sleep, as the simulation walks to it. */
export interface Lodging {
  /** The placement's key, e.g. `"bungalow#3"`; matches `Home.key`. */
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly beds: number;
  /** Night length in simulated seconds, as the art declares it. */
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  /** The footprint, for finding its doors, and its centre, for putting somebody inside. */
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly x: number;
  readonly z: number;
  /** Ways in, in world voxels, already turned with the placement; see `Venue.doors`. */
  readonly doors: readonly ModelDoor[];
}

/** Every lodging standing on the plot, in placement order. */
export function lodgingsOn(placements: readonly Placement[]): readonly Lodging[] {
  const lodgings: Lodging[] = [];
  for (const placement of placements) {
    const venue = venueOf(placement.id);
    if (venue?.role !== 'lodging') continue;
    const type = objectTypeById(placement.id);
    lodgings.push({
      key: placement.key,
      id: placement.id,
      label: type.label,
      beds: venue.beds ?? 0,
      dwellSeconds: venue.dwellSeconds,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      tilesX: placement.tilesX,
      tilesZ: placement.tilesZ,
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
      doors: placedDoors(placement, venue.doors ?? [], type.model.width, type.model.depth),
    });
  }
  return lodgings;
}

/**
 * Which entry of `lodgings` a `Home.key` names, or -1.
 *
 * A linear scan, and that is fine: it is asked once per guest when the resort
 * is built or rebuilt, never per frame.
 */
export function lodgingFor(lodgings: readonly Lodging[], key: string): number {
  return lodgings.findIndex((lodging) => lodging.key === key);
}
