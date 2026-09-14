/**
 * Whether a tile is ground an object that declares `placement.ground` will
 * stand on.
 *
 * One rule for both the generator and the build tool, asked of the ground as it
 * stands rather than of the shore spec, so a beach umbrella dropped by hand is
 * refused exactly where a generated one would never be put. See
 * `ModelPlacement` in `voxel-gen/voxelgen.ts`.
 *
 * A beach is sand at sea level that runs **straight down to the sea**, walked
 * south a tile at a time — which is what rules out the dune (it is above sea
 * level), a lawn (it is grass) and a sand bank beside a river that ends in
 * grass. The shore is the same walk, only a few tiles long.
 */

import type { PlacementGround } from '../../../../voxel-gen/voxelgen.ts';

/** The questions about the ground the rule reads; `Terrain` answers all three. */
export interface PlacementGroundView {
  readonly levelOf: (tileX: number, tileZ: number) => number;
  readonly isSand: (tileX: number, tileZ: number) => boolean;
  /** Whether the tile is the bay, as opposed to a river or a lake. */
  readonly isSea: (tileX: number, tileZ: number) => boolean;
}

/** Tiles of sand a `beach` object may stand behind the water's edge. */
export const BEACH_REACH = 16;

/**
 * Tiles of sand a `shore` object may stand behind the water's edge: the wet
 * strip, and the two rows above it.
 */
export const SHORE_REACH = 3;

/** Whether one tile will take an object that declares this ground. */
export function groundTakes(
  ground: PlacementGround | undefined,
  view: PlacementGroundView,
  tileX: number,
  tileZ: number,
): boolean {
  if (ground === undefined) return true;
  const reach = ground === 'shore' ? SHORE_REACH : BEACH_REACH;
  if (!onBeachSand(view, tileX, tileZ)) return false;
  for (let step = 1; step <= reach; step++) {
    const z = tileZ + step;
    if (view.isSea(tileX, z)) return true;
    if (!onBeachSand(view, tileX, z)) return false;
  }
  return false;
}

function onBeachSand(view: PlacementGroundView, tileX: number, tileZ: number): boolean {
  return !view.isSea(tileX, tileZ) && view.isSand(tileX, tileZ) && view.levelOf(tileX, tileZ) === 0;
}
