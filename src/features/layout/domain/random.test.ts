import { describe, expect, it } from 'vitest';
import { createRandom } from './random';

/** The first eight numbers a seed produces. */
const draw = (seed: number): number[] => Array.from({ length: 8 }, createRandom(seed));

describe('createRandom', () => {
  it('gives the same run twice for the same seed', () => {
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it('stays inside the unit interval', () => {
    const drawn = Array.from({ length: 500 }, createRandom(3));
    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drawn)).toBeLessThan(1);
  });

  it('spreads over the interval rather than sticking near one end', () => {
    const drawn = Array.from({ length: 2000 }, createRandom(11));
    const mean = drawn.reduce((sum, value) => sum + value, 0) / drawn.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
