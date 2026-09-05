/**
 * The day/night cycle, as pure arithmetic.
 *
 * Time runs 0..1 through one day: 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75
 * sunset. Everything the scene needs is derived from the sun's elevation — the
 * sun's own direction and colour, how much ambient sky light there is, what the
 * background fades to, and how strongly the lamps placed around the resort burn.
 *
 * Nothing here touches Three.js, so the curve can be tuned against a test rather
 * than against a frame.
 */

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SkyState {
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /** Unit vector pointing from the world towards the sun. */
  readonly sunDirection: Vector3;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly ambientColor: number;
  readonly ambientIntensity: number;
  /** Background and fog colour. */
  readonly skyColor: number;
  /** How brightly the placed lights burn: 0 in daylight, 1 after dark. */
  readonly lampFactor: number;
}

const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Wraps any time onto 0..1, so a slider or a clock can run past midnight. */
export function normalizeTime(time: number): number {
  const wrapped = time % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Blends two packed `0xRRGGBB` colours; `t` is clamped to 0..1. */
export function mixColor(from: number, to: number, t: number): number {
  const amount = clamp01(t);
  let mixed = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    mixed |= Math.round(a + (b - a) * amount) << shift;
  }
  return mixed >>> 0;
}

/** Smooth 0..1 ramp, so nothing switches on abruptly at the horizon. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const SKY_NIGHT = 0x070b16;
const SKY_TWILIGHT = 0xd97a4a;
const SKY_DAY = 0x8fc6e8;
const SUN_LOW = 0xffb066;
const SUN_HIGH = 0xfff4e0;
const AMBIENT_NIGHT = 0x2b3a5c;
const AMBIENT_DAY = 0xc3d9f5;

/** Everything the scene's lighting needs for one moment of the day. */
export function skyStateFor(time: number): SkyState {
  const normalized = normalizeTime(time);
  // Angle 0 at sunrise, so elevation is simply its sine.
  const angle = (normalized - 0.25) * TAU;
  const elevation = Math.sin(angle);
  const length = Math.hypot(Math.cos(angle), elevation, 0.35);

  const day = smoothstep(-0.05, 0.25, elevation);
  const twilight = smoothstep(-0.28, 0.02, elevation) * (1 - smoothstep(0.02, 0.3, elevation));

  return {
    time: normalized,
    sunDirection: {
      x: Math.cos(angle) / length,
      y: elevation / length,
      z: 0.35 / length,
    },
    sunColor: mixColor(SUN_LOW, SUN_HIGH, smoothstep(0, 0.45, elevation)),
    sunIntensity: 2.6 * smoothstep(-0.03, 0.22, elevation),
    ambientColor: mixColor(AMBIENT_NIGHT, AMBIENT_DAY, day),
    ambientIntensity: 0.22 + 0.95 * day,
    skyColor: mixColor(mixColor(SKY_NIGHT, SKY_DAY, day), SKY_TWILIGHT, twilight),
    // Lamps come up as the sun goes down, and are fully out by mid-morning.
    lampFactor: 1 - smoothstep(-0.12, 0.12, elevation),
  };
}
