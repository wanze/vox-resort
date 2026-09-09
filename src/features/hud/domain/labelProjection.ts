/**
 * Pure camera projection for the HTML label overlay.
 *
 * The scene renders to a canvas; labels are plain DOM nodes on top of it. Given
 * a world position and the camera's matrices, this works out where the label
 * belongs in CSS pixels — no Three.js types involved.
 *
 * The view and the projection arrive separately rather than multiplied together
 * because depth sorting needs the step between them. Under perspective the
 * homogeneous `w` is the distance along the view direction and would do; under
 * orthographic projection it is 1 for every point in the scene, so a sort keyed
 * on it silently becomes a no-op and the labels stack in whatever order the map
 * happened to iterate. View space is where the two projections still agree.
 */

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface ScreenPosition {
  /** CSS pixels from the left edge of the canvas. */
  readonly x: number;
  /** CSS pixels from the top edge of the canvas. */
  readonly y: number;
  /**
   * Distance along the camera's view direction, whatever the projection.
   *
   * Negative behind the camera, which perspective never shows and an
   * orthographic view legitimately can: its near plane sits behind the eye, so
   * that nothing clips as the view is zoomed out. Sorting still works there —
   * further away is still a larger number.
   */
  readonly depth: number;
}

/**
 * Projects a world point through the camera's view and projection matrices,
 * both column-major, the layout Three.js uses in `Matrix4.elements`.
 *
 * Returns null when the point falls outside the frustum — behind the camera
 * under perspective, or off any side of the view volume under either.
 *
 * Written out rather than run through a matrix helper because this is the
 * render loop: one call per label per frame, and nothing here may allocate.
 */
export function projectToScreen(
  point: Point3,
  view: ArrayLike<number>,
  projection: ArrayLike<number>,
  viewport: Viewport,
): ScreenPosition | null {
  if (view.length < 16 || projection.length < 16) {
    throw new Error('Expected a 4x4 matrix of 16 elements');
  }
  const { x, y, z } = point;
  const viewX = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!;
  const viewY = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!;
  const viewZ = view[2]! * x + view[6]! * y + view[10]! * z + view[14]!;

  const clipX =
    projection[0]! * viewX + projection[4]! * viewY + projection[8]! * viewZ + projection[12]!;
  const clipY =
    projection[1]! * viewX + projection[5]! * viewY + projection[9]! * viewZ + projection[13]!;
  const clipZ =
    projection[2]! * viewX + projection[6]! * viewY + projection[10]! * viewZ + projection[14]!;
  const clipW =
    projection[3]! * viewX + projection[7]! * viewY + projection[11]! * viewZ + projection[15]!;

  // Perspective puts everything behind the eye at a non-positive w, where the
  // divide below is meaningless. Orthographic w is 1 for every point, so this
  // never fires there and the clip-volume test below is what rejects a label.
  if (clipW <= 0) return null;

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1 || ndcZ < -1 || ndcZ > 1) return null;

  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (0.5 - ndcY * 0.5) * viewport.height,
    // The camera looks down its own -z, so this is the distance in front of it.
    depth: -viewZ,
  };
}

/** Sorts visible labels back-to-front so nearer labels draw on top. */
export function sortByDepth<T extends { readonly screen: ScreenPosition }>(
  labels: readonly T[],
): readonly T[] {
  return labels.toSorted((a, b) => b.screen.depth - a.screen.depth);
}
