import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Tile } from '../../layout/domain/resortLayout';
import type { PointerPosition, Viewport } from './groundPick';

// A fingertip's width: zoomed out, a tile is a few pixels and could not be hit on its own.
export const ANCHOR_REACH = 28;

export function tileOnScreen(
  tile: Tile,
  height: number,
  viewport: Viewport,
  viewProjection: ArrayLike<number>,
  tileVoxels: number = TILE_VOXELS,
): PointerPosition | null {
  const x = (tile.x + 0.5) * tileVoxels;
  const z = (tile.z + 0.5) * tileVoxels;
  const m = viewProjection;
  const clipX = m[0]! * x + m[4]! * height + m[8]! * z + m[12]!;
  const clipY = m[1]! * x + m[5]! * height + m[9]! * z + m[13]!;
  const w = m[3]! * x + m[7]! * height + m[11]! * z + m[15]!;
  // Behind the eye, the division would mirror the point onto the screen.
  if (w <= 0) return null;
  return {
    x: ((clipX / w + 1) / 2) * viewport.width,
    y: ((1 - clipY / w) / 2) * viewport.height,
  };
}

// On the anchor's own tiles, or near enough to its centre on screen.
export function grabsAnchor(
  anchor: PointerPosition | null,
  pointer: PointerPosition,
  onAnchor: boolean,
): boolean {
  if (onAnchor) return true;
  return anchor !== null && Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) <= ANCHOR_REACH;
}
