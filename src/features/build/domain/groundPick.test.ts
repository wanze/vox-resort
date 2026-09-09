import { describe, expect, it } from "vitest";
import {
  Matrix4,
  OrthographicCamera,
  Vector3,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
  type CoordinateSystem,
} from "three/webgpu";
import type { CompassDirection } from "../../layout/domain/worldBounds";
import { isometricFramingFor } from "../../layout/domain/worldBounds";
import type { GroundPoint, PointerPosition } from "./groundPick";
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

/**
 * The isometric camera, built exactly as `threeScene.ts` builds it, so this
 * exercises the real projection rather than a hand-written stand-in.
 *
 * Picking is projection-agnostic — it unprojects two points and meets the ground
 * between them — but the clip planes are not: `groundPointAt` throws away a hit
 * behind the near plane, so a near plane that cuts into the plot would silently
 * stop placement working over part of the map. That is what these check.
 */
const ISO_BOUNDS = { minX: 0, minZ: 0, maxX: 1792, maxZ: 1600, height: 96 };
const ISO_VIEWPORT = { width: 1600, height: 900 };

/**
 * How the renderer maps clip space onto the depth buffer.
 *
 * `groundPointAt` unprojects the two ends of the NDC depth range and meets the
 * ground between them, so it does not care which end is the near plane — but
 * `along < 0` does, and the renderer picks the convention: WebGPU's range is
 * 0..1 where WebGL's is -1..1, and `reversedDepthBuffer` turns either around.
 * All three are configurations this app actually renders in.
 */
interface DepthConvention {
  readonly label: string;
  readonly coordinateSystem: CoordinateSystem;
  readonly reversed: boolean;
}

const DEPTH_CONVENTIONS: DepthConvention[] = [
  { label: "WebGPU, reversed depth", coordinateSystem: WebGPUCoordinateSystem, reversed: true },
  { label: "WebGPU", coordinateSystem: WebGPUCoordinateSystem, reversed: false },
  { label: "WebGL2 fallback", coordinateSystem: WebGLCoordinateSystem, reversed: false },
];

function isoCamera(
  direction: CompassDirection,
  zoom: number,
  depth: DepthConvention,
): OrthographicCamera {
  const framing = isometricFramingFor(ISO_BOUNDS, direction);
  const aspect = ISO_VIEWPORT.width / ISO_VIEWPORT.height;
  const halfHeight = Math.max(framing.viewHeight / 2, framing.viewWidth / (2 * aspect)) / zoom;
  const camera = new OrthographicCamera();
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);
  camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
  camera.updateMatrixWorld();
  // Built here rather than through `updateProjectionMatrix` because the
  // convention is the renderer's to choose and the camera has no public way to
  // be told which one it is being rendered under.
  camera.projectionMatrix.makeOrthographic(
    -halfHeight * aspect,
    halfHeight * aspect,
    halfHeight,
    -halfHeight,
    framing.near,
    framing.far,
    depth.coordinateSystem,
    depth.reversed,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

/** Where a ground point lands on screen, so a pick can be checked by round trip. */
function screenOf(camera: OrthographicCamera, point: GroundPoint): PointerPosition {
  const projected = new Vector3(point.x, 0, point.z).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * ISO_VIEWPORT.width,
    y: (0.5 - projected.y * 0.5) * ISO_VIEWPORT.height,
  };
}

const inverseOf = (camera: OrthographicCamera): number[] =>
  new Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .invert()
    .elements.slice();

/** Nine points spread over the canvas, corners and edges included. */
const POINTERS: PointerPosition[] = [0.02, 0.5, 0.98].flatMap((fx) =>
  [0.02, 0.5, 0.98].map((fy) => ({
    x: fx * ISO_VIEWPORT.width,
    y: fy * ISO_VIEWPORT.height,
  })),
);

const DIRECTIONS: CompassDirection[] = ["northeast", "southeast", "southwest", "northwest"];
const ZOOMS = [0.25, 1, 4];

describe.each(DEPTH_CONVENTIONS)("groundPointAt under an orthographic camera ($label)", (depth) => {
  it("hits the ground everywhere on the canvas, at every direction and zoom", () => {
    for (const direction of DIRECTIONS) {
      for (const zoom of ZOOMS) {
        const camera = isoCamera(direction, zoom, depth);
        const inverse = inverseOf(camera);
        for (const pointer of POINTERS) {
          const point = groundPointAt(pointer, ISO_VIEWPORT, inverse);
          expect(
            point,
            `${direction} at zoom ${zoom}, pointer ${pointer.x},${pointer.y}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it("lands the hit back under the pointer that asked for it", () => {
    for (const direction of DIRECTIONS) {
      for (const zoom of ZOOMS) {
        const camera = isoCamera(direction, zoom, depth);
        const inverse = inverseOf(camera);
        for (const pointer of POINTERS) {
          const point = groundPointAt(pointer, ISO_VIEWPORT, inverse)!;
          const back = screenOf(camera, point);
          expect(back.x).toBeCloseTo(pointer.x, 3);
          expect(back.y).toBeCloseTo(pointer.y, 3);
        }
      }
    }
  });

  it("puts the middle of the screen on the middle of the plot", () => {
    const middle = { x: ISO_VIEWPORT.width / 2, y: ISO_VIEWPORT.height / 2 };
    for (const direction of DIRECTIONS) {
      const point = groundPointAt(middle, ISO_VIEWPORT, inverseOf(isoCamera(direction, 1, depth)))!;
      // The camera aims half the plot's height up, so the ground under the
      // centre pixel is a little short of the middle along the view axis.
      expect(point.x).toBeGreaterThan(ISO_BOUNDS.minX);
      expect(point.x).toBeLessThan(ISO_BOUNDS.maxX);
      expect(point.z).toBeGreaterThan(ISO_BOUNDS.minZ);
      expect(point.z).toBeLessThan(ISO_BOUNDS.maxZ);
    }
  });

  it("picks every tile of the plot, whichever way the camera faces", () => {
    for (const direction of DIRECTIONS) {
      const camera = isoCamera(direction, 1, depth);
      const inverse = inverseOf(camera);
      for (const corner of [
        { x: ISO_BOUNDS.minX + 8, z: ISO_BOUNDS.minZ + 8 },
        { x: ISO_BOUNDS.maxX - 8, z: ISO_BOUNDS.minZ + 8 },
        { x: ISO_BOUNDS.minX + 8, z: ISO_BOUNDS.maxZ - 8 },
        { x: ISO_BOUNDS.maxX - 8, z: ISO_BOUNDS.maxZ - 8 },
      ]) {
        const picked = groundPointAt(screenOf(camera, corner), ISO_VIEWPORT, inverse);
        expect(picked?.x).toBeCloseTo(corner.x, 3);
        expect(picked?.z).toBeCloseTo(corner.z, 3);
      }
    }
  });
});
