import { describe, expect, it } from 'vitest';
import { thermometerRows, TUBE_ROWS } from './thermometer';

const tube = (rows: readonly string[]) => rows.slice(1, 1 + TUBE_ROWS).map((row) => row.charAt(3));

describe('thermometerRows', () => {
  it('fills the tube from the bottom as far as the level', () => {
    expect(tube(thermometerRows(0.3)).join('')).toBe('gggggggbbb');
    expect(tube(thermometerRows(1)).join('')).toBe('rrrrrrrrrr');
    expect(tube(thermometerRows(0)).join('')).toBe('gggggggggg');
  });

  it('warms the column from blue through orange to red', () => {
    expect(thermometerRows(0.1)[TUBE_ROWS + 2]).toContain('b');
    expect(thermometerRows(0.5)[TUBE_ROWS + 2]).toContain('o');
    expect(thermometerRows(0.9)[TUBE_ROWS + 2]).toContain('r');
  });

  it('keeps every row as wide as the picture, whatever the level', () => {
    for (const level of [-1, 0, 0.42, 1, 2]) {
      const rows = thermometerRows(level);
      expect(new Set(rows.map((row) => row.length))).toEqual(new Set([7]));
    }
  });
});
