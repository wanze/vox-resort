import { describe, expect, it } from "vitest";
import { projectToScreen, sortByDepth, type ScreenPosition } from "./labelProjection";

/**
 * Column-major view-projection for a camera at the origin looking down -z,
 * with a 90 degree vertical field of view and a square aspect ratio.
 */
const NEAR = 1;
const FAR = 100;
const lookDownNegativeZ: number[] = [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  -(FAR + NEAR) / (FAR - NEAR),
  -1,
  0,
  0,
  (-2 * FAR * NEAR) / (FAR - NEAR),
  0,
];

const viewport = { width: 800, height: 600 };

describe("projectToScreen", () => {
  it("puts a point straight ahead in the middle of the viewport", () => {
    const screen = projectToScreen({ x: 0, y: 0, z: -10 }, lookDownNegativeZ, viewport);
    expect(screen?.x).toBeCloseTo(400);
    expect(screen?.y).toBeCloseTo(300);
  });

  it("maps +y in the world to the upper half of the screen", () => {
    const screen = projectToScreen({ x: 0, y: 3, z: -10 }, lookDownNegativeZ, viewport);
    expect(screen!.y).toBeLessThan(300);
  });

  it("maps +x in the world to the right half of the screen", () => {
    const screen = projectToScreen({ x: 3, y: 0, z: -10 }, lookDownNegativeZ, viewport);
    expect(screen!.x).toBeGreaterThan(400);
  });

  it("reports depth that grows with distance", () => {
    const near = projectToScreen({ x: 0, y: 0, z: -5 }, lookDownNegativeZ, viewport)!;
    const far = projectToScreen({ x: 0, y: 0, z: -50 }, lookDownNegativeZ, viewport)!;
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("hides points behind the camera", () => {
    expect(projectToScreen({ x: 0, y: 0, z: 10 }, lookDownNegativeZ, viewport)).toBeNull();
  });

  it("hides points outside the frustum sides", () => {
    expect(projectToScreen({ x: 100, y: 0, z: -10 }, lookDownNegativeZ, viewport)).toBeNull();
  });

  it("hides points beyond the far plane", () => {
    expect(projectToScreen({ x: 0, y: 0, z: -1000 }, lookDownNegativeZ, viewport)).toBeNull();
  });

  it("rejects a malformed matrix", () => {
    expect(() => projectToScreen({ x: 0, y: 0, z: -1 }, [1, 0, 0], viewport)).toThrow();
  });
});

const at = (depth: number): { id: string; screen: ScreenPosition } => ({
  id: `d${depth}`,
  screen: { x: 0, y: 0, depth },
});

describe("sortByDepth", () => {
  it("orders labels far to near", () => {
    expect(sortByDepth([at(5), at(50), at(20)]).map((label) => label.id)).toEqual([
      "d50",
      "d20",
      "d5",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [at(1), at(9)];
    sortByDepth(input);
    expect(input.map((label) => label.id)).toEqual(["d1", "d9"]);
  });
});
