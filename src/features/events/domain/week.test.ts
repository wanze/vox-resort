import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { clockWords, dayAt, minuteOf, tickAt, weekdayOf } from './week';

describe('weekdayOf', () => {
  it('makes day 0 a Monday', () => {
    expect(weekdayOf(0)).toBe(0);
  });

  it('comes back to Monday a week later', () => {
    expect(weekdayOf(7)).toBe(0);
    expect(weekdayOf(16)).toBe(2);
  });

  it('makes the day before the opening a Sunday', () => {
    expect(weekdayOf(-1)).toBe(6);
    expect(weekdayOf(-8)).toBe(6);
  });
});

describe('tickAt', () => {
  it('round-trips with minuteOf and dayAt', () => {
    const tick = tickAt(3, 20 * 60 + 30);
    expect(tick).toBe(3 * TICKS_PER_DAY + 1230);
    expect(minuteOf(tick)).toBe(1230);
    expect(dayAt(tick)).toBe(3);
    expect(clockWords(minuteOf(tick))).toBe('20:30');
  });
});
