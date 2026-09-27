import { describe, expect, it } from 'vitest';
import { rampInto, type Rgb } from './ramp';

const colourOf = (value: number): Rgb => {
  const out = { r: -1, g: -1, b: -1 };
  rampInto(value, out);
  return out;
};

describe('rampInto', () => {
  it('lands on a distinct stop at each end and in the middle', () => {
    const good = colourOf(0);
    const middle = colourOf(0.5);
    const bad = colourOf(1);
    expect(good).not.toEqual(middle);
    expect(middle).not.toEqual(bad);
    // Cool at the good end, warm in the middle, red over blue at the bad end.
    expect(good.b).toBeGreaterThan(good.r);
    expect(middle.r).toBeGreaterThan(middle.b);
    expect(bad.r).toBeGreaterThan(bad.g);
  });

  it('puts a value between two stops between them in every channel', () => {
    const low = colourOf(0.5);
    const high = colourOf(1);
    const mid = colourOf(0.75);
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(mid[channel]).toBeGreaterThanOrEqual(Math.min(low[channel], high[channel]));
      expect(mid[channel]).toBeLessThanOrEqual(Math.max(low[channel], high[channel]));
    }
  });

  it('draws nothing for no data and leaves out untouched', () => {
    const out = { r: -1, g: -1, b: -1 };
    expect(rampInto(Number.NaN, out)).toBe(false);
    expect(out).toEqual({ r: -1, g: -1, b: -1 });
  });

  it('clamps a value past either end to that end', () => {
    expect(colourOf(-3)).toEqual(colourOf(0));
    expect(colourOf(7)).toEqual(colourOf(1));
  });
});
