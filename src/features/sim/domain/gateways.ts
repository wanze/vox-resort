/**
 * Where guests come in and go out: the gates standing on the plot.
 *
 * A list of its own for `lodgings.ts`'s reason - a gate is not somewhere a guest
 * decides to go, and one in the venue list would have a bored family queueing at
 * it. The router walks somebody to a gate for exactly one reason, which is that
 * their stay is over.
 *
 * Nothing here knows what an entrance is. Which models are gates is declared on
 * the art, exactly as beds and capacities are; see `gateway` in
 * `voxel-gen/voxelgen.ts`.
 */

import type { ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { isGateway } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';

/** A way off the plot, as the simulation walks to it. */
export interface Gateway {
  /** The placement's key, e.g. `"entrance#1"`; unique on the plot. */
  readonly key: string;
  /** The footprint, for finding its doors, and its centre, for standing somebody at it. */
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly x: number;
  readonly z: number;
  /**
   * Ways through, in world voxels; see `Venue.doors`. **Always empty**, and the
   * field is here so a gate hands straight to `doorsFor`: a door is declared on
   * `ModelVenue` and a gate declares no venue, deliberately.
   *
   * `doors.ts` reads an empty list as "any side will do" and falls back to the
   * ring, which for a gate stood across the promenade is the paving either side
   * of it - which is exactly the way through.
   */
  readonly doors: readonly ModelDoor[];
}

/**
 * Every gate standing on the plot, in placement order.
 *
 * Shaped so an entry hands straight to `doorsFor`, which takes a footprint and
 * its doors and asks nothing about what the building is for.
 */
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
