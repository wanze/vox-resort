/**
 * Turns a pointer position into the tile of the plot under it.
 *
 * The resort stands on one flat plane at `y = 0`, so picking needs no scene
 * graph and no raycaster: the camera's inverse view-projection unprojects the
 * pointer into a world-space ray, and the ray meets the ground at a single
 * solved point. That keeps the whole of picking pure — the hot path of a hover
 * runs once per pointer move with no Three.js object touched — and it stays
 * exact where a raycast against the ground mesh would depend on how large that
 * mesh happens to be drawn.
 *
 * Matrices arrive column-major, the layout Three.js uses in `Matrix4.elements`,
 * the same convention `hud/domain/labelProjection.ts` reads them in.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Tile } from '../../layout/domain/resortLayout';
import type { Viewport } from '../../hud/domain/labelProjection';

/** Where the pointer is, in CSS pixels from the canvas's top-left corner. */
export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

/** A point on the ground plane, in world voxels. */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * A ray that runs so nearly along the ground that where it lands is meaningless:
 * a pixel's worth of camera shake would move the hit by half the resort.
 */
const MIN_DESCENT = 1e-6;

/** Unprojects one normalised device coordinate, or null if it lands at infinity. */
function unproject(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  inverse: ArrayLike<number>,
): { x: number; y: number; z: number } | null {
  const x = inverse[0]! * ndcX + inverse[4]! * ndcY + inverse[8]! * ndcZ + inverse[12]!;
  const y = inverse[1]! * ndcX + inverse[5]! * ndcY + inverse[9]! * ndcZ + inverse[13]!;
  const z = inverse[2]! * ndcX + inverse[6]! * ndcY + inverse[10]! * ndcZ + inverse[14]!;
  const w = inverse[3]! * ndcX + inverse[7]! * ndcY + inverse[11]! * ndcZ + inverse[15]!;
  if (w === 0) return null;
  return { x: x / w, y: y / w, z: z / w };
}

/**
 * Where the pointer's ray meets the ground plane, or null when it never does —
 * the pointer is on the sky above the horizon, or the camera is edge-on to the
 * ground.
 */
export function groundPointAt(
  pointer: PointerPosition,
  viewport: Viewport,
  inverseViewProjection: ArrayLike<number>,
): GroundPoint | null {
  if (inverseViewProjection.length < 16) throw new Error('Expected a 4x4 matrix of 16 elements');
  if (viewport.width <= 0 || viewport.height <= 0) return null;

  const ndcX = (pointer.x / viewport.width) * 2 - 1;
  const ndcY = 1 - (pointer.y / viewport.height) * 2;
  const near = unproject(ndcX, ndcY, -1, inverseViewProjection);
  const far = unproject(ndcX, ndcY, 1, inverseViewProjection);
  if (!near || !far) return null;

  const descent = far.y - near.y;
  if (Math.abs(descent) < MIN_DESCENT) return null;
  // The ground is the y = 0 plane; anything behind the eye is not on screen.
  const along = -near.y / descent;
  if (along < 0) return null;

  return {
    x: near.x + (far.x - near.x) * along,
    z: near.z + (far.z - near.z) * along,
  };
}

/** The tile a ground point falls on. Tiles run negative off the plot's corner. */
export function tileOf(point: GroundPoint, tileVoxels: number = TILE_VOXELS): Tile {
  return {
    x: Math.floor(point.x / tileVoxels),
    z: Math.floor(point.z / tileVoxels),
  };
}

/** The tile under the pointer, or null when the pointer is not over the ground. */
export function pickTile(
  pointer: PointerPosition,
  viewport: Viewport,
  inverseViewProjection: ArrayLike<number>,
  tileVoxels: number = TILE_VOXELS,
): Tile | null {
  const point = groundPointAt(pointer, viewport, inverseViewProjection);
  return point ? tileOf(point, tileVoxels) : null;
}
