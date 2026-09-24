import type { PlacementGround } from '../../../../voxel-gen/voxelgen.ts';

export interface PlacementGroundView {
  readonly levelOf: (tileX: number, tileZ: number) => number;
  readonly isSand: (tileX: number, tileZ: number) => boolean;
  readonly isSea: (tileX: number, tileZ: number) => boolean;
}

export const BEACH_REACH = 16;

export const SHORE_REACH = 3;

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
