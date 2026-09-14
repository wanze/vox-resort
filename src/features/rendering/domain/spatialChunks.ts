/**
 * Buckets placements into square chunks of the plot, so the renderer has
 * something it can cull.
 *
 * One `InstancedMesh` per model draws that model wherever it stands, which means
 * every one of them spans the entire plot. Three.js culls per mesh, so a mesh
 * whose bounding sphere covers the whole resort is never off-screen and nothing
 * is ever skipped: standing in a courtyard costs exactly as much as looking down
 * at the whole thing. On a plot this size that is affordable. On a resort several
 * times larger it is the wall.
 *
 * Splitting each model's instances by chunk gives each mesh a bounding sphere
 * the size of a chunk, and the renderer's own frustum test does the rest. The
 * price is draw calls — a model present in six chunks becomes six meshes — which
 * is why chunks are sized in world units rather than as a fraction of the plot:
 * the count then grows with the resort's area while each one stays small enough
 * to be worth testing, instead of the chunks growing with the plot and culling
 * nothing.
 *
 * The scene is mutable, so this module also owns the policy that keeps it cheap
 * to change: which chunk a placement falls in, how much room a bucket should
 * hold beyond what it draws today, and what actually differs between two sets of
 * placements. All of it is arithmetic over plain objects; the buffer writes it
 * implies live in `adapters/instancedWorld.ts`.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Rotation } from '../../layout/domain/rotation';

/**
 * Chunk edge, in voxels. Sixteen tiles is 64 m — big enough that the current
 * plot is a handful of chunks rather than a draw call per building, and small
 * enough that a street-level camera discards most of them.
 */
export const CHUNK_VOXELS = 16 * TILE_VOXELS;

export interface ChunkedItem {
  /** World-space corner, in voxels. */
  readonly x: number;
  readonly z: number;
}

export interface ChunkCoordinate {
  readonly chunkX: number;
  readonly chunkZ: number;
}

/** Which chunk a world position falls in. */
export function chunkOf(x: number, z: number, chunkVoxels: number = CHUNK_VOXELS): ChunkCoordinate {
  return {
    chunkX: Math.floor(x / chunkVoxels),
    chunkZ: Math.floor(z / chunkVoxels),
  };
}

/**
 * Chunks along each side of a region: the unit a far part of the plot is drawn
 * in. Four chunks is 256 m, which cut the draw calls of a 300-tile plot from
 * six thousand to fourteen hundred. See `levelOfDetail.ts`.
 */
export const REGION_CHUNKS = 4;

/** The region a chunk lies in, on the same coordinates a chunk uses. */
export function regionOf(chunk: ChunkCoordinate): ChunkCoordinate {
  return {
    chunkX: Math.floor(chunk.chunkX / REGION_CHUNKS),
    chunkZ: Math.floor(chunk.chunkZ / REGION_CHUNKS),
  };
}

/** Stable, sortable key for a chunk. */
export function chunkKey(chunk: ChunkCoordinate): string {
  return `${chunk.chunkX},${chunk.chunkZ}`;
}

export interface ChunkBucket<T> {
  readonly chunk: ChunkCoordinate;
  readonly items: readonly T[];
}

/**
 * Groups items by the chunk they stand in, in first-seen order so the scene is
 * built the same way every run.
 *
 * An object larger than a chunk is bucketed by its corner and simply makes its
 * chunk's bounding sphere larger; nothing here needs it split, because a mesh
 * whose sphere overhangs its chunk is still culled correctly — just slightly
 * less often.
 */
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

/**
 * Slots a bucket is never smaller than.
 *
 * A chunk that holds one lamp today is the chunk the next four things get
 * dropped into, so the smallest bucket still starts with room to grow.
 */
export const MIN_BUCKET_CAPACITY = 4;

/**
 * How much room above the live count a bucket keeps.
 *
 * Without it a bucket that doubled to exactly the count it needed would
 * reallocate again on the very next placement.
 */
const CAPACITY_HEADROOM = 1.25;

/**
 * Slots a bucket should hold for `needed` instances, given the `current` count
 * it already has.
 *
 * Capacity doubles rather than following the count, so filling a bucket costs a
 * logarithmic number of reallocations instead of one per placement — and it
 * grows one bucket at a time, which is the point: the plot is 528 meshes, and
 * giving every one of them slack up front would cost far more than growing the
 * handful that an edit actually lands in.
 */
export function capacityFor(needed: number, current = 0): number {
  if (needed <= current) return current;
  let capacity = Math.max(current, MIN_BUCKET_CAPACITY);
  while (capacity < needed) capacity *= 2;
  return Math.max(capacity, Math.ceil(needed * CAPACITY_HEADROOM));
}

/** An item the scene draws: what it is, where it stands, and what to call it. */
export interface PlacedItem extends ChunkedItem {
  /** Unique across the scene, and stable as long as the item does not move. */
  readonly key: string;
  /** Object type standing here. */
  readonly id: string;
  /** Which way round it stands; part of where it stands, as far as a diff cares. */
  readonly rotation: Rotation;
}

export interface PlacementDiff<T> {
  readonly added: readonly T[];
  /** Keys to take out. Apply these *before* `added`; see below. */
  readonly removed: readonly string[];
}

/**
 * What changed between two sets of placements.
 *
 * An item that kept its key but changed type, moved or turned comes back in both lists,
 * so a caller that removes before it adds needs no third case for it — which is
 * why the removals have to be applied first.
 *
 * This is only worth anything because keys are stable: while derived placements
 * were numbered by array index, inserting one path tile renumbered every tile
 * after it and the diff was the whole resort.
 */
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
