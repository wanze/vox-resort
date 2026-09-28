import { describe, expect, it } from 'vitest';
import { createRandom, resumeRandom } from './random';

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

describe('resumeRandom', () => {
  it('carries on the same run from a saved state', () => {
    for (const drawnBefore of [0, 1, 5, 97]) {
      const random = createRandom(4);
      for (let i = 0; i < drawnBefore; i++) random();
      const resumed = resumeRandom(random.state());
      expect(Array.from({ length: 6 }, resumed)).toEqual(Array.from({ length: 6 }, random));
    }
  });

  it('leaves the numbers a seed drew before resuming existed', () => {
    expect(draw(1).slice(0, 5)).toEqual([
      0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849,
      0.281103502959013,
    ]);
  });
});
