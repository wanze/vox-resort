import type {
  GuestNeed,
  ModelDoor,
  ModelVenue,
  NeedRelief,
  Shelter,
  VenueRole,
} from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { placedDoors } from '../../layout/domain/doorStep';
import type { Hours } from './hours';

export interface Venue {
  readonly key: string;
  readonly id: string;
  // The venue's name when it has one, else the type's label. `kind` is always the type's
  // label, and absent only on the beach and hand-made venues, which go by their kind.
  readonly label: string;
  readonly kind?: string;
  readonly role: VenueRole;
  readonly satisfies: readonly NeedRelief[];
  readonly capacity: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  readonly shelter?: Shelter;
  readonly hours?: Hours;
  readonly receives?: boolean;
  readonly litter?: number;
  readonly stage?: boolean;
  readonly dj?: boolean;
  readonly bathing?: boolean;
  readonly cools?: boolean;
  readonly reliability?: number;
  // A fire pit: a bonfire booked on the beach is held here.
  readonly hearth?: boolean;
  readonly x: number;
  readonly z: number;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly doors: readonly ModelDoor[];
}

// Spread in only when declared: an undefined key is not the same as a missing one here.
const traitsOf = (venue: ModelVenue) => ({
  shelter: venue.shelter ?? 'covered',
  ...(venue.hours === undefined ? {} : { hours: venue.hours }),
  receives: venue.receives ?? false,
  litter: venue.litter ?? 0,
  stage: venue.stage ?? false,
  dj: venue.dj ?? false,
  bathing: venue.bathing ?? false,
  cools: venue.cools === true,
  ...(venue.reliability === undefined ? {} : { reliability: venue.reliability }),
  hearth: venue.hearth !== undefined,
});

// Derived on demand rather than cached, since placements change under hand edits.
// Lodging is left out: `guests/domain/homes.ts` owns where everybody sleeps.
// Names are keyed by placement; typed inline so this module needs nothing from naming/.
export function venuesOn(
  placements: readonly Placement[],
  names?: ReadonlyMap<string, string>,
): Venue[] {
  const venues: Venue[] = [];
  for (const placement of placements) {
    const venue = venueOf(placement.id);
    if (!venue || venue.role === 'lodging') continue;
    const type = objectTypeById(placement.id);
    venues.push({
      key: placement.key,
      id: placement.id,
      label: names?.get(placement.key) ?? type.label,
      kind: type.label,
      role: venue.role,
      satisfies: venue.satisfies ?? [],
      capacity: venue.capacity,
      dwellSeconds: venue.dwellSeconds,
      ...traitsOf(venue),
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

// The same list under new names, for the router's relabel: a rename moves nothing else.
export const relabelled = (venues: readonly Venue[], names: ReadonlyMap<string, string>): Venue[] =>
  venues.map((venue) =>
    venue.kind === undefined ? venue : { ...venue, label: names.get(venue.key) ?? venue.kind },
  );

interface Labelled {
  readonly label: string;
  readonly kind?: string;
}

// "The Salty Spoon" stands alone where "Restaurant" wants "the" before it. A venue renamed to
// its kind reads as a kind again, and a home has no kind.
export const isNamed = (place: Labelled): boolean =>
  place.kind !== undefined && place.label !== place.kind;

export function shelterOf(venue: Venue): Shelter {
  return venue.shelter ?? 'covered';
}

// Negative amounts are kept: a venue can be fun and tiring at once.
export function reliefAt(venue: Venue, need: GuestNeed): number {
  return venue.satisfies.find((relief) => relief.need === need)?.amount ?? 0;
}
