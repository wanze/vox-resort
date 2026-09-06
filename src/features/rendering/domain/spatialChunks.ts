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
 */

import { TILE_VOXELS } from "../../../../voxel-gen/voxelgen.ts";

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
