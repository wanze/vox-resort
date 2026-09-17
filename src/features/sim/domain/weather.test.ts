import { describe, expect, it } from 'vitest';
import { NEEDS } from './needs';
import { isOpenIn, MAX_EFFECT, weatherEffect, weatherOn, WEATHERS, type Weather } from './weather';

/** A week of a plot, as the clock would ask for it. */
const week = (seed: number, days: number): Weather[] =>
  Array.from({ length: days }, (_unused, day) => weatherOn(day, seed));

describe('weatherOn', () => {
  it('gives the same day the same weather, however often it is asked', () => {
    for (let day = 0; day < 20; day++) {
      expect(weatherOn(day, 10)).toBe(weatherOn(day, 10));
    }
  });

  it('gives two plots different weeks', () => {
    // Not that every day differs - two seeds will agree on some of them - but
    // that the seed reaches the answer at all.
    expect(week(10, 30)).not.toEqual(week(11, 30));
  });

  it('does not run the kinds round in order, day after day', () => {
    // What a raw modulo would do: clear, rain, storm, heatwave, clear, for ever.
    // The hash is what stops it, so neighbouring days have to disagree about
    // their pattern rather than merely about their value.
    const days = week(3, 40);
    const gaps = new Set(days.map((kind, day) => `${day % 4}:${kind}`));
    expect(gaps.size).toBeGreaterThan(4);
  });

  it('gives every kind of day over a long enough season, and most of them clear', () => {
    const days = week(3, 200);
    const count = (kind: Weather): number => days.filter((each) => each === kind).length;
    for (const kind of WEATHERS) expect(count(kind), `no ${kind} in 200 days`).toBeGreaterThan(0);
    for (const kind of WEATHERS) {
      if (kind === 'clear') continue;
      expect(count('clear'), `${kind} is as common as a clear day`).toBeGreaterThan(count(kind));
    }
    // Weather that happened every other day would stop being an event.
    expect(count('clear') / days.length).toBeGreaterThan(0.5);
  });
});

describe('weatherEffect', () => {
  it('leaves a clear day exactly as it was', () => {
    const clear = weatherEffect('clear');
    for (const need of NEEDS) {
      expect(clear.weight[need]).toBe(1);
      expect(clear.decay[need]).toBe(1);
    }
    expect(clear.closes).toBeNull();
    expect(clear.overcast).toBe(0);
  });

  it('keeps every multiplier inside the bounds the archetype table is tuned against', () => {
    for (const kind of WEATHERS) {
      const effect = weatherEffect(kind);
      for (const need of NEEDS) {
        for (const value of [effect.weight[need], effect.decay[need]]) {
          expect(value, `${kind} ${need}`).toBeGreaterThanOrEqual(MAX_EFFECT.min);
          expect(value, `${kind} ${need}`).toBeLessThanOrEqual(MAX_EFFECT.max);
        }
      }
      expect(effect.overcast).toBeGreaterThanOrEqual(0);
      expect(effect.overcast).toBeLessThanOrEqual(1);
    }
  });

  it('shuts what has no roof in the rain, and nothing on a dry day', () => {
    expect(weatherEffect('rain').closes).toBe('open');
    expect(weatherEffect('storm').closes).toBe('open');
    expect(weatherEffect('heatwave').closes).toBeNull();
    expect(weatherEffect('clear').closes).toBeNull();
  });

  it('makes a heatwave about thirst and a storm about grey', () => {
    expect(weatherEffect('heatwave').weight.thirst).toBeGreaterThan(1);
    expect(weatherEffect('heatwave').decay.thirst).toBeGreaterThan(1);
    // A heatwave is not a grey day, whatever else it is.
    expect(weatherEffect('heatwave').overcast).toBe(0);
    expect(weatherEffect('storm').overcast).toBeGreaterThan(weatherEffect('rain').overcast);
  });
});

describe('isOpenIn', () => {
  it('leaves everything open on a clear day', () => {
    const clear = weatherEffect('clear');
    expect(isOpenIn('open', clear)).toBe(true);
    expect(isOpenIn('covered', clear)).toBe(true);
  });

  it('shuts the open and leaves the covered standing in a storm', () => {
    const storm = weatherEffect('storm');
    expect(isOpenIn('open', storm)).toBe(false);
    expect(isOpenIn('covered', storm)).toBe(true);
  });
});
