import { describe, expect, it } from "vitest";
import type { Placement } from "./resortLayout";
import { cameraFramingFor, worldBoundsFor } from "./worldBounds";

const at = (id: string, x: number, z: number, width: number, depth: number): Placement => ({
  key: id,
  id,
  tileX: Math.floor(x / 16),
  tileZ: Math.floor(z / 16),
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x,
  z,
  width,
  depth,
});

const placements: Placement[] = [at("a", 0, 0, 4, 4), at("b", 32, 0, 6, 2), at("c", 0, 32, 2, 8)];

const heights: Record<string, number> = { a: 3, b: 12, c: 5 };

describe("worldBoundsFor", () => {
  it("covers every placement", () => {
    const bounds = worldBoundsFor(placements, (id) => heights[id] ?? 0);
    for (const placement of placements) {
      expect(placement.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(placement.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(placement.x + placement.width).toBeLessThanOrEqual(bounds.maxX);
      expect(placement.z + placement.depth).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it("takes the tallest object as the world height", () => {
    expect(worldBoundsFor(placements, (id) => heights[id] ?? 0).height).toBe(12);
  });

  it("collapses to zero for an empty layout", () => {
    expect(worldBoundsFor([], () => 5)).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 0,
      maxZ: 0,
      height: 0,
    });
  });
});

describe("cameraFramingFor", () => {
  const bounds = worldBoundsFor(placements, (id) => heights[id] ?? 0);

  it("targets the middle of the plot", () => {
    const { target } = cameraFramingFor(bounds, 60);
    expect(target.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2);
    expect(target.z).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2);
  });

  it("stands off far enough to see the whole plot", () => {
    const { target, position } = cameraFramingFor(bounds, 60);
    const extent = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const distance = Math.hypot(
      position.x - target.x,
      position.y - target.y,
      position.z - target.z,
    );
    expect(distance).toBeGreaterThan(extent / 2);
  });

  it("pulls back further for a narrower field of view", () => {
    const near = cameraFramingFor(bounds, 80).position;
    const far = cameraFramingFor(bounds, 30).position;
    expect(far.y).toBeGreaterThan(near.y);
  });

  it("stays finite for a degenerate world", () => {
    const framing = cameraFramingFor({ minX: 0, minZ: 0, maxX: 0, maxZ: 0, height: 0 }, 60);
    expect(Number.isFinite(framing.position.x)).toBe(true);
    expect(Number.isFinite(framing.position.y)).toBe(true);
  });
});
