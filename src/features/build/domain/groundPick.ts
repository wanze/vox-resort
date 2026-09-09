/**
 * Turns a pointer position into the tile of the plot under it.
 *
 * Picking needs no scene graph and no raycaster: the camera's inverse
 * view-projection unprojects the pointer into a world-space ray, and the ray
 * meets a level of ground at a single solved point. That keeps the whole of
 * picking pure — the hot path of a hover runs once per pointer move with no
 * Three.js object touched — and it stays exact where a raycast against the
 * ground mesh would depend on how large that mesh happens to be drawn.
 *
 * **Terraces make it a search rather than a solve.** With the land in benches
 * there is no single plane to intersect: the ray crosses one plane per level, and
 * only one of those crossings is on ground that is actually there. So
 * {@link pickTile} tries the levels from the **top down** and keeps the first
 * crossing that lands on a tile standing at that very level. Top down is what
 * makes a terrace in front hide the ground behind it — the same ordering a
 * depth test would arrive at, done in four lines of arithmetic instead of a
 * raycast against a few thousand quads.
 *
 * A ray that grazes a riser can miss every level, and that is reported as no
 * pick at all rather than as the sea-level tile behind it: the tile under the
 * cursor is what decides where an object is built, and a wrong tile builds in
 * the wrong place.
 *
 * Matrices arrive column-major, the layout Three.js uses in `Matrix4.elements`,
 * the same convention `hud/domain/labelProjection.ts` reads them in.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { levelHeight } from '../../layout/domain/elevation';
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
 * Where the pointer's ray meets one level of ground, or null when it never does
 * — the pointer is on the sky above the horizon, or the camera is edge-on to the
 * ground.
 *
 * `height` is the plane to solve against, in voxels, and defaults to sea level.
 * Nothing here knows whether ground is actually *there* at that height; that is
 * {@link pickTile}'s job.
 */
export function groundPointAt(
  pointer: PointerPosition,
  viewport: Viewport,
  inverseViewProjection: ArrayLike<number>,
  height = 0,
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
  // Where the ray crosses the plane; anything behind the eye is not on screen.
  const along = (height - near.y) / descent;
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

/**
 * The terraced ground a pick has to choose between.
 *
 * Two questions, because the search needs both: where to start, and whether a
 * crossing landed on real ground. A flat plot passes nothing and the search
 * collapses to the single solve it always was.
 */
export interface PickGround {
  /** How many levels above sea level the ground under a tile stands. */
  readonly levelOf: (tile: Tile) => number;
  /** The highest level anywhere: where the walk down starts. */
  readonly maxLevel: number;
}

/**
 * The tile under the pointer, or null when the pointer is not over any ground.
 *
 * The levels are tried from the top down, and a crossing counts only if the tile
 * it lands on really stands at that level — see the note at the top of the file
 * for why that ordering is the whole of the hidden-surface problem here.
 */
export function pickTile(
  pointer: PointerPosition,
  viewport: Viewport,
  inverseViewProjection: ArrayLike<number>,
  tileVoxels: number = TILE_VOXELS,
  ground: PickGround | null = null,
): Tile | null {
  for (let level = ground?.maxLevel ?? 0; level >= 0; level--) {
    const point = groundPointAt(pointer, viewport, inverseViewProjection, levelHeight(level));
    if (!point) continue;
    const tile = tileOf(point, tileVoxels);
    if (!ground || ground.levelOf(tile) === level) return tile;
  }
  return null;
}
