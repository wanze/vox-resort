import type { Vector3 } from '../../lighting/domain/dayNight';
import { normalizeTime } from '../../lighting/domain/dayNight';
import { clockWords } from '../../events/domain/week';

export const PHOTO_FOV = { min: 20, max: 90 } as const;

const MINUTES_PER_DAY = 24 * 60;

const LOOK_STEP_MINUTES = 5;

export interface CameraPose {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly fov: number;
}

// Half a 35 mm frame's 24 mm height: the fov is vertical, as three's is.
const FRAME_HALF_HEIGHT_MM = 12;

// What a photographer would call the lens, so the viewfinder reads like a camera's.
export function focalLength(verticalFovDegrees: number): number {
  const half = (clampFov(verticalFovDegrees) * Math.PI) / 360;
  return Math.round(FRAME_HALF_HEIGHT_MM / Math.tan(half));
}

export function clampFov(degrees: number): number {
  return Math.min(PHOTO_FOV.max, Math.max(PHOTO_FOV.min, degrees));
}

export function snapLookTime(time: number): number {
  const steps = MINUTES_PER_DAY / LOOK_STEP_MINUTES;
  return normalizeTime(Math.round(normalizeTime(time) * steps) / steps);
}

export function timeLabel(time: number): string {
  return clockWords(Math.round(snapLookTime(time) * MINUTES_PER_DAY));
}
