import { doorStepTile, placedDoors } from './doorStep';
import type { DoorwayProvider } from './railings';
import type { LayoutItem, Placement, Tile } from './resortLayout';
import { normalizeRotation, type Rotation } from './rotation';
import { CLIMBS } from './stairs';
import { tileKey } from './tileKey';

export interface Doorway {
  readonly tile: Tile;
  readonly rotation: Rotation;
}

type DoorItem = Pick<LayoutItem, 'width' | 'depth' | 'doors'>;

// The step lies outside the door, so the step's edge back at the building faces opposite the door.
// Facings run +z, +x, -z, -x and edges -z, -x, +z, +x, so the two numbers agree.
export function doorwaysOf(placement: Placement, item: DoorItem | undefined): readonly Doorway[] {
  if (!item?.doors) return [];
  return placedDoors(placement, item.doors, item.width, item.depth).map((door) => ({
    tile: doorStepTile(placement, door),
    rotation: normalizeRotation(door.facing),
  }));
}

export function doorwayLookup(
  placements: readonly Placement[],
  itemOf: (id: string) => DoorItem | undefined,
): DoorwayProvider {
  const edges = new Set(
    placements.flatMap((placement) =>
      doorwaysOf(placement, itemOf(placement.id)).map(({ tile, rotation }) =>
        edgeKey(tile.x, tile.z, rotation),
      ),
    ),
  );
  return (tileX, tileZ, rotation) => edges.has(edgeKey(tileX, tileZ, rotation));
}

// Asked of whatever stands across the edge, for an edit mode that keeps no table of doors.
export function doorwayBeside(
  standingAt: (tile: Tile) => Placement | undefined,
  itemOf: (id: string) => DoorItem | undefined,
): DoorwayProvider {
  return (tileX, tileZ, rotation) => {
    const { dx, dz } = CLIMBS.find((climb) => climb.rotation === rotation)!;
    const building = standingAt({ x: tileX + dx, z: tileZ + dz });
    if (!building) return false;
    return doorwaysOf(building, itemOf(building.id)).some(
      (door) => door.tile.x === tileX && door.tile.z === tileZ && door.rotation === rotation,
    );
  };
}

const edgeKey = (tileX: number, tileZ: number, rotation: Rotation): string =>
  `${tileKey(tileX, tileZ)}:${rotation}`;
