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
