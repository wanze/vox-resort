import { describe, expect, it } from "vitest";
import { groundPointAt, pickTile, tileOf } from "./groundPick";

/**
 * The inverse view-projection of a camera looking straight down from `height`,
 * covering `half` voxels either side of the origin, column-major.
 *
 * Written out rather than inverted from a real camera so the test states the
 * mapping it is checking: NDC x runs east, NDC y runs north (so +y is -z in
 * world space), and NDC z runs from the near plane down to the ground.
 */
const topDown = (height: number, half: number): number[] => {
  const matrix: number[] = Array.from({ length: 16 }, () => 0);
  const set = (row: number, column: number, value: number): void => {
    matrix[column * 4 + row] = value;
  };
  set(0, 0, half); // ndc.x -> world x
  set(1, 2, -height / 2); // ndc.z -> world y, from `height` down to 0
  set(1, 3, height / 2);
  set(2, 1, -half); // ndc.y -> world z, north is -z
  set(3, 3, 1);
  return matrix;
};

/** The same camera turned to look upwards: its ray leaves the ground behind. */
const climbing = (height: number, half: number): number[] => {
  const matrix = topDown(height, half);
  matrix[2 * 4 + 1] = height / 2; // ndc.z now raises y instead of lowering it
  matrix[3 * 4 + 1] = height / 2 + 10; // and the near plane starts above ground
  return matrix;
};

const VIEWPORT = { width: 800, height: 400 };

describe("groundPointAt", () => {
  it("lands the centre of the screen under the camera", () => {
    const point = groundPointAt({ x: 400, y: 200 }, VIEWPORT, topDown(100, 64));
    expect(point?.x).toBeCloseTo(0);
    expect(point?.z).toBeCloseTo(0);
  });

  it("follows the pointer across the ground", () => {
    const matrix = topDown(100, 64);
    const east = groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix);
    const north = groundPointAt({ x: 400, y: 0 }, VIEWPORT, matrix);
    expect(east?.x).toBeCloseTo(64);
    expect(east?.z).toBeCloseTo(0);
    expect(north?.x).toBeCloseTo(0);
    expect(north?.z).toBeCloseTo(-64);
  });

  it("misses when the ray never comes down to the ground", () => {
    // A camera whose ray climbs: the pointer is on the sky above the horizon.
    expect(groundPointAt({ x: 400, y: 200 }, VIEWPORT, climbing(100, 64))).toBeNull();
  });

  it("misses when the view is edge-on to the ground", () => {
    const flat = topDown(100, 64);
    flat[4 * 2 + 1] = 0;
    flat[4 * 3 + 1] = 20; // every point of the ray sits at y = 20
    expect(groundPointAt({ x: 400, y: 200 }, VIEWPORT, flat)).toBeNull();
  });

  it("has nothing to pick in a canvas of no size", () => {
    expect(groundPointAt({ x: 0, y: 0 }, { width: 0, height: 0 }, topDown(100, 64))).toBeNull();
  });

  it("rejects a matrix that is not 4x4", () => {
    expect(() => groundPointAt({ x: 0, y: 0 }, VIEWPORT, [1, 0, 0, 1])).toThrow(/16 elements/);
  });
});

describe("tileOf", () => {
  it("floors a point onto its tile", () => {
    expect(tileOf({ x: 0, z: 0 }, 16)).toEqual({ x: 0, z: 0 });
    expect(tileOf({ x: 15.9, z: 31.2 }, 16)).toEqual({ x: 0, z: 1 });
  });

  it("runs negative off the plot's corner, rather than clamping", () => {
    // The resort may grow west and north of the plan it started with.
    expect(tileOf({ x: -0.5, z: -17 }, 16)).toEqual({ x: -1, z: -2 });
  });
});

describe("pickTile", () => {
  it("gives the tile under the pointer", () => {
    expect(pickTile({ x: 800, y: 200 }, VIEWPORT, topDown(100, 64), 16)).toEqual({ x: 4, z: 0 });
  });

  it("gives nothing when the pointer is off the ground", () => {
    expect(pickTile({ x: 400, y: 200 }, VIEWPORT, climbing(100, 64), 16)).toBeNull();
  });
});
