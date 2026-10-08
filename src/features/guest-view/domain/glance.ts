import type { ViewMode } from './followRig';

const YAW_PER_PIXEL = 0.005;
const PITCH_PER_PIXEL = 0.004;
// Positive raises the camera, or looks down through the eyes; first person may look up further,
// at the lanterns.
const PITCH_LIMITS: { readonly [view in ViewMode]: readonly [number, number] } = {
  first: [-0.6, 0.5],
  third: [-0.3, 0.9],
};
const ZOOM_LIMITS = [0.5, 3] as const;
const SPRING_AFTER_SECONDS = 2;
const SPRING_HALF_LIFE = 0.6;

// `idle` is seconds since the last drag or zoom.
export interface Glance {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
  readonly idle: number;
}

export const STILL_GLANCE: Glance = { yaw: 0, pitch: 0, zoom: 1, idle: 0 };

const clamp = (value: number, [low, high]: readonly [number, number]): number =>
  Math.min(high, Math.max(low, value));

// Signed as the orbit controls are, so a drag turns the view the way a drag turns it elsewhere.
export function dragged(glance: Glance, dx: number, dy: number, view: ViewMode): Glance {
  return {
    yaw: glance.yaw - dx * YAW_PER_PIXEL,
    pitch: clamp(glance.pitch + dy * PITCH_PER_PIXEL, PITCH_LIMITS[view]),
    zoom: glance.zoom,
    idle: 0,
  };
}

export function zoomed(glance: Glance, factor: number): Glance {
  if (!(factor > 0)) return glance;
  return { ...glance, zoom: clamp(glance.zoom * factor, ZOOM_LIMITS), idle: 0 };
}

// Only the share of `dt` past the idle threshold springs back, so a long frame does not overshoot.
export function relaxed(glance: Glance, dt: number): Glance {
  if (!(dt > 0)) return glance;
  const idle = glance.idle + dt;
  const springing = idle - Math.max(glance.idle, SPRING_AFTER_SECONDS);
  if (springing <= 0) return { ...glance, idle };
  const kept = 2 ** (-springing / SPRING_HALF_LIFE);
  return { yaw: glance.yaw * kept, pitch: glance.pitch * kept, zoom: glance.zoom, idle };
}

// A pitch allowed in one view may be past the other's limits.
export function turnedTo(glance: Glance, view: ViewMode): Glance {
  return { ...glance, pitch: clamp(glance.pitch, PITCH_LIMITS[view]) };
}
