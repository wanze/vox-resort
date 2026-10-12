import { mixColor, normalizeTime, smoothstep, type SkyState } from '../../lighting/domain/dayNight';
import type { Weather } from '../../sim/domain/weather';
import { unitAt } from '../../random/domain/hash';

// Above zero: the season's last frame is seen, and the newspaper's fallback photographs summer.
export const HOLD_SECONDS = 2;
export const TURN_SECONDS = 4;

// The larger of it and the weather's, so a break is grey even when the drawn weather is dry.
export const OFF_SEASON_CLOUD = 0.45;

// A long, low, warm light under the cloud, whatever hour the last guest left at.
export const AUTUMN_HOUR = 17.25 / 24;

const OFF_SEASON_SWELL = 1.6;

const AUTUMN_AMBIENT = 0x9aa7b8;
const AUTUMN_AMBIENT_SHARE = 0.3;
const AUTUMN_SUN = 0xffc58a;
const AUTUMN_SUN_SHARE = 0.25;
const AUTUMN_DIMMING = 0.12;
const AUTUMN_SKY_GREYING = 0.3;

export interface Turn {
  readonly from: number;
  readonly to: 0 | 1;
  readonly since: number;
}

export interface OffSeasonLook {
  readonly blend: number;
  readonly weather: Weather | null;
}

const SUMMER_LOOK: OffSeasonLook = { blend: 0, weather: null };

const blendFor = (between: boolean): 0 | 1 => (between ? 1 : 0);

export function settledTurn(between: boolean): Turn {
  const blend = blendFor(between);
  return { from: blend, to: blend, since: 0 };
}

// Only the way into a break holds; the way out starts with the opening click.
export function blendAt(turn: Turn, now: number): number {
  const start = turn.since + (turn.to === 1 ? HOLD_SECONDS : 0);
  return turn.from + (turn.to - turn.from) * smoothstep(start, start + TURN_SECONDS, now);
}

// From wherever the blend is, so a season opened mid-turn turns back without a jump. A turn
// already headed there keeps going.
export function turnTowards(turn: Turn, between: boolean, now: number): Turn {
  const to = blendFor(between);
  return to === turn.to ? turn : { from: blendAt(turn, now), to, since: now };
}

const greyOf = (color: number): number => {
  const luminance = Math.round(
    0.2126 * ((color >> 16) & 0xff) + 0.7152 * ((color >> 8) & 0xff) + 0.0722 * (color & 0xff),
  );
  return (luminance << 16) | (luminance << 8) | luminance;
};

// Faded by the lamps as the overcast is, so a night in a break is never lighter than a summer one.
export function offSeasonSky(sky: SkyState, blend: number): SkyState {
  if (blend <= 0) return sky;
  const day = blend * (1 - sky.lampFactor);
  const dimmed = 1 - AUTUMN_DIMMING * day;
  return {
    ...sky,
    sunColor: mixColor(sky.sunColor, AUTUMN_SUN, AUTUMN_SUN_SHARE * day),
    sunIntensity: sky.sunIntensity * dimmed,
    ambientColor: mixColor(sky.ambientColor, AUTUMN_AMBIENT, AUTUMN_AMBIENT_SHARE * day),
    ambientIntensity: sky.ambientIntensity * dimmed,
    skyColor: mixColor(sky.skyColor, greyOf(sky.skyColor), AUTUMN_SKY_GREYING * day),
    zenithColor: mixColor(sky.zenithColor, greyOf(sky.zenithColor), AUTUMN_SKY_GREYING * day),
  };
}

// The shortest way round the clock, so a break that began at 22:00 does not sweep through the night.
export function breakHour(time: number, blend: number): number {
  const from = normalizeTime(time);
  const way = normalizeTime(AUTUMN_HOUR - from + 0.5) - 0.5;
  return normalizeTime(from + way * blend);
}

const PAIR_SECONDS = 135;
const SHORTEST_SPELL = 45;
const SPLIT_SEED = 0x0a17_0001;
const RAIN_SEED = 0x0a17_0002;
const STORM_SEED = 0x0a17_0003;
const DRIZZLE_SHARE = 1 / 3;
// Of the second spells only, so two storms never meet: one spell in eight overall.
const STORM_SHARE = 1 / 4;

// Spells come in pairs split at a drawn point, so each lasts 45-90 s and is found without a walk
// from the first. Seeded by constants: the same for every resort, and a replay sees the same.
export function breakWeatherAt(seconds: number): Weather {
  const pair = Math.floor(seconds / PAIR_SECONDS);
  const split = SHORTEST_SPELL + (PAIR_SECONDS - 2 * SHORTEST_SPELL) * unitAt(SPLIT_SEED, pair);
  const second = seconds - pair * PAIR_SECONDS >= split;
  const spell = pair * 2 + (second ? 1 : 0);
  if (second && unitAt(STORM_SEED, spell) < STORM_SHARE) return 'storm';
  return unitAt(RAIN_SEED, spell) < DRIZZLE_SHARE ? 'rain' : 'clear';
}

// Drawn only once the turn is past halfway, so the season's own weather fades out under the cloud.
export function lookAt(turn: Turn, now: number, seconds: number): OffSeasonLook {
  const blend = blendAt(turn, now);
  if (blend === 0) return SUMMER_LOOK;
  return { blend, weather: blend > 0.5 ? breakWeatherAt(seconds) : null };
}

export const swellAt = (blend: number): number => 1 + (OFF_SEASON_SWELL - 1) * blend;

export const furledWith = (share: number, blend: number): number => Math.max(share, blend);
