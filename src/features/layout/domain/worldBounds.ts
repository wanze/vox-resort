/**
 * Pure world-sizing helpers: how much voxel space the laid-out resort needs, and
 * where the camera should start so the whole plot is in frame.
 */

import type { Placement } from "./resortLayout";

export interface WorldBounds {
  readonly minX: number;
  readonly minZ: number;
  /** Exclusive upper bounds. */
  readonly maxX: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface HeightProvider {
  /** Occupied height of the object placed under this id. */
  (id: string): number;
}

/** Bounds covering every placement plus the tallest object's height. */
export function worldBoundsFor(
  placements: readonly Placement[],
  heightOf: HeightProvider,
): WorldBounds {
  if (placements.length === 0) {
    return { minX: 0, minZ: 0, maxX: 0, maxZ: 0, height: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let height = 0;
  for (const placement of placements) {
    minX = Math.min(minX, placement.x);
    minZ = Math.min(minZ, placement.z);
    maxX = Math.max(maxX, placement.x + placement.width);
    maxZ = Math.max(maxZ, placement.z + placement.depth);
    height = Math.max(height, heightOf(placement.id));
  }
  return { minX, minZ, maxX, maxZ, height };
}

/** How much of the fitted distance to actually stand back. */
const FRAMING_FILL = 0.86;

export interface CameraFraming {
  readonly target: { x: number; y: number; z: number };
  readonly position: { x: number; y: number; z: number };
}

/**
 * Places the camera on a diagonal south-east of the plot, far enough out that
 * the plot's diagonal fits the vertical field of view.
 */
export function cameraFramingFor(bounds: WorldBounds, verticalFovDegrees: number): CameraFraming {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const target = {
    x: bounds.minX + width / 2,
    y: bounds.height / 2,
    z: bounds.minZ + depth / 2,
  };
  const extent = Math.max(Math.hypot(width, depth), 1);
  const halfFov = (verticalFovDegrees * Math.PI) / 360;
  // Fit the plot's diagonal into the vertical field of view. The plot is seen
  // at a slant rather than face on, so its on-screen height is well short of
  // that diagonal; FRAMING_FILL takes the slack back out and still leaves the
  // tallest objects and their labels clear of the edge.
  const distance = (extent / 2 / Math.tan(halfFov)) * FRAMING_FILL;
  const direction = { x: 0.62, y: 0.5, z: 0.62 };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return {
    target,
    position: {
      x: target.x + (direction.x / length) * distance,
      y: target.y + (direction.y / length) * distance,
      z: target.z + (direction.z / length) * distance,
    },
  };
}
