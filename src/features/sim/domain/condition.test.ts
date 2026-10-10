import { describe, expect, it } from 'vitest';
import {
  aged,
  appealFactor,
  bandOf,
  canRenovate,
  conditionOf,
  durabilityOf,
  isShabby,
  keptFor,
  lodgingBusy,
  rateFactor,
  reliabilityFactor,
  renovated,
  renovationCost,
  settledFor,
  SETTLED,
  upkeepFactor,
  venueBusy,
  wearOf,
  type Condition,
} from './condition';

const NEW: Condition = new Map();

const ageFor = (days: number, busy: number): number => {
  let condition = NEW;
  for (let day = 0; day < days; day++)
    condition = aged(condition, new Map([['bar', wearOf(busy)]]));
  return conditionOf(condition, 'bar');
};

describe('wear', () => {
  it('takes 0.011 a day from a full building and 0.002 from an idle one', () => {
    expect(wearOf(1)).toBeCloseTo(0.011);
    expect(wearOf(0)).toBeCloseTo(0.002);
  });

  it('wears one building of a kind up to a fifth faster or slower than another, and always alike', () => {
    const keys = Array.from({ length: 200 }, (_, index) => `bungalow#${index}`);
    const factors = keys.map(durabilityOf);
    expect(Math.min(...factors)).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...factors)).toBeLessThanOrEqual(1.2);
    expect(Math.max(...factors) - Math.min(...factors)).toBeGreaterThan(0.3);
    expect(durabilityOf('bungalow#7')).toBe(factors[7]);
  });

  it('starts a building it has not seen from new, and leaves the others alone', () => {
    const before = new Map([['hotel', 0.5]]);
    const after = aged(before, new Map([['bar', 0.1]]));
    expect(conditionOf(after, 'bar')).toBeCloseTo(0.9);
    expect(conditionOf(after, 'hotel')).toBe(0.5);
    expect(before.has('bar')).toBe(false);
  });

  it('never goes below 0', () => {
    expect(conditionOf(aged(new Map([['bar', 0.01]]), new Map([['bar', 0.5]])), 'bar')).toBe(0);
  });

  it('wears a full building to shabby in about two seasons, and an idle one by 0.06 a month', () => {
    expect(ageFor(55, 1)).toBeCloseTo(0.395);
    expect(ageFor(30, 0)).toBeCloseTo(0.94);
  });
});

describe('busy', () => {
  it('counts a venue full once it is occupied a quarter of the waking day', () => {
    // 4 places, a mean stay of an hour: 48 visits fill twelve hours, and 12 count as full.
    const dwell = { min: 1800, max: 5400 };
    expect(venueBusy(6, 4, dwell)).toBeCloseTo(0.5);
    expect(venueBusy(12, 4, dwell)).toBe(1);
    expect(venueBusy(100, 4, dwell)).toBe(1);
    expect(venueBusy(10, 0, dwell)).toBe(0);
  });

  it("measures a lodging's beds taken against its beds", () => {
    expect(lodgingBusy(3, 4)).toBe(0.75);
    expect(lodgingBusy(5, 4)).toBe(1);
    expect(lodgingBusy(0, 0)).toBe(0);
  });
});

describe('effects', () => {
  it('leaves a new building as it was, and stops at each floor when run-down', () => {
    expect(rateFactor(1)).toBe(1);
    expect(appealFactor(1)).toBe(1);
    expect(reliabilityFactor(1)).toBe(1);
    expect(upkeepFactor(1)).toBe(1);
    expect(rateFactor(0)).toBeCloseTo(0.7);
    expect(appealFactor(0)).toBeCloseTo(0.6);
    expect(reliabilityFactor(0)).toBeCloseTo(0.4);
    expect(upkeepFactor(0)).toBeCloseTo(2.5);
  });

  it('calls a building shabby below 0.4', () => {
    expect(isShabby(0.39)).toBe(true);
    expect(isShabby(0.4)).toBe(false);
  });
});

describe('bandOf', () => {
  it('names the bands at 0.75, 0.5 and 0.25', () => {
    expect(bandOf(1)).toBe('good');
    expect(bandOf(0.75)).toBe('good');
    expect(bandOf(0.74)).toBe('worn');
    expect(bandOf(0.5)).toBe('worn');
    expect(bandOf(0.49)).toBe('shabby');
    expect(bandOf(0.25)).toBe('shabby');
    expect(bandOf(0.24)).toBe('run-down');
  });
});

describe('renovating', () => {
  it('costs half the build price from run-down, and never less than 10', () => {
    expect(renovationCost(2000, 0)).toBe(1000);
    expect(renovationCost(2000, 0.5)).toBe(500);
    expect(renovationCost(20, 0.9)).toBe(10);
  });

  it('is not offered for a building that is nearly new', () => {
    expect(canRenovate(0.96)).toBe(false);
    expect(canRenovate(0.9)).toBe(true);
  });

  it('makes a building as good as new', () => {
    expect(conditionOf(renovated(new Map([['bar', 0.2]]), 'bar'), 'bar')).toBe(1);
  });
});

describe('keeping and settling', () => {
  it('forgets a demolished building', () => {
    const kept = keptFor(
      new Map([
        ['bar', 0.3],
        ['hotel', 0.6],
      ]),
      ['hotel'],
    );
    expect([...kept]).toEqual([['hotel', 0.6]]);
  });

  it('settles every standing building of an old save between 0.65 and 0.9', () => {
    const keys = Array.from({ length: 200 }, (_, index) => `bar#${index}`);
    const levels = [...settledFor(keys).values()];
    expect(levels).toHaveLength(200);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(SETTLED.min);
    expect(Math.max(...levels)).toBeLessThanOrEqual(SETTLED.max);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.2);
  });
});
