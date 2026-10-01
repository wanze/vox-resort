import { describe, expect, it } from 'vitest';
import { sparkPath } from './sparkline';

const pointsOf = (path: string): readonly number[][] =>
  path
    .split(/[ML]/)
    .filter((point) => point.trim() !== '')
    .map((point) => point.trim().split(' ').map(Number));

describe('sparkPath', () => {
  it('draws nothing for no values', () => {
    expect(sparkPath([], 60, 16)).toBe('');
  });

  it('draws nothing for a single value, which is a point and not a line', () => {
    expect(sparkPath([3.5], 60, 16)).toBe('');
  });

  it('draws a flat line through the middle for values that never change', () => {
    expect(sparkPath([4, 4, 4], 60, 16)).toBe('M1 8 L30 8 L59 8');
  });

  it('draws a rising line upwards, from the left edge to the right', () => {
    expect(sparkPath([1, 2, 3], 60, 16)).toBe('M1 15 L30 8 L59 1');
  });

  it('keeps every point inside the box', () => {
    const points = pointsOf(sparkPath([-400, 1250, 30, 980, -20, 0, 7], 80, 20));
    expect(points).toHaveLength(7);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(79);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(19);
    }
  });
});
