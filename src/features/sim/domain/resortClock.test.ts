import { describe, expect, it } from 'vitest';
import { SUNSET_TIME } from '../../lighting/domain/dayNight';
import { createResortClock } from './resortClock';
import { SPEED_DAY_SECONDS, TICKS_PER_DAY } from './simClock';
import { weatherOn } from './weather';

const SEED = 7;

describe('createResortClock', () => {
  it('runs no ticks while paused, but keeps counting real seconds', () => {
    const clock = createResortClock(0.3, SEED);
    expect(clock.advance(5)).toBe(0);
    expect(clock.ticks).toBe(createResortClock(0.3, SEED).ticks);
    expect(clock.running).toBe(5);
  });

  it('runs ticks at a speed, and a pace slows them', () => {
    const clock = createResortClock(0.3, SEED);
    clock.setSpeed('normal');
    const before = clock.ticks;
    const second = SPEED_DAY_SECONDS.normal / TICKS_PER_DAY;
    expect(clock.advance(second * 4)).toBe(4);
    expect(clock.ticks).toBe(before + 4);
    expect(clock.advance(second * 4, 0.5)).toBe(2);
    expect(clock.tickOfDay).toBe(clock.ticks % TICKS_PER_DAY);
  });

  it('lets a forced weather win, and null hands back the seeded one', () => {
    const clock = createResortClock(0.3, SEED);
    const seeded = weatherOn(0, SEED);
    expect(clock.weather).toBe(seeded);
    const other = seeded === 'storm' ? 'clear' : 'storm';
    clock.setWeather(other);
    expect(clock.weather).toBe(other);
    expect(clock.forcedWeather).toBe(other);
    clock.setWeather(null);
    expect(clock.weather).toBe(seeded);
    expect(clock.forcedWeather).toBeNull();
  });

  it('restores what it snapshot', () => {
    const clock = createResortClock(0.3, SEED);
    clock.setSpeed('fast');
    clock.advance(1.234);
    clock.setWeather('rain');
    const saved = clock.snapshot();
    const other = createResortClock(0.8, SEED);
    other.restore(saved);
    expect(other.snapshot()).toEqual(saved);
    expect(other.time).toBe(clock.time);
    expect(other.label).toBe(clock.label);
    expect(other.weather).toBe('rain');
  });

  it('keeps the speed over a restart', () => {
    const clock = createResortClock(0.3, SEED);
    clock.setSpeed('rush');
    clock.advance(30);
    clock.restart(0.62);
    expect(clock.speed).toBe('rush');
    expect(clock.day).toBe(0);
    expect(Math.abs(clock.time - 0.62)).toBeLessThanOrEqual(1 / TICKS_PER_DAY);
  });

  it('releases no balloons in the rain', () => {
    const clock = createResortClock(SUNSET_TIME + 0.03, SEED);
    clock.setWeather('clear');
    expect(clock.balloonReadiness).toBeGreaterThan(0);
    clock.setWeather('rain');
    expect(clock.balloonReadiness).toBe(0);
  });
});
