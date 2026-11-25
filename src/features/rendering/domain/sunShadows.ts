import type { Vector3 } from '../../lighting/domain/dayNight';

const SHADOW_QUALITIES = ['low', 'high'] as const;

// Low is the blobs; high is a shadow map drawn every frame. A map drawn only on change
// was tried: its shadows visibly lagged the sun and the camera.
export type ShadowQuality = (typeof SHADOW_QUALITIES)[number];

export const isShadowQuality = (value: unknown): value is ShadowQuality =>
  (SHADOW_QUALITIES as readonly unknown[]).includes(value);

// A browser that will not say, or says nonsense, answers null rather than a guess.
export const knownCount = (value: unknown): number | null =>
  typeof value === 'number' && value > 0 ? value : null;

export interface DeviceFacts {
  readonly coarsePointer: boolean;
  readonly webgpu: boolean;
  // Null where the browser does not say, as Safari and Firefox never give the memory.
  readonly cores: number | null;
  readonly memoryGb: number | null;
}

// A phone or tablet, the WebGL2 fallback or a small machine pays far more for the map than it
// shows, and the blobs already read well there.
const SMALL_MACHINE = 4;

export function deviceShadowQuality(device: DeviceFacts): ShadowQuality {
  if (device.coarsePointer || !device.webgpu) return 'low';
  if (device.cores !== null && device.cores <= SMALL_MACHINE) return 'low';
  if (device.memoryGb !== null && device.memoryGb <= SMALL_MACHINE) return 'low';
  return 'high';
}

export function shadowQualityFor(chosen: ShadowQuality | null, device: DeviceFacts): ShadowQuality {
  return chosen ?? deviceShadowQuality(device);
}

// At 1 a shadow leaves only the ambient, which darkened the whole plot; picked by eye.
export const SHADOW_STRENGTH = 0.6;

// Half a tile: lower pieces (paths, beds, benches, kerbs) throw a shadow that mostly
// lands under themselves, yet each is a bucket and so a draw in the shadow pass.
export const SUN_CASTER_HEIGHT = 8;

export const castsSunShadow = (height: number): boolean => height >= SUN_CASTER_HEIGHT;

export const SHADOW_MAP_SIZE = 4096;

const MIN_HALF_SIZE = 64;
const MAX_HALF_SIZE = 2048;

// Box sizes come in steps, so a zoom does not move the texel grid every frame.
const SIZE_STEP = 1.25;

// Past the furthest ground in view, so shadows cast from just off screen still land on it.
const REACH_MARGIN = 1.1;
const REACH_SLACK = 32;

export interface ShadowView {
  readonly target: Vector3;
  // The furthest ground in view from the target, which a tilted camera puts at the bottom corners
  // rather than half a screen width away.
  readonly reach: number;
}

export interface Ray {
  readonly origin: Vector3;
  readonly direction: Vector3;
}

// Rays through the screen's corners, met with the target's level. One that never comes down to it
// looks at the horizon and gets the cap.
export function groundReach(target: Vector3, corners: readonly Ray[], cap: number): number {
  let reach = 0;
  for (const { origin, direction } of corners) {
    if (direction.y >= 0) return cap;
    const along = (target.y - origin.y) / direction.y;
    const x = origin.x + direction.x * along - target.x;
    const z = origin.z + direction.z * along - target.z;
    reach = Math.max(reach, Math.hypot(x, z));
  }
  return Math.min(cap, reach);
}

export interface ShadowFrame {
  readonly focus: Vector3;
  readonly halfSize: number;
  readonly sun: Vector3;
}

export function halfSizeFor(reach: number): number {
  const wanted = Math.min(
    MAX_HALF_SIZE,
    Math.max(MIN_HALF_SIZE, reach * REACH_MARGIN + REACH_SLACK),
  );
  const steps = Math.ceil(Math.log(wanted / MIN_HALF_SIZE) / Math.log(SIZE_STEP) - 1e-9);
  return Math.min(MAX_HALF_SIZE, MIN_HALF_SIZE * SIZE_STEP ** steps);
}

const dot = (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const normalized = (v: Vector3): Vector3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length === 0 ? v : { x: v.x / length, y: v.y / length, z: v.z / length };
};

// Three.js's own lookAt basis, nudge included, so a snapped focus lands on its texel grid.
export function lightBasis(sun: Vector3): { right: Vector3; up: Vector3; back: Vector3 } {
  let back = normalized(Math.hypot(sun.x, sun.y, sun.z) === 0 ? { x: 0, y: 0, z: 1 } : sun);
  const worldUp = { x: 0, y: 1, z: 0 };
  let right = cross(worldUp, back);
  if (Math.hypot(right.x, right.y, right.z) === 0) {
    back = normalized({ ...back, z: back.z + 0.0001 });
    right = cross(worldUp, back);
  }
  right = normalized(right);
  return { right, up: cross(back, right), back };
}

// Snapped to whole texels across the light, or every pan crawls the shadow edges.
export function shadowFrameFor(view: ShadowView, sun: Vector3): ShadowFrame {
  const halfSize = halfSizeFor(view.reach);
  const texel = (halfSize * 2) / SHADOW_MAP_SIZE;
  const { right, up, back } = lightBasis(sun);
  const along = (axis: Vector3): number => Math.round(dot(view.target, axis) / texel) * texel;
  const x = along(right);
  const y = along(up);
  const z = dot(view.target, back);
  return {
    focus: {
      x: right.x * x + up.x * y + back.x * z,
      y: right.y * x + up.y * y + back.y * z,
      z: right.z * x + up.z * y + back.z * z,
    },
    halfSize,
    sun,
  };
}
