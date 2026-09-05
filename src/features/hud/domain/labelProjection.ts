/**
 * Pure camera projection for the HTML label overlay.
 *
 * The scene renders to a canvas; labels are plain DOM nodes on top of it. Given
 * a world position and the camera's view-projection matrix, this works out
 * where the label belongs in CSS pixels — no Three.js types involved.
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
  /** Distance along the camera's view direction, for depth sorting. */
  readonly depth: number;
}

/**
 * Projects a world point with a column-major 4x4 view-projection matrix, the
 * layout Three.js uses in `Matrix4.elements`.
 *
 * Returns null when the point sits behind the camera or outside the frustum.
 */
export function projectToScreen(
  point: Point3,
  viewProjection: ArrayLike<number>,
  viewport: Viewport,
): ScreenPosition | null {
  if (viewProjection.length < 16) throw new Error("Expected a 4x4 matrix of 16 elements");
  const { x, y, z } = point;
  const clipX =
    viewProjection[0]! * x + viewProjection[4]! * y + viewProjection[8]! * z + viewProjection[12]!;
  const clipY =
    viewProjection[1]! * x + viewProjection[5]! * y + viewProjection[9]! * z + viewProjection[13]!;
  const clipZ =
    viewProjection[2]! * x + viewProjection[6]! * y + viewProjection[10]! * z + viewProjection[14]!;
  const clipW =
    viewProjection[3]! * x + viewProjection[7]! * y + viewProjection[11]! * z + viewProjection[15]!;

  if (clipW <= 0) return null;

  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1 || ndcZ < -1 || ndcZ > 1) return null;

  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (0.5 - ndcY * 0.5) * viewport.height,
    depth: clipW,
  };
}

/** Sorts visible labels back-to-front so nearer labels draw on top. */
export function sortByDepth<T extends { readonly screen: ScreenPosition }>(
  labels: readonly T[],
): readonly T[] {
  return labels.toSorted((a, b) => b.screen.depth - a.screen.depth);
}
