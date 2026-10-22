import { describe, expect, it } from 'vitest';
import {
  createNightNoise,
  listen,
  NIGHT_NOISE_DISCOUNT,
  NOISY_NIGHT_FROM,
  nightOf,
  nightsOver,
  quietFactor,
  restartNight,
  SLEEPLESS_HOURS,
} from './nightNoise';

const asleepIn =
  (lodgings: readonly number[]) =>
  (person: number): number =>
    lodgings[person] ?? -1;

const steady = (felt: number) => () => felt;

const club = () => 7;

describe('what a sleeper hears', () => {
  it('makes half a night of half the sleepless hours at full noise, and the worst of four', () => {
    const night = createNightNoise(2, 2);
    for (let frame = 0; frame < 4; frame++) {
      listen(night, SLEEPLESS_HOURS / 4, 2, asleepIn([0]), steady(0.5), club);
    }
    expect(nightOf(night.heard[0]!)).toBeCloseTo(0.5);
    for (let frame = 0; frame < 4; frame++) listen(night, 1, 2, asleepIn([-1, 1]), steady(1), club);
    expect(nightOf(night.heard[1]!)).toBe(1);
  });

  it('hears nothing awake, and nothing on a paused frame', () => {
    const night = createNightNoise(2, 1);
    listen(night, 1, 2, asleepIn([-1, 0]), steady(1), club);
    listen(night, 0, 2, asleepIn([0, 0]), steady(1), club);
    expect(Array.from(night.heard)).toEqual([0, 1]);
  });

  it('asks a lodging once a frame however many sleep in it', () => {
    const night = createNightNoise(3, 2);
    const asked: number[] = [];
    const feltAt = (lodging: number) => {
      asked.push(lodging);
      return 0.5;
    };
    listen(night, 1, 3, asleepIn([1, 1, 1]), feltAt, club);
    listen(night, 1, 3, asleepIn([1, 1, 1]), feltAt, club);
    expect(asked).toEqual([1, 1]);
    expect(Array.from(night.heard)).toEqual([1, 1, 1]);
  });

  it('names the source of the loudest moment, not the last one', () => {
    const night = createNightNoise(1, 1);
    listen(night, 1, 1, asleepIn([0]), steady(0.8), () => 3);
    listen(night, 1, 1, asleepIn([0]), steady(0.2), () => 5);
    expect(night.loudest[0]).toBe(3);
    expect(night.peak[0]).toBeCloseTo(0.8);
  });
});

describe('the night a lodging had', () => {
  it('averages over the residents present, and counts who was kept awake', () => {
    const night = createNightNoise(4, 2);
    const hours = SLEEPLESS_HOURS;
    night.heard.set([hours, 0.4 * hours, hours, hours]);
    const lodgingOf = asleepIn([0, 0, 1, -1]);
    const [noisy, away] = nightsOver(night, lodgingOf, Uint8Array.from([1, 1, 0, 1]), 2);
    expect(noisy!.felt).toBeCloseTo(0.7);
    expect(noisy!.woken).toBe(2);
    expect(nightOf(0.1 * hours)).toBeLessThan(NOISY_NIGHT_FROM);
    expect(away).toEqual({ felt: 0, woken: 0 });
  });

  it('takes nothing off a quiet night and the whole discount off the worst', () => {
    expect(quietFactor(0)).toBe(1);
    expect(quietFactor(1)).toBeCloseTo(1 - NIGHT_NOISE_DISCOUNT);
    expect(quietFactor(2)).toBeCloseTo(1 - NIGHT_NOISE_DISCOUNT);
  });

  it('starts every night afresh', () => {
    const night = createNightNoise(1, 1);
    listen(night, 1, 1, asleepIn([0]), steady(0.8), () => 3);
    restartNight(night);
    expect(night.heard[0]).toBe(0);
    expect(night.peak[0]).toBe(0);
    expect(night.loudest[0]).toBe(-1);
  });
});
