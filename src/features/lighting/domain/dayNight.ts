/**
 * The day/night cycle, as pure arithmetic.
 *
 * Time runs 0..1 through one day on the clock: 0 is midnight, {@link SUNRISE_TIME}
 * is sunrise and {@link SUNSET_TIME} sunset. Everything the scene needs is
 * derived from the sun's elevation — the
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

/** The sun is on the horizon, coming up, at 06:00. */
const SUNRISE_TIME = 6 / 24;

/**
 * The sun is on the horizon, going down, at 21:30: a late summer evening on the
 * coast. The light turns golden about half an hour before and the sky is dark
 * about ten minutes after, so the evening is still daylight at half past eight.
 *
 * Late on purpose, and read together with `BEDTIME_HOUR` in `sim/domain/night.ts`:
 * parties set off home between seven and half past nine, so the walk back to the
 * lodgings happens in the evening light where it can be watched, rather than
 * after dark.
 */
export const SUNSET_TIME = 21.5 / 24;

/**
 * Where the sun is in its own arc, 0..1 with 0.25 rising and 0.75 setting, at a
 * time on the clock.
 *
 * The arc itself stays a plain sine; what moves is how fast the clock walks it.
 * The day, sunrise to sunset, is stretched over its fifteen and a half hours and
 * the night squeezed into the other eight and a half. The two pieces meet at the
 * horizon, so nothing jumps there, and solar noon falls at a quarter to two
 * rather than at twelve, which is summer time and a westerly longitude together.
 */
function solarTimeFor(clock: number): number {
  const dayLength = SUNSET_TIME - SUNRISE_TIME;
  if (clock >= SUNRISE_TIME && clock < SUNSET_TIME) {
    return 0.25 + ((clock - SUNRISE_TIME) / dayLength) * 0.5;
  }
  const sinceSunset = normalizeTime(clock - SUNSET_TIME);
  return normalizeTime(0.75 + (sinceSunset / (1 - dayLength)) * 0.5);
}

/** Everything the scene's lighting needs for one moment of the day. */
export function skyStateFor(time: number): SkyState {
  const normalized = normalizeTime(time);
  // Angle 0 at sunrise, so elevation is simply its sine.
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
    // Lamps come up as the sun goes down, and are fully out by mid-morning.
    lampFactor: 1 - smoothstep(-0.12, 0.12, elevation),
  };
}

/**
 * The grey a clouded sky is mixed towards in broad daylight.
 *
 * One slate, and deliberately not black: the plot has to stay readable from an
 * isometric camera at noon in a storm, and a midday sky mixed towards nothing
 * would read as dusk rather than as weather.
 */
const OVERCAST_GREY = 0x6a7280;

/**
 * What is left of the sun and the ambient at full cloud, as a multiplier.
 *
 * Not zero. A storm that took the light away would be a night in the middle of
 * the afternoon, and nobody could see the resort they were being asked to
 * rebuild; a third and a bit is a dark day that is still a day.
 */
const OVERCAST_LIGHT = 0.35;

/**
 * How much of the light there is to take away at all, by how light it is out.
 *
 * Cloud blocks the *sun*, and after dark there is no sun to block: the lamps are
 * what light the plot at night, and dimming a midnight ambient to a third of
 * 0.22 would leave everything not standing under a lamp unreadable for the sake
 * of a sky nobody could see anyway. So the dimming is at its full
 * {@link OVERCAST_LIGHT} in daylight and tapers off as the lamps come up. The
 * *colours* still go towards black, so a stormy night is visibly darker than a
 * clear one; it is only the light on the plot that is left alone.
 */

/** How much of the way to lamplight full cloud takes the lamps; capped at 1. */
const OVERCAST_LAMPS = 0.4;

/**
 * The same sky under cloud: dimmer, greyer, and with the lamps coming on
 * earlier.
 *
 * A function over a {@link SkyState} rather than a branch inside
 * {@link skyStateFor}, because the sun's position is astronomy and the cloud
 * over it is weather - and because this way every existing caller and every
 * existing test of `skyStateFor` is untouched.
 *
 * `overcast` is 0 for a clear day, at which this hands back the state it was
 * given, and is clamped so a number from outside cannot darken the plot past
 * {@link OVERCAST_LIGHT}. The sun's *direction* is left alone: cloud does not
 * move the sun, and the shadows it casts are the ones the hour says.
 *
 * ## It takes away daylight, and leaves lamplight where it is
 *
 * See {@link OVERCAST_LIGHT}: the dimming is scaled by how light it is out, so a
 * storm at two in the afternoon is a dark day and a storm at two in the morning
 * is an ordinary night under a blacker sky.
 *
 * ## The grey is scaled by the daylight, so cloud never brightens anything
 *
 * {@link OVERCAST_GREY} is a *midday* slate, and mixing a midnight sky towards
 * it would make a storm at two in the morning lighter than a clear night - the
 * one thing cloud cannot do. So the target is the grey taken down towards black
 * by however far the lamps have already come up.
 *
 * The rule that holds at every hour is that **nothing comes back brighter than
 * it went in**, measured as a colour's brightness rather than channel by
 * channel: cloud over a sunrise does take a little of the orange out of it and
 * put a little blue back, which is what a grey sky over a sunrise looks like.
 */
export function overcastSky(sky: SkyState, overcast: number): SkyState {
  const cloud = clamp01(overcast);
  if (cloud === 0) return sky;
  const dimmed = 1 - (1 - OVERCAST_LIGHT) * cloud * (1 - sky.lampFactor);
  // Black at midnight, full slate at noon: `lampFactor` is the one number in a
  // `SkyState` that already says how dark it is out.
  const grey = mixColor(OVERCAST_GREY, 0x000000, sky.lampFactor);
  return {
    ...sky,
    sunColor: mixColor(sky.sunColor, grey, cloud),
    sunIntensity: sky.sunIntensity * dimmed,
    ambientColor: mixColor(sky.ambientColor, grey, cloud),
    ambientIntensity: sky.ambientIntensity * dimmed,
    skyColor: mixColor(sky.skyColor, grey, cloud),
    // Capped at 1 rather than added freely: the lamps are already full after
    // dark, and a storm at midnight must not burn them brighter than night does.
    lampFactor: Math.min(1, sky.lampFactor + OVERCAST_LAMPS * cloud),
  };
}
