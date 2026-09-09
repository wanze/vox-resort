import { describe, expect, it } from 'vitest';
import { repeatPlot } from './plotRepeat';

const items = [
  { key: 'a', id: 'cottage', x: 0, z: 0 },
  { key: 'b', id: 'palm', x: 10, z: 20 },
];

describe('repeatPlot', () => {
  it('hands back the plot unchanged when asked for one copy', () => {
    expect(repeatPlot(items, 1, 100, 100)).toEqual(items);
  });

  it('grows by the square of the repeat count', () => {
    expect(repeatPlot(items, 3, 100, 100)).toHaveLength(items.length * 9);
  });

  it('leaves the original tile exactly where it was', () => {
    const repeated = repeatPlot(items, 2, 100, 200);
    expect(repeated.slice(0, 2)).toEqual(items);
  });

  it('offsets each copy by a whole plot', () => {
    const repeated = repeatPlot(items, 2, 100, 200);
    const corners = repeated.filter((item) => item.key.startsWith('a'));
    expect(corners.map((item) => [item.x, item.z])).toEqual([
      [0, 0],
      [100, 0],
      [0, 200],
      [100, 200],
    ]);
  });

  it('keeps every key unique, which the lamps and labels depend on', () => {
    const repeated = repeatPlot(items, 4, 100, 100);
    expect(new Set(repeated.map((item) => item.key)).size).toBe(repeated.length);
  });

  it('carries the rest of each placement across untouched', () => {
    const repeated = repeatPlot(items, 2, 100, 100);
    expect(repeated.every((item) => item.id === 'cottage' || item.id === 'palm')).toBe(true);
  });

  it('refuses a repeat count that is not a whole plot', () => {
    expect(() => repeatPlot(items, 0, 10, 10)).toThrow(/cannot be repeated/);
    expect(() => repeatPlot(items, 1.5, 10, 10)).toThrow(/cannot be repeated/);
  });
});
