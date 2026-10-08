import { mix, unitOf } from '../../random/domain/hash';
import { strikesBetween, type Strike } from '../../weather/domain/lightning';

export interface Thunder {
  readonly at: number;
  readonly gain: number;
  readonly crack: boolean;
  readonly rumbleSeconds: number;
}

const WEAKEST = 0.45;
const NEAREST_DELAY = 0.3;
const FARTHEST_DELAY = 3.5;
// Of the delay, the share left to chance, so two strikes of a strength do not sound a ruler apart.
const DELAY_JITTER = 0.2;

const hash01 = (value: number): number => unitOf(mix(value));

// Sound travels a kilometre in three seconds: a strong strike reads as a near one, so it comes
// sooner, louder, and with a crack.
export function thunderOf(strike: Strike): Thunder {
  const near = Math.min(1, Math.max(0, (strike.strength - WEAKEST) / (1 - WEAKEST)));
  const salt = Math.floor(strike.at * 1000);
  const far = (1 - near) * (1 - DELAY_JITTER) + hash01(salt) * DELAY_JITTER;
  return {
    at: strike.at + NEAREST_DELAY + far * (FARTHEST_DELAY - NEAREST_DELAY),
    gain: 0.35 + 0.65 * near,
    crack: strike.strength > 0.8,
    // Far thunder rolls longer: its echoes come off more of the sky.
    rumbleSeconds: 2.5 + 3.5 * (far * 0.7 + hash01(salt + 1) * 0.3),
  };
}

const LATEST_THUNDER = FARTHEST_DELAY;

// Never earlier than now: a thunder already past is not played late, all at once.
export function thunderDue(lastScheduled: number, now: number, horizon: number): Thunder[] {
  const from = Math.max(lastScheduled, now);
  const to = now + horizon;
  if (to <= from) return [];
  return strikesBetween(from - LATEST_THUNDER, to)
    .map(thunderOf)
    .filter((thunder) => thunder.at > from && thunder.at <= to);
}

export interface RainVoice {
  readonly gain: number;
  readonly lowpassHz: number;
  readonly highpassHz: number;
}

// A shower is a high, thin hiss; a storm's downpour comes lower and fuller.
export function rainVoice(level: number): RainVoice {
  const at = Math.min(1, Math.max(0, level));
  return {
    gain: 0.5 * Math.sqrt(at),
    lowpassHz: 9000 - 4500 * at,
    highpassHz: 1400 - 1100 * at,
  };
}

export interface WindVoice {
  readonly gain: number;
  readonly bandHz: number;
  readonly q: number;
}

const TWO_PI = Math.PI * 2;

// Two sines at periods that do not divide each other, so the gusts never settle into a beat.
const gustAt = (seconds: number): number =>
  0.5 + 0.5 * (0.6 * Math.sin((TWO_PI * seconds) / 13) + 0.4 * Math.sin((TWO_PI * seconds) / 5.3));

export function windVoice(level: number, seconds: number): WindVoice {
  const at = Math.min(1, Math.max(0, level));
  const gust = gustAt(seconds);
  return {
    gain: 0.45 * at * (0.55 + 0.45 * gust),
    bandHz: 280 + 520 * at + 260 * gust,
    q: 0.9 + 0.8 * gust,
  };
}

// A wave breaks fast and draws back slowly.
function waveAt(seconds: number, period: number, offset: number): number {
  const through = (seconds / period + offset) % 1;
  return through < 0.25 ? through / 0.25 : (1 - (through - 0.25) / 0.75) ** 1.5;
}

// Two sets of waves about 8 and 11 seconds apart, so they never line up into a beat.
export function surfAt(seconds: number, level: number): number {
  const at = Math.min(1, Math.max(0, level));
  const swell = Math.max(waveAt(seconds, 8, 0), 0.8 * waveAt(seconds, 11, 0.4));
  return at * (0.3 + 0.7 * swell);
}
