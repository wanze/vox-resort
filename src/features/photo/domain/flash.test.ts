import { describe, expect, it } from 'vitest';
import { SUNSET_TIME } from '../../lighting/domain/dayNight';
import { flashed, flashFor } from './flash';

const SUNSET = SUNSET_TIME * 1440;

const grey = (width: number, height: number, value: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(value),
});

describe('flashFor', () => {
  it('fires no flash by day, and a full one in the night', () => {
    for (const hour of [8, 12, 15, 20]) expect(flashFor(hour * 60)).toBe(0);
    for (const hour of [23, 0, 3, 6]) expect(flashFor(hour * 60)).toBe(1);
  });

  it('ramps up over the twenty minutes before sunset, and down after seven', () => {
    expect(flashFor(SUNSET - 20)).toBe(0);
    expect(flashFor(SUNSET - 10)).toBeCloseTo(0.5);
    expect(flashFor(SUNSET)).toBe(1);
    expect(flashFor(7 * 60)).toBe(1);
    expect(flashFor(7 * 60 + 10)).toBeCloseTo(0.5);
    expect(flashFor(7 * 60 + 20)).toBe(0);
  });
});

describe('flashed', () => {
  it('lifts the middle of the frame more than a corner', () => {
    const pixels = flashed(grey(30, 20, 60), 1);
    const at = (x: number, y: number) => pixels.data[(y * 30 + x) * 4]!;
    expect(at(15, 10)).toBeGreaterThan(110);
    expect(at(0, 0)).toBeLessThan(at(15, 10));
    expect(at(0, 0)).toBeLessThan(70);
    expect(pixels.data[3]).toBe(60);
  });

  it('never goes over white, and leaves a day photo alone', () => {
    const lit = flashed(grey(8, 8, 230), 1);
    expect(Math.max(...lit.data)).toBe(255);
    const day = flashed(grey(8, 8, 90), 0);
    expect(day.data.every((value) => value === 90)).toBe(true);
  });
});
