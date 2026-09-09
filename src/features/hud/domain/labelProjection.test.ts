import { describe, expect, it } from "vitest";
import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from "three/webgpu";
import { projectToScreen, sortByDepth, type ScreenPosition } from "./labelProjection";

const viewport = { width: 800, height: 600 };

/** A camera's two matrices, as `projectToScreen` takes them. */
function matricesOf(camera: PerspectiveCamera | OrthographicCamera) {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { view: camera.matrixWorldInverse.elements, projection: camera.projectionMatrix.elements };
}

/** At the origin looking down -z, 90 degrees of vertical field of view. */
function perspective() {
  const camera = new PerspectiveCamera(90, viewport.width / viewport.height, 1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(new Vector3(0, 0, -1));
  return matricesOf(camera);
}

/**
 * The isometric case: an orthographic camera whose near plane sits behind it,
 * which is what `isometricFramingFor` sets up so that no zoom can clip the plot.
 */
function orthographic(near = -100, far = 100) {
  const camera = new OrthographicCamera(-40, 40, 30, -30, near, far);
  camera.position.set(0, 0, 0);
  camera.lookAt(new Vector3(0, 0, -1));
  return matricesOf(camera);
}

/** The identity view, for the hand-written matrices below. */
const IDENTITY = new Matrix4().elements;

describe("projectToScreen", () => {
  it("puts a point straight ahead in the middle of the viewport", () => {
    const { view, projection } = perspective();
    const screen = projectToScreen({ x: 0, y: 0, z: -10 }, view, projection, viewport);
    expect(screen?.x).toBeCloseTo(400);
    expect(screen?.y).toBeCloseTo(300);
  });

  it("maps +y in the world to the upper half of the screen", () => {
    const { view, projection } = perspective();
    expect(projectToScreen({ x: 0, y: 3, z: -10 }, view, projection, viewport)!.y).toBeLessThan(
      300,
    );
  });

  it("maps +x in the world to the right half of the screen", () => {
    const { view, projection } = perspective();
    expect(projectToScreen({ x: 3, y: 0, z: -10 }, view, projection, viewport)!.x).toBeGreaterThan(
      400,
    );
  });

  it("reports depth that grows with distance under perspective", () => {
    const { view, projection } = perspective();
    const near = projectToScreen({ x: 0, y: 0, z: -5 }, view, projection, viewport)!;
    const far = projectToScreen({ x: 0, y: 0, z: -50 }, view, projection, viewport)!;
    expect(near.depth).toBeCloseTo(5);
    expect(far.depth).toBeCloseTo(50);
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("hides points behind the camera", () => {
    const { view, projection } = perspective();
    expect(projectToScreen({ x: 0, y: 0, z: 10 }, view, projection, viewport)).toBeNull();
  });

  it("hides points outside the frustum sides", () => {
    const { view, projection } = perspective();
    expect(projectToScreen({ x: 100, y: 0, z: -10 }, view, projection, viewport)).toBeNull();
  });

  it("hides points beyond the far plane", () => {
    const { view, projection } = perspective();
    expect(projectToScreen({ x: 0, y: 0, z: -1000 }, view, projection, viewport)).toBeNull();
  });

  it("rejects a malformed matrix", () => {
    expect(() => projectToScreen({ x: 0, y: 0, z: -1 }, [1, 0, 0], IDENTITY, viewport)).toThrow();
    expect(() => projectToScreen({ x: 0, y: 0, z: -1 }, IDENTITY, [1, 0, 0], viewport)).toThrow();
  });

  describe("under an orthographic projection", () => {
    it("puts a point straight ahead in the middle of the viewport", () => {
      const { view, projection } = orthographic();
      const screen = projectToScreen({ x: 0, y: 0, z: -10 }, view, projection, viewport);
      expect(screen?.x).toBeCloseTo(400);
      expect(screen?.y).toBeCloseTo(300);
    });

    it("does not shrink with distance, which is the point of it", () => {
      const { view, projection } = orthographic();
      const near = projectToScreen({ x: 20, y: 0, z: -5 }, view, projection, viewport)!;
      const far = projectToScreen({ x: 20, y: 0, z: -80 }, view, projection, viewport)!;
      expect(far.x).toBeCloseTo(near.x);
    });

    it("still reports depth that grows with distance", () => {
      // The homogeneous w is 1 for every point here, so a depth taken from it
      // would be flat and `sortByDepth` would stop ordering anything.
      const { view, projection } = orthographic();
      const near = projectToScreen({ x: 0, y: 0, z: -5 }, view, projection, viewport)!;
      const far = projectToScreen({ x: 0, y: 0, z: -80 }, view, projection, viewport)!;
      expect(near.depth).toBeCloseTo(5);
      expect(far.depth).toBeCloseTo(80);
      expect(far.depth).toBeGreaterThan(near.depth);
    });

    it("sorts a whole row of labels back to front", () => {
      const { view, projection } = orthographic();
      const labels = [-10, -70, -40].map((z) => ({
        id: `z${z}`,
        screen: projectToScreen({ x: 0, y: 0, z }, view, projection, viewport)!,
      }));
      expect(sortByDepth(labels).map((label) => label.id)).toEqual(["z-70", "z-40", "z-10"]);
    });

    it("still rejects labels off the sides of the view volume", () => {
      const { view, projection } = orthographic();
      expect(projectToScreen({ x: 200, y: 0, z: -10 }, view, projection, viewport)).toBeNull();
      expect(projectToScreen({ x: 0, y: 200, z: -10 }, view, projection, viewport)).toBeNull();
    });

    it("rejects labels past either clip plane, where w can no longer say so", () => {
      const { view, projection } = orthographic();
      expect(projectToScreen({ x: 0, y: 0, z: -200 }, view, projection, viewport)).toBeNull();
      // Behind the near plane, which here sits behind the camera itself.
      expect(projectToScreen({ x: 0, y: 0, z: 200 }, view, projection, viewport)).toBeNull();
    });

    it("shows what stands behind the camera but in front of the near plane", () => {
      // The isometric near plane is deliberately behind the eye; a label there
      // is drawn, and its negative depth still sorts behind everything ahead.
      const { view, projection } = orthographic();
      const behind = projectToScreen({ x: 0, y: 0, z: 50 }, view, projection, viewport);
      expect(behind).not.toBeNull();
      expect(behind!.depth).toBeCloseTo(-50);
    });
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
