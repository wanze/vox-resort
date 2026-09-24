export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SkyState {
  readonly time: number;
  readonly sunDirection: Vector3;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly ambientColor: number;
  readonly ambientIntensity: number;
  readonly skyColor: number;
  readonly lampFactor: number;
}

const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function normalizeTime(time: number): number {
  const wrapped = time % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

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

const SUNRISE_TIME = 6 / 24;

// Late on purpose, read with BEDTIME_HOUR in sim/domain/night.ts: parties walk home in evening light.
export const SUNSET_TIME = 21.5 / 24;

// The arc stays a plain sine; the clock walks the day slower than the night, meeting at the horizon
// so nothing jumps, which puts solar noon at a quarter to two.
function solarTimeFor(clock: number): number {
  const dayLength = SUNSET_TIME - SUNRISE_TIME;
  if (clock >= SUNRISE_TIME && clock < SUNSET_TIME) {
    return 0.25 + ((clock - SUNRISE_TIME) / dayLength) * 0.5;
  }
  const sinceSunset = normalizeTime(clock - SUNSET_TIME);
  return normalizeTime(0.75 + (sinceSunset / (1 - dayLength)) * 0.5);
}

export function skyStateFor(time: number): SkyState {
  const normalized = normalizeTime(time);
  const angle = (solarTimeFor(normalized) - 0.25) * TAU;
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
    lampFactor: 1 - smoothstep(-0.12, 0.12, elevation),
  };
}

// Not black: the plot must stay readable at noon in a storm, and a sky mixed towards black reads as dusk.
const OVERCAST_GREY = 0x6a7280;

// Not zero: a storm that took the light away would be a night in the middle of the afternoon.
const OVERCAST_LIGHT = 0.35;

const OVERCAST_LAMPS = 0.4;

// Cloud blocks the sun, so the dimming tapers off as the lamps come up and never brightens anything.
export function overcastSky(sky: SkyState, overcast: number): SkyState {
  const cloud = clamp01(overcast);
  if (cloud === 0) return sky;
  const dimmed = 1 - (1 - OVERCAST_LIGHT) * cloud * (1 - sky.lampFactor);
  // Scaled towards black by the dark, so a night storm is never lighter than a clear night.
  const grey = mixColor(OVERCAST_GREY, 0x000000, sky.lampFactor);
  return {
    ...sky,
    sunColor: mixColor(sky.sunColor, grey, cloud),
    sunIntensity: sky.sunIntensity * dimmed,
    ambientColor: mixColor(sky.ambientColor, grey, cloud),
    ambientIntensity: sky.ambientIntensity * dimmed,
    skyColor: mixColor(sky.skyColor, grey, cloud),
    // Capped: a storm at midnight must not burn the lamps brighter than night does.
    lampFactor: Math.min(1, sky.lampFactor + OVERCAST_LAMPS * cloud),
  };
}
