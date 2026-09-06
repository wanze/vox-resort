import { describe, expect, it } from "vitest";
import { bucketByChunk, chunkKey, chunkOf, CHUNK_VOXELS } from "./spatialChunks";

const at = (x: number, z: number, id = "") => ({ x, z, id });

describe("chunkOf", () => {
  it("puts the origin in chunk 0,0", () => {
    expect(chunkOf(0, 0, 100)).toEqual({ chunkX: 0, chunkZ: 0 });
    expect(chunkOf(99, 99, 100)).toEqual({ chunkX: 0, chunkZ: 0 });
  });

  it("steps to the next chunk at the boundary", () => {
    expect(chunkOf(100, 0, 100)).toEqual({ chunkX: 1, chunkZ: 0 });
    expect(chunkOf(0, 250, 100)).toEqual({ chunkX: 0, chunkZ: 2 });
  });

  it("floors rather than truncates, so negatives do not collapse onto zero", () => {
    expect(chunkOf(-1, -1, 100)).toEqual({ chunkX: -1, chunkZ: -1 });
    expect(chunkOf(-100, -101, 100)).toEqual({ chunkX: -1, chunkZ: -2 });
  });

  it("defaults to a chunk the plot is measured in tiles of", () => {
    expect(CHUNK_VOXELS).toBe(256);
    expect(chunkOf(255, 0)).toEqual({ chunkX: 0, chunkZ: 0 });
    expect(chunkOf(256, 0)).toEqual({ chunkX: 1, chunkZ: 0 });
  });
});

describe("chunkKey", () => {
  it("separates chunks that differ on either axis", () => {
    expect(chunkKey({ chunkX: 1, chunkZ: 2 })).not.toBe(chunkKey({ chunkX: 2, chunkZ: 1 }));
  });
});

describe("bucketByChunk", () => {
  it("has no buckets for no items", () => {
    expect(bucketByChunk([], 100)).toEqual([]);
  });

  it("keeps one chunk's items together", () => {
    const buckets = bucketByChunk([at(0, 0), at(10, 10), at(99, 99)], 100);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.items).toHaveLength(3);
  });

  it("splits items that fall in different chunks", () => {
    const buckets = bucketByChunk([at(0, 0), at(150, 0), at(0, 150)], 100);
    expect(buckets).toHaveLength(3);
    expect(buckets.map((bucket) => bucket.chunk)).toEqual([
      { chunkX: 0, chunkZ: 0 },
      { chunkX: 1, chunkZ: 0 },
      { chunkX: 0, chunkZ: 1 },
    ]);
  });

  it("preserves the order items arrived in, within and across buckets", () => {
    const buckets = bucketByChunk(
      [at(0, 0, "a"), at(150, 0, "b"), at(10, 0, "c"), at(160, 0, "d")],
      100,
    );
    expect(buckets.map((bucket) => bucket.items.map((item) => item.id))).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("loses nothing", () => {
    const items = Array.from({ length: 200 }, (_, index) => at(index * 7, index * 13, `i${index}`));
    const buckets = bucketByChunk(items, 100);
    const seen = buckets.flatMap((bucket) => bucket.items.map((item) => item.id));
    expect(seen.toSorted()).toEqual(items.map((item) => item.id).toSorted());
  });

  it("makes more chunks as the plot grows, at a fixed chunk size", () => {
    const small = Array.from({ length: 50 }, (_, index) => at((index % 10) * 30, 0));
    const large = Array.from({ length: 50 }, (_, index) => at((index % 10) * 120, 0));
    expect(bucketByChunk(large, 100).length).toBeGreaterThan(bucketByChunk(small, 100).length);
  });

  it("refuses a chunk size that cannot bucket anything", () => {
    expect(() => bucketByChunk([at(0, 0)], 0)).toThrow(/cannot be 0 voxels/);
  });
});
