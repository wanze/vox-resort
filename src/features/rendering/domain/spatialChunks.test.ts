import { describe, expect, it } from "vitest";
import {
  bucketByChunk,
  capacityFor,
  chunkKey,
  chunkOf,
  CHUNK_VOXELS,
  diffPlacements,
  MIN_BUCKET_CAPACITY,
} from "./spatialChunks";

const at = (x: number, z: number, id = "") => ({ x, z, id });

const placed = (key: string, id: string, x: number, z: number) => ({ key, id, x, z });

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

describe("capacityFor", () => {
  it("gives even a single instance room to grow", () => {
    expect(capacityFor(1)).toBeGreaterThanOrEqual(MIN_BUCKET_CAPACITY);
  });

  it("keeps a capacity that already holds what is asked of it", () => {
    expect(capacityFor(10, 64)).toBe(64);
    expect(capacityFor(64, 64)).toBe(64);
  });

  it("doubles rather than following the count, so filling a bucket is logarithmic", () => {
    let capacity = 0;
    let reallocations = 0;
    for (let count = 1; count <= 1000; count++) {
      const next = capacityFor(count, capacity);
      if (next !== capacity) reallocations++;
      capacity = next;
    }
    expect(capacity).toBeGreaterThanOrEqual(1000);
    expect(reallocations).toBeLessThan(15);
  });

  it("leaves room above an exact fit, so the next placement does not reallocate", () => {
    const capacity = capacityFor(256);
    expect(capacity).toBeGreaterThan(256);
    expect(capacityFor(257, capacity)).toBe(capacity);
  });

  it("never hands back less than it was asked for", () => {
    for (const needed of [0, 1, 3, 7, 100, 513, 5000]) {
      expect(capacityFor(needed)).toBeGreaterThanOrEqual(needed);
    }
  });
});

describe("diffPlacements", () => {
  it("sees nothing in two identical sets", () => {
    const items = [placed("a", "hut", 0, 0), placed("b", "hut", 16, 0)];
    expect(diffPlacements(items, [...items])).toEqual({ added: [], removed: [] });
  });

  it("reports what appeared and what went away", () => {
    const diff = diffPlacements(
      [placed("a", "hut", 0, 0), placed("b", "hut", 16, 0)],
      [placed("b", "hut", 16, 0), placed("c", "lamp", 32, 0)],
    );
    expect(diff.added.map((added) => added.key)).toEqual(["c"]);
    expect(diff.removed).toEqual(["a"]);
  });

  it("reports a key that moved as a removal and an addition", () => {
    const diff = diffPlacements([placed("a", "hut", 0, 0)], [placed("a", "hut", 64, 0)]);
    expect(diff.removed).toEqual(["a"]);
    expect(diff.added.map((added) => added.x)).toEqual([64]);
  });

  it("reports a key that changed type the same way", () => {
    const diff = diffPlacements([placed("a", "hut", 0, 0)], [placed("a", "shed", 0, 0)]);
    expect(diff.removed).toEqual(["a"]);
    expect(diff.added.map((added) => added.id)).toEqual(["shed"]);
  });

  it("sees one insertion as one addition, whatever it does to the order", () => {
    const previous = [placed("p@0,0", "path", 0, 0), placed("p@0,16", "path", 0, 16)];
    const next = [previous[0]!, placed("p@0,8", "path", 0, 8), previous[1]!];
    const diff = diffPlacements(previous, next);
    expect(diff.added.map((added) => added.key)).toEqual(["p@0,8"]);
    expect(diff.removed).toEqual([]);
  });

  it("empties the scene when the next set is empty", () => {
    const diff = diffPlacements([placed("a", "hut", 0, 0), placed("b", "hut", 16, 0)], []);
    expect(diff.added).toEqual([]);
    expect(diff.removed.toSorted()).toEqual(["a", "b"]);
  });
});
