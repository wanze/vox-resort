import { describe, expect, it } from "vitest";
import { groupBySection, originOf, originsFor, type VolumeSize } from "./sectionGrid";
import type { VoxelWrite } from "./voxelWrites";

const SECTION: VolumeSize = { x: 16, y: 16, z: 16 };
const SECTOR: VolumeSize = { x: 16, y: 256, z: 16 };

const write = (x: number, y: number, z: number): VoxelWrite => ({ x, y, z, voxelId: "resort_a" });

describe("originOf", () => {
  it("snaps down to the containing volume", () => {
    expect(originOf({ x: 17, y: 3, z: 31 }, SECTION)).toEqual({ x: 16, y: 0, z: 16 });
  });

  it("leaves an exact origin untouched", () => {
    expect(originOf({ x: 32, y: 16, z: 0 }, SECTION)).toEqual({ x: 32, y: 16, z: 0 });
  });

  it("floors negative coordinates away from zero", () => {
    expect(originOf({ x: -1, y: 0, z: -17 }, SECTION)).toEqual({ x: -16, y: 0, z: -32 });
  });

  it("rejects a zero-sized volume", () => {
    expect(() => originOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 16, z: 16 })).toThrow();
  });
});

describe("originsFor", () => {
  it("deduplicates volumes and preserves first-touch order", () => {
    const origins = originsFor([write(0, 0, 0), write(1, 1, 1), write(20, 0, 0)], SECTION);
    expect(origins).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 16, y: 0, z: 0 },
    ]);
  });

  it("collapses a tall sector column into one sector", () => {
    expect(originsFor([write(2, 0, 2), write(2, 200, 2)], SECTOR)).toHaveLength(1);
  });

  it("returns nothing for no writes", () => {
    expect(originsFor([], SECTION)).toEqual([]);
  });
});

describe("groupBySection", () => {
  it("routes each write into the section that owns it", () => {
    const buckets = groupBySection([write(0, 0, 0), write(17, 0, 0), write(3, 0, 3)], SECTION);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(buckets[0]?.writes).toHaveLength(2);
    expect(buckets[1]?.writes).toHaveLength(1);
  });

  it("splits an object that straddles a section boundary", () => {
    const buckets = groupBySection([write(15, 0, 0), write(16, 0, 0)], SECTION);
    expect(buckets).toHaveLength(2);
  });

  it("keeps every write", () => {
    const writes = [write(1, 1, 1), write(40, 20, 5), write(40, 20, 6)];
    const total = groupBySection(writes, SECTION).reduce(
      (sum, bucket) => sum + bucket.writes.length,
      0,
    );
    expect(total).toBe(writes.length);
  });
});
