import type { ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { isGateway } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';

export interface Gateway {
  readonly key: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly x: number;
  readonly z: number;
  // Always empty: gates declare no venue, and `doorsFor` reads an empty list as
  // "any side", which for a gate across the promenade is the way through.
  readonly doors: readonly ModelDoor[];
}

// Kept apart from venues so the router never sends a bored guest to queue at a gate.
export function gatewaysOn(placements: readonly Placement[]): readonly Gateway[] {
  const gateways: Gateway[] = [];
  for (const placement of placements) {
    if (!isGateway(placement.id)) continue;
    gateways.push({
      key: placement.key,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      tilesX: placement.tilesX,
      tilesZ: placement.tilesZ,
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
      doors: [],
    });
  }
  return gateways;
}
