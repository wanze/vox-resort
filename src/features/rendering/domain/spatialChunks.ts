import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Rotation } from '../../layout/domain/rotation';

// Chunks give each mesh a chunk-sized bounding sphere so Three.js can frustum-cull it.
// Sized in world units so the count grows with the resort instead of chunks growing and culling nothing.
export const CHUNK_VOXELS = 16 * TILE_VOXELS;

export interface ChunkedItem {
  readonly x: number;
  readonly z: number;
}

export interface ChunkCoordinate {
  readonly chunkX: number;
  readonly chunkZ: number;
}

export function chunkOf(x: number, z: number, chunkVoxels: number = CHUNK_VOXELS): ChunkCoordinate {
  return {
    chunkX: Math.floor(x / chunkVoxels),
    chunkZ: Math.floor(z / chunkVoxels),
  };
}

// Four chunks cut a 300-tile plot's draw calls from about 6000 to 1400.
export const REGION_CHUNKS = 4;

export function regionOf(chunk: ChunkCoordinate): ChunkCoordinate {
  return {
    chunkX: Math.floor(chunk.chunkX / REGION_CHUNKS),
    chunkZ: Math.floor(chunk.chunkZ / REGION_CHUNKS),
  };
}

export function chunkKey(chunk: ChunkCoordinate): string {
  return `${chunk.chunkX},${chunk.chunkZ}`;
}

export interface ChunkBucket<T> {
  readonly chunk: ChunkCoordinate;
  readonly items: readonly T[];
}

// An object larger than a chunk is bucketed by its corner: an overhanging sphere still culls correctly.
export function bucketByChunk<T extends ChunkedItem>(
  items: readonly T[],
  chunkVoxels: number = CHUNK_VOXELS,
): ChunkBucket<T>[] {
  if (chunkVoxels <= 0) throw new Error(`A chunk cannot be ${chunkVoxels} voxels across`);
  const buckets = new Map<string, { chunk: ChunkCoordinate; items: T[] }>();
  for (const item of items) {
    const chunk = chunkOf(item.x, item.z, chunkVoxels);
    const key = chunkKey(chunk);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { chunk, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(item);
  }
  return [...buckets.values()];
}

export const MIN_BUCKET_CAPACITY = 4;

// Without headroom a bucket grown to exactly its count reallocates on the next placement.
const CAPACITY_HEADROOM = 1.25;

// Doubles for a logarithmic number of reallocations, growing only the buckets an edit
// lands in rather than giving every mesh slack up front.
export function capacityFor(needed: number, current = 0): number {
  if (needed <= current) return current;
  let capacity = Math.max(current, MIN_BUCKET_CAPACITY);
  while (capacity < needed) capacity *= 2;
  return Math.max(capacity, Math.ceil(needed * CAPACITY_HEADROOM));
}

export interface PlacedItem extends ChunkedItem {
  readonly key: string;
  readonly id: string;
  readonly rotation: Rotation;
}

export interface PlacementDiff<T> {
  readonly added: readonly T[];
  readonly removed: readonly string[];
}

// An item that kept its key but changed type, moved or turned is in both lists, so
// removals must be applied before additions.
export function diffPlacements<T extends PlacedItem>(
  previous: readonly T[],
  next: readonly T[],
): PlacementDiff<T> {
  const before = new Map(previous.map((item) => [item.key, item]));
  const added: T[] = [];
  const removed: string[] = [];
  for (const item of next) {
    const was = before.get(item.key);
    if (!was) {
      added.push(item);
      continue;
    }
    before.delete(item.key);
    if (
      was.id === item.id &&
      was.x === item.x &&
      was.z === item.z &&
      was.rotation === item.rotation
    ) {
      continue;
    }
    removed.push(item.key);
    added.push(item);
  }
  for (const key of before.keys()) removed.push(key);
  return { added, removed };
}
