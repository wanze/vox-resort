import { describe, expect, it } from 'vitest';
import {
  MAX_TICKS_PER_ADVANCE,
  SPEED_DAY_SECONDS,
  TICKS_PER_DAY,
  advanceClock,
  clockLabel,
  createSimClock,
  dayOf,
  hourOf,
  timeOf,
  withSpeed,
  withTime,
  type SimClock,
} from './simClock';

const atTick = (ticks: number): SimClock => ({ ticks, speed: 'paused', carry: 0 });

describe('createSimClock', () => {
  it('opens paused, on the day and within a tick of the time asked for', () => {
    const clock = createSimClock(0, 0.62);
    expect(clock.speed).toBe('paused');
    expect(dayOf(clock)).toBe(0);
    expect(Math.abs(timeOf(clock) - 0.62)).toBeLessThanOrEqual(1 / TICKS_PER_DAY);
  });
});

describe('advanceClock', () => {
  it('runs nothing and does not move while paused', () => {
    const clock = createSimClock(0, 0.62);
    const result = advanceClock(clock, 10);
    expect(result.ticks).toBe(0);
    expect(result.clock).toBe(clock);
  });

  it('hands back the identical clock however often a paused one is advanced', () => {
    const clock = createSimClock(2, 0.3);
    let current = clock;
    for (let frame = 0; frame < 100; frame++) {
      const result = advanceClock(current, 1 / 60);
      expect(result.ticks).toBe(0);
      current = result.clock;
      expect(current).toBe(clock);
    }
    expect(timeOf(current)).toBe(timeOf(clock));
  });

  it('caps a whole day fed in one call at the most ticks an advance may run', () => {
    const clock = withSpeed(createSimClock(0, 0), 'normal');
    const result = advanceClock(clock, SPEED_DAY_SECONDS.normal);
    expect(result.ticks).toBe(MAX_TICKS_PER_ADVANCE);
    expect(result.clock.ticks).toBe(MAX_TICKS_PER_ADVANCE);
    expect(result.clock.carry).toBe(0);
  });

  it('carries the fractions, so a day of sixtieth-second frames is exactly a day', () => {
    let clock = withSpeed(createSimClock(0, 0), 'normal');
    let total = 0;
    for (let frame = 0; frame < SPEED_DAY_SECONDS.normal * 60; frame++) {
      const result = advanceClock(clock, 1 / 60);
      total += result.ticks;
      clock = result.clock;
    }
    expect(total).toBe(TICKS_PER_DAY);
    expect(clock.ticks).toBe(TICKS_PER_DAY);
    expect(dayOf(clock)).toBe(1);
  });

  it('never runs the clock backwards on a negative delta', () => {
    const clock = withSpeed(createSimClock(1, 0.5), 'fast');
    const result = advanceClock(clock, -5);
    expect(result.ticks).toBe(0);
    expect(result.clock).toBe(clock);
  });

  it('runs the same ticks from the same deltas every time', () => {
    const deltas = [0.016, 0.017, 0.033, 0.5, 0.001, 0.25, 0.016, 2, 0.1];
    const run = (): number[] => {
      let clock = withSpeed(createSimClock(0, 0.62), 'rush');
      return deltas.map((delta) => {
        const result = advanceClock(clock, delta);
        clock = result.clock;
        return result.ticks;
      });
    };
    expect(run()).toEqual(run());
  });
});

describe('timeOf', () => {
  it('lands exactly on midnight at the turn of the day', () => {
    expect(timeOf(atTick(TICKS_PER_DAY))).toBe(0);
  });
});

describe('hourOf', () => {
  it('reads the hour at 14:20', () => {
    expect(hourOf(atTick(14 * 60 + 20))).toBe(14);
  });
});

describe('clockLabel', () => {
  it('pads the hour and the minutes', () => {
    expect(clockLabel(atTick(365))).toBe('Day 0  06:05');
  });
});

describe('withTime', () => {
  it('clamps past the end of the day rather than rolling into the next', () => {
    const clock = withTime(createSimClock(3, 0.2), 1.5);
    expect(dayOf(clock)).toBe(3);
    expect(clock.ticks).toBe(4 * TICKS_PER_DAY - 1);
  });
});

describe('withSpeed', () => {
  it('keeps the ticks and the carry', () => {
    const clock: SimClock = { ticks: 5000, speed: 'slow', carry: 12.5 };
    const next = withSpeed(clock, 'rush');
    expect(next).toEqual({ ticks: 5000, speed: 'rush', carry: 12.5 });
  });
});
