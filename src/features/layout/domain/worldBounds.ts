import type { Placement } from './resortLayout';

export interface WorldBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface HeightProvider {
  (id: string): number;
}

// Height includes the ground each object stands on, or the framing would crop the
// terraces.
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

// Lives here, not with the camera: the resort is framed before any camera exists,
// off the main thread.
export const CAMERA_FOV_DEGREES = 55;

export function worldExtentOf(bounds: WorldBounds): number {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
}

const FRAMING_FILL = 0.86;

export interface CameraFraming {
  readonly target: { x: number; y: number; z: number };
  readonly position: { x: number; y: number; z: number };
}

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
  // The plot is seen at a slant, so its on-screen height is short of the diagonal;
  // FRAMING_FILL takes that slack back out.
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

export type CameraMode = 'perspective' | 'isometric';

// Corners rather than cardinal points, which is what makes the view isometric.
// North is -z and east is +x.
export type CompassDirection = 'northeast' | 'southeast' | 'southwest' | 'northwest';

// Clockwise from the north-east, so the index is also the quarter turn.
export const COMPASS_DIRECTIONS: readonly CompassDirection[] = [
  'northeast',
  'southeast',
  'southwest',
  'northwest',
];

export function turnDirection(from: CompassDirection, quarters: number): CompassDirection {
  const index = COMPASS_DIRECTIONS.indexOf(from);
  const turned = (((index + quarters) % 4) + 4) % 4;
  return COMPASS_DIRECTIONS[turned]!;
}

// atan(1 / sqrt(2)): the one elevation at which all three axes foreshorten equally.
export const ISOMETRIC_ELEVATION_DEGREES = 35.264389682754654;

const CORNER_AZIMUTH_RADIANS = Math.PI / 4;

const ISOMETRIC_MARGIN = 1.06;

const CAMERA_STANDOFF = 2;
const CLIP_REACH = 10;

// World extents rather than camera bounds: the aspect ratio belongs to the canvas,
// and zoom scales them so a resize does not undo a zoom.
export interface OrthographicFraming extends CameraFraming {
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly near: number;
  readonly far: number;
}

interface Axis {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function spanAlong(axis: Axis, width: number, height: number, depth: number): number {
  return Math.abs(axis.x) * width + Math.abs(axis.y) * height + Math.abs(axis.z) * depth;
}

// Orthographic depth is linear, so a tight clip range buys nothing, and a near plane
// cutting into the ground would break `groundPointAt`. Both planes sit a plot's
// diameter clear, in front and behind.
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

  // Axes as Three.js `lookAt` builds them. Azimuth runs clockwise from north, so the
  // north-east camera faces south-west, hence the signs on `right`.
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
