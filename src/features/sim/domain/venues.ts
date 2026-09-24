import type {
  GuestNeed,
  ModelDoor,
  NeedRelief,
  Shelter,
  VenueRole,
} from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { placedDoors } from '../../layout/domain/doorStep';

export interface Venue {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly role: VenueRole;
  readonly satisfies: readonly NeedRelief[];
  readonly capacity: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  readonly shelter?: Shelter;
  readonly x: number;
  readonly z: number;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly doors: readonly ModelDoor[];
}

// Derived on demand rather than cached, since placements change under hand edits.
// Lodging is left out: `guests/domain/homes.ts` owns where everybody sleeps.
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
      shelter: venue.shelter ?? 'covered',
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      tilesX: placement.tilesX,
      tilesZ: placement.tilesZ,
      // The model's size, not the placement's, which is already turned.
      doors: placedDoors(placement, venue.doors ?? [], type.model.width, type.model.depth),
    });
  }
  return venues;
}

export function shelterOf(venue: Venue): Shelter {
  return venue.shelter ?? 'covered';
}

// Negative amounts are kept: a venue can be fun and tiring at once.
export function reliefAt(venue: Venue, need: GuestNeed): number {
  return venue.satisfies.find((relief) => relief.need === need)?.amount ?? 0;
}
