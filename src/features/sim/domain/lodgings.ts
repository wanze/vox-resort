import type { ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import { placedDoors } from '../../layout/domain/doorStep';
import type { Placement } from '../../layout/domain/resortLayout';

export interface Lodging {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly beds: number;
  readonly dwellSeconds: { readonly min: number; readonly max: number };
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly x: number;
  readonly z: number;
  readonly doors: readonly ModelDoor[];
}

// Deliberately disjoint from `venuesOn`: a lodging in the venue list would let a
// bored guest walk into a stranger's bedroom.
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

// A linear scan is fine: asked once per guest on build, never per frame.
export function lodgingFor(lodgings: readonly Lodging[], key: string): number {
  return lodgings.findIndex((lodging) => lodging.key === key);
}
