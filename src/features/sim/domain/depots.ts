import type { ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { depotOf, objectTypeById } from '../../catalog/domain/objectTypes';
import { placedDoors } from '../../layout/domain/doorStep';
import type { Placement } from '../../layout/domain/resortLayout';
import { NO_ZONE } from './zones';

export interface Depot {
  readonly key: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly x: number;
  readonly z: number;
  readonly doors: readonly ModelDoor[];
}

// Kept apart from venues so a bored guest is never sent in to where the staff keep the mops.
export function depotsOn(placements: readonly Placement[]): readonly Depot[] {
  const depots: Depot[] = [];
  for (const placement of placements) {
    const depot = depotOf(placement.id);
    if (!depot) continue;
    const { model } = objectTypeById(placement.id);
    depots.push({
      key: placement.key,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      tilesX: placement.tilesX,
      tilesZ: placement.tilesZ,
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
      doors: placedDoors(placement, depot.doors, model.width, model.depth),
    });
  }
  return depots;
}

// Dealt in turn so a shift does not all walk out of one door; a zoned worker keeps to the depots
// in their zone when there are any. -1 with no depot to clock on at.
export function depotForShift(turn: number, zone: number, depotZones: ArrayLike<number>): number {
  const inZone: number[] = [];
  if (zone !== NO_ZONE) {
    for (let depot = 0; depot < depotZones.length; depot++) {
      if (((depotZones[depot]! >> zone) & 1) === 1) inZone.push(depot);
    }
  }
  if (inZone.length > 0) return inZone[turn % inZone.length]!;
  return depotZones.length > 0 ? turn % depotZones.length : -1;
}
