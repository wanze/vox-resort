import { describe, expect, it } from 'vitest';
import { SUNSET_TIME, mixColor, normalizeTime, skyStateFor, smoothstep } from './dayNight';

/** A time on the clock, from hours and minutes. */
const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

describe('normalizeTime', () => {
  it('leaves a time already inside the day alone', () => {
    expect(normalizeTime(0.25)).toBe(0.25);
  });

  it('wraps past midnight in both directions', () => {
    expect(normalizeTime(1.25)).toBeCloseTo(0.25);
    expect(normalizeTime(-0.25)).toBeCloseTo(0.75);
  });
});

describe('mixColor', () => {
  it('returns the ends unchanged', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });

  it('blends each channel on its own', () => {
    expect(mixColor(0x000000, 0xff8800, 0.5)).toBe(0x804400);
  });

  it('clamps outside 0..1', () => {
    expect(mixColor(0x102030, 0xffffff, -3)).toBe(0x102030);
    expect(mixColor(0x102030, 0xffffff, 3)).toBe(0xffffff);
  });
});

describe('smoothstep', () => {
  it('clamps outside the edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('passes through the midpoint', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('steps rather than dividing by zero when the edges meet', () => {
    expect(smoothstep(1, 1, 0.5)).toBe(0);
    expect(smoothstep(1, 1, 1)).toBe(1);
  });
});

describe('skyStateFor', () => {
  it('puts the sun overhead at solar noon and below the horizon at solar midnight', () => {
    // An hour after the clock's, since sunset is two hours later than sunrise is early.
    expect(skyStateFor(at(13)).sunDirection.y).toBeGreaterThan(0.9);
    expect(skyStateFor(at(1)).sunDirection.y).toBeLessThan(-0.9);
  });

  it('holds the sun direction on the unit sphere all day', () => {
    for (let time = 0; time < 1; time += 0.05) {
      const { x, y, z } = skyStateFor(time).sunDirection;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    }
  });

  it('rises in the east and sets in the west', () => {
    expect(skyStateFor(at(6)).sunDirection.x).toBeGreaterThan(0.5);
    expect(skyStateFor(SUNSET_TIME).sunDirection.x).toBeLessThan(-0.5);
  });

  it('puts the sun on the horizon at six in the morning and at sunset', () => {
    expect(skyStateFor(at(6)).sunDirection.y).toBeCloseTo(0, 6);
    expect(skyStateFor(SUNSET_TIME).sunDirection.y).toBeCloseTo(0, 6);
  });

  it('stands the sun highest at a quarter to two in the afternoon, as summer time does', () => {
    const noon = skyStateFor(at(13, 45)).sunDirection.y;
    expect(noon).toBeGreaterThan(skyStateFor(at(12, 45)).sunDirection.y);
    expect(noon).toBeGreaterThan(skyStateFor(at(14, 45)).sunDirection.y);
  });

  it('is still full daylight at half past eight in the evening and dark by a quarter to ten', () => {
    // The walk home starts at seven and has to be seen: see `night.ts`.
    expect(skyStateFor(at(20, 30)).lampFactor).toBe(0);
    expect(skyStateFor(at(20, 30)).sunIntensity).toBeGreaterThan(1.5);
    expect(skyStateFor(at(21, 45)).sunIntensity).toBe(0);
    expect(skyStateFor(at(21, 45)).ambientIntensity).toBeCloseTo(0.22, 2);
  });

  it('moves the sun without a jump where the day and the night meet', () => {
    const step = 1 / (24 * 60);
    for (const edge of [at(6), SUNSET_TIME]) {
      const before = skyStateFor(edge - step).sunDirection.y;
      const after = skyStateFor(edge + step).sunDirection.y;
      expect(Math.abs(after - before)).toBeLessThan(0.01);
    }
  });

  it('burns the lamps at night and puts them out at noon', () => {
    expect(skyStateFor(0).lampFactor).toBe(1);
    expect(skyStateFor(0.5).lampFactor).toBe(0);
  });

  it('never lights the lamps and the sun at full strength together', () => {
    for (let time = 0; time < 1; time += 0.02) {
      const state = skyStateFor(time);
      expect(state.lampFactor * state.sunIntensity).toBeLessThan(1.6);
    }
  });

  it('is brightest at noon and darkest at midnight', () => {
    expect(skyStateFor(0.5).ambientIntensity).toBeGreaterThan(skyStateFor(0).ambientIntensity);
    expect(skyStateFor(0.5).sunIntensity).toBeGreaterThan(skyStateFor(0.9).sunIntensity);
  });

  it('wraps, so the cycle can run past midnight without a seam', () => {
    expect(skyStateFor(1.25)).toEqual(skyStateFor(0.25));
  });
});
