import { describe, expect, it } from 'vitest';
import {
  Matrix4,
  OrthographicCamera,
  Vector3,
  WebGLCoordinateSystem,
  WebGPUCoordinateSystem,
  type CoordinateSystem,
} from 'three/webgpu';
import type { CompassDirection } from '../../layout/domain/worldBounds';
import { isometricFramingFor } from '../../layout/domain/worldBounds';
import type { GroundPoint, PointerPosition } from './groundPick';
import { groundPointAt, pickTile, tileOf, type PickGround } from './groundPick';

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

describe('groundPointAt', () => {
  it('lands the centre of the screen under the camera', () => {
    const point = groundPointAt({ x: 400, y: 200 }, VIEWPORT, topDown(100, 64));
    expect(point?.x).toBeCloseTo(0);
    expect(point?.z).toBeCloseTo(0);
  });

  it('follows the pointer across the ground', () => {
    const matrix = topDown(100, 64);
    const east = groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix);
    const north = groundPointAt({ x: 400, y: 0 }, VIEWPORT, matrix);
    expect(east?.x).toBeCloseTo(64);
    expect(east?.z).toBeCloseTo(0);
    expect(north?.x).toBeCloseTo(0);
    expect(north?.z).toBeCloseTo(-64);
  });

  it('misses when the ray never comes down to the ground', () => {
    // A camera whose ray climbs: the pointer is on the sky above the horizon.
    expect(groundPointAt({ x: 400, y: 200 }, VIEWPORT, climbing(100, 64))).toBeNull();
  });

  it('misses when the view is edge-on to the ground', () => {
    const flat = topDown(100, 64);
    flat[4 * 2 + 1] = 0;
    flat[4 * 3 + 1] = 20; // every point of the ray sits at y = 20
    expect(groundPointAt({ x: 400, y: 200 }, VIEWPORT, flat)).toBeNull();
  });

  it('has nothing to pick in a canvas of no size', () => {
    expect(groundPointAt({ x: 0, y: 0 }, { width: 0, height: 0 }, topDown(100, 64))).toBeNull();
  });

  it('rejects a matrix that is not 4x4', () => {
    expect(() => groundPointAt({ x: 0, y: 0 }, VIEWPORT, [1, 0, 0, 1])).toThrow(/16 elements/);
  });
});

describe('tileOf', () => {
  it('floors a point onto its tile', () => {
    expect(tileOf({ x: 0, z: 0 }, 16)).toEqual({ x: 0, z: 0 });
    expect(tileOf({ x: 15.9, z: 31.2 }, 16)).toEqual({ x: 0, z: 1 });
  });

  it("runs negative off the plot's corner, rather than clamping", () => {
    // The resort may grow west and north of the plan it started with.
    expect(tileOf({ x: -0.5, z: -17 }, 16)).toEqual({ x: -1, z: -2 });
  });
});

describe('pickTile', () => {
  it('gives the tile under the pointer', () => {
    expect(pickTile({ x: 800, y: 200 }, VIEWPORT, topDown(100, 64), 16)).toEqual({ x: 4, z: 0 });
  });

  it('gives nothing when the pointer is off the ground', () => {
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
  { label: 'WebGPU, reversed depth', coordinateSystem: WebGPUCoordinateSystem, reversed: true },
  { label: 'WebGPU', coordinateSystem: WebGPUCoordinateSystem, reversed: false },
  { label: 'WebGL2 fallback', coordinateSystem: WebGLCoordinateSystem, reversed: false },
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
function screenOf(camera: OrthographicCamera, point: GroundPoint, height = 0): PointerPosition {
  const projected = new Vector3(point.x, height, point.z).project(camera);
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

const DIRECTIONS: CompassDirection[] = ['northeast', 'southeast', 'southwest', 'northwest'];
const ZOOMS = [0.25, 1, 4];

describe.each(DEPTH_CONVENTIONS)('groundPointAt under an orthographic camera ($label)', (depth) => {
  it('hits the ground everywhere on the canvas, at every direction and zoom', () => {
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

  it('lands the hit back under the pointer that asked for it', () => {
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

  it('puts the middle of the screen on the middle of the plot', () => {
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

  it('picks every tile of the plot, whichever way the camera faces', () => {
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

describe('pickTile over terraced ground', () => {
  /** Land that rises one level north of z = 0, and another north of z = -160. */
  const benched: PickGround = {
    levelOf: (_tileX, tileZ) => (tileZ < -10 ? 2 : tileZ < 0 ? 1 : 0),
    maxLevel: 2,
  };

  it('aims at sea level when the plot is flat', () => {
    const flat: PickGround = { levelOf: () => 0, maxLevel: 0 };
    const pointer = { x: 800, y: 200 };
    expect(pickTile(pointer, VIEWPORT, topDown(100, 64), 16, flat)).toEqual(
      pickTile(pointer, VIEWPORT, topDown(100, 64), 16),
    );
  });

  it('lands on the terrace under the pointer, not on the plane beneath it', () => {
    // Straight down, so every level projects to the same column and the answer
    // is decided purely by which level the tile is actually on.
    // Wide enough to reach past both step lines: the top of the screen is
    // twenty tiles north, the bottom twenty south.
    const matrix = topDown(400, 320);
    const high = pickTile({ x: 400, y: 0 }, VIEWPORT, matrix, 16, benched);
    expect({ tile: high, level: high && benched.levelOf(high.x, high.z) }).toEqual({
      tile: { x: 0, z: -20 },
      level: 2,
    });
    const low = pickTile({ x: 400, y: 400 }, VIEWPORT, matrix, 16, benched);
    expect({ tile: low, level: low && benched.levelOf(low.x, low.z) }).toEqual({
      tile: { x: 0, z: 20 },
      level: 0,
    });
  });

  it('gives back the tile whose own surface was aimed at, from every direction', () => {
    // The property that makes the pointer usable: click a bench and you get the
    // tile you clicked, not the one the sea-level plane happens to lie under.
    // Every tile's top is visible here — the land rises away from the camera, so
    // no bench hides the ground in front of it.
    for (const direction of DIRECTIONS) {
      const camera = isoCamera(direction, 1, DEPTH_CONVENTIONS[0]!);
      const inverse = inverseOf(camera);
      for (const tile of [
        { x: 2, z: 4 },
        { x: 5, z: 0 },
        { x: 3, z: -1 },
        { x: 1, z: -6 },
        { x: 4, z: -11 },
        { x: 0, z: -20 },
      ]) {
        const level = benched.levelOf(tile.x, tile.z);
        const middle = { x: (tile.x + 0.5) * 16, z: (tile.z + 0.5) * 16 };
        const pointer = screenOf(camera, middle, level * 8);
        expect({
          direction,
          tile,
          picked: pickTile(pointer, ISO_VIEWPORT, inverse, 16, benched),
        }).toEqual({ direction, tile, picked: tile });
      }
    }
  });

  it('reports no pick at all when no level holds the ground it crossed', () => {
    // What a ray grazing a riser comes to. The sea-level tile behind it would be
    // the wrong answer, not a lesser one: it is where the object would be built.
    const impossible: PickGround = { levelOf: () => 2, maxLevel: 1 };
    expect(pickTile({ x: 400, y: 200 }, VIEWPORT, topDown(100, 64), 16, impossible)).toBeNull();
  });

  it('prefers the higher bench where two levels both claim the ray', () => {
    // Top down, both crossings land on the same tile, so the walk has to be the
    // thing that decides — and it has to decide upwards.
    const everywhere: PickGround = { levelOf: () => 2, maxLevel: 2 };
    const tile = pickTile({ x: 400, y: 200 }, VIEWPORT, topDown(400, 64), 16, everywhere);
    expect(tile).not.toBeNull();
  });
});

describe('groundPointAt at a height', () => {
  it('solves against the plane it was asked for', () => {
    // Straight down from 400, so the crossing is directly under the pointer
    // whichever plane it is: what changes is nothing but the plane.
    const matrix = topDown(400, 64);
    const sea = groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix, 0);
    const bench = groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix, 8);
    expect(sea?.x).toBeCloseTo(64);
    expect(bench?.x).toBeCloseTo(64);
  });

  it('moves the crossing towards the camera as the plane rises', () => {
    // An oblique ray meets a higher plane earlier, which is the whole reason the
    // levels have to be tried separately rather than solved once.
    const camera = isoCamera('southeast', 1, DEPTH_CONVENTIONS[0]!);
    const inverse = inverseOf(camera);
    const pointer = { x: ISO_VIEWPORT.width / 2, y: ISO_VIEWPORT.height / 2 };
    const sea = groundPointAt(pointer, ISO_VIEWPORT, inverse, 0)!;
    const bench = groundPointAt(pointer, ISO_VIEWPORT, inverse, 32)!;
    // The camera stands to the south-east, so earlier is further south and east.
    expect(bench.z).toBeGreaterThan(sea.z);
    expect(bench.x).toBeGreaterThan(sea.x);
  });

  it('still defaults to sea level', () => {
    const matrix = topDown(100, 64);
    expect(groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix)).toEqual(
      groundPointAt({ x: 800, y: 200 }, VIEWPORT, matrix, 0),
    );
  });
});
