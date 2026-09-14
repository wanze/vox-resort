/**
 * Pure world-sizing helpers: how much voxel space the laid-out resort needs, and
 * where the camera should start so the whole plot is in frame.
 */

import type { Placement } from './resortLayout';

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

/**
 * Bounds covering every placement plus the tallest object's height.
 *
 * Height is measured off the ground each object stands on, so a bungalow on the
 * top terrace counts for the terrace as well as for itself: it is what the
 * cameras are framed on, and a framing that ignored the terraces would crop the
 * resort at the height of the plot's lowest bench.
 */
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
    height = Math.max(height, placement.y + heightOf(placement.id));
  }
  return { minX, minZ, maxX, maxZ, height };
}

/**
 * The perspective camera's vertical field of view, in degrees. Here rather than
 * with the camera because the resort is framed with it before any camera exists
 * — off the main thread, even. See `resort-prep`.
 */
export const CAMERA_FOV_DEGREES = 55;

/** Longest world dimension: what sizes the ground, the fog and the far plane. */
export function worldExtentOf(bounds: WorldBounds): number {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
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

/** The two ways the resort can be looked at. */
export type CameraMode = 'perspective' | 'isometric';

/**
 * Which corner of the plot the isometric camera stands over, looking across it
 * to the opposite one. North is -z and east is +x, the same compass the plan is
 * laid out on.
 *
 * Corners rather than cardinal points, because that is what makes the view
 * isometric: standing over a corner is what puts two of the world's horizontal
 * axes on screen at the same angle, and a building shows two of its faces
 * instead of one flat elevation.
 */
export type CompassDirection = 'northeast' | 'southeast' | 'southwest' | 'northwest';

/** Clockwise from the north-east, so the index is also the quarter turn. */
export const COMPASS_DIRECTIONS: readonly CompassDirection[] = [
  'northeast',
  'southeast',
  'southwest',
  'northwest',
];

/** The direction a quarter turn (or several) away; negative turns anticlockwise. */
export function turnDirection(from: CompassDirection, quarters: number): CompassDirection {
  const index = COMPASS_DIRECTIONS.indexOf(from);
  const turned = (((index + quarters) % 4) + 4) % 4;
  return COMPASS_DIRECTIONS[turned]!;
}

/**
 * The elevation a true isometric view is drawn at: `atan(1 / sqrt(2))`, the one
 * angle at which all three world axes foreshorten equally — the other half of
 * the same condition the corner azimuth satisfies. Every direction uses it,
 * which is what makes a building the same shape whichever way the plot is
 * turned.
 */
export const ISOMETRIC_ELEVATION_DEGREES = 35.264389682754654;

/** Quarter turns are measured off the north-east corner, 45 degrees round. */
const CORNER_AZIMUTH_RADIANS = Math.PI / 4;

/** How much wider than the plot the view is cut, so labels clear the edge. */
const ISOMETRIC_MARGIN = 1.06;

/** Bounding radii from the target the camera stands back, and the clip planes reach. */
const CAMERA_STANDOFF = 2;
const CLIP_REACH = 10;

/**
 * Where an orthographic camera stands, how much world it must cover and where
 * its clip planes go.
 *
 * `viewWidth` and `viewHeight` are world extents rather than camera bounds
 * because the aspect ratio belongs to the canvas, not to the plot: the adapter
 * fits both into whatever shape the window is. `zoom` then scales them, which is
 * what keeps a resize from undoing a zoom.
 */
export interface OrthographicFraming extends CameraFraming {
  /** World distance the view must cover across the screen. */
  readonly viewWidth: number;
  /** World distance the view must cover up the screen. */
  readonly viewHeight: number;
  readonly near: number;
  readonly far: number;
}

/** A unit direction in world space. */
interface Axis {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How far a box of these extents reaches along an axis. */
function spanAlong(axis: Axis, width: number, height: number, depth: number): number {
  return Math.abs(axis.x) * width + Math.abs(axis.y) * height + Math.abs(axis.z) * depth;
}

/**
 * Frames the plot for an orthographic camera standing over one compass point.
 *
 * An orthographic camera is not framed by standing back — distance does not
 * change what it draws — so this solves the other two things instead: the box of
 * world the projection has to cover, and where the clip planes go.
 *
 * The clip planes are the part worth reading. `nearPlaneFor` in `threeScene.ts`
 * exists because an integer depth buffer spends its precision non-uniformly
 * under perspective; orthographic depth is linear, so there is nothing to buy by
 * cropping the range and a great deal to lose. A near plane in front of the
 * camera cuts into the plot as soon as the view is zoomed out far enough for the
 * plane's own lower edge to drop below the ground — which would take the ground
 * with it, and `groundPointAt` rejects a hit behind the near plane, so placement
 * would silently stop working over part of the map. So both planes are put a
 * plot's diameter clear of anything, in front of the camera *and behind it*, and
 * no zoom, pan or turn can bring the resort near either.
 */
export function isometricFramingFor(
  bounds: WorldBounds,
  direction: CompassDirection,
  elevationDegrees: number = ISOMETRIC_ELEVATION_DEGREES,
): OrthographicFraming {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const height = bounds.height;
  const target = {
    x: bounds.minX + width / 2,
    y: height / 2,
    z: bounds.minZ + depth / 2,
  };

  const azimuth = (COMPASS_DIRECTIONS.indexOf(direction) * Math.PI) / 2 + CORNER_AZIMUTH_RADIANS;
  const elevation = (elevationDegrees * Math.PI) / 180;
  const sinA = Math.sin(azimuth);
  const cosA = Math.cos(azimuth);
  const sinE = Math.sin(elevation);
  const cosE = Math.cos(elevation);

  // The camera's own three axes, as Three.js's `lookAt` would build them: `back`
  // runs from the target out to the camera, `right` across the screen, `up` up
  // it. Azimuth is measured clockwise from north, so the north-east corner is 45
  // degrees; standing there faces south-west, which puts the plot's north-west
  // edge on the right — hence the signs on `right`.
  const back: Axis = { x: sinA * cosE, y: sinE, z: -cosA * cosE };
  const right: Axis = { x: -cosA, y: 0, z: -sinA };
  const up: Axis = { x: -sinA * sinE, y: cosE, z: cosA * sinE };

  const radius = Math.max(Math.hypot(width, height, depth) / 2, 1);
  const distance = radius * CAMERA_STANDOFF;
  const reach = radius * CLIP_REACH;

  return {
    target,
    position: {
      x: target.x + back.x * distance,
      y: target.y + back.y * distance,
      z: target.z + back.z * distance,
    },
    viewWidth: Math.max(spanAlong(right, width, height, depth), 1) * ISOMETRIC_MARGIN,
    viewHeight: Math.max(spanAlong(up, width, height, depth), 1) * ISOMETRIC_MARGIN,
    near: -reach,
    far: reach,
  };
}
