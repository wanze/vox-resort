import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { levelHeight, type LevelProvider } from '../../layout/domain/elevation';
import type { Tile } from '../../layout/domain/resortLayout';

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

// Flatter than this, a pixel of camera shake would move the hit by half the resort.
const MIN_DESCENT = 1e-6;

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
  // Anything behind the eye is not on screen.
  const along = (height - near.y) / descent;
  if (along < 0) return null;

  return {
    x: near.x + (far.x - near.x) * along,
    z: near.z + (far.z - near.z) * along,
  };
}

export function tileOf(point: GroundPoint, tileVoxels: number = TILE_VOXELS): Tile {
  return {
    x: Math.floor(point.x / tileVoxels),
    z: Math.floor(point.z / tileVoxels),
  };
}

export interface PickGround {
  readonly levelOf: LevelProvider;
  readonly maxLevel: number;
}

// Levels are tried top down, keeping the first crossing on a tile that stands at that
// level: a terrace in front hides the ground behind it, as a depth test would. A ray
// grazing a riser is no pick, since the sea-level tile behind it would build in the wrong place.
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
    if (!ground || ground.levelOf(tile.x, tile.z) === level) return tile;
  }
  return null;
}
