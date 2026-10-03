import { describe, expect, it } from 'vitest';
import { GLYPH_ROWS, glyphsOf, setLine, SIGN_GLYPHS } from './signFont';

describe('the sign font', () => {
  it('draws every glyph in five rows of one width', () => {
    for (const [glyph, rows] of Object.entries(SIGN_GLYPHS)) {
      expect(rows, glyph).toHaveLength(GLYPH_ROWS);
      expect(new Set(rows.map((row) => row.length)).size, glyph).toBe(1);
      expect(rows.join(''), glyph).toMatch(/^[#.]+$/);
    }
  });

  it('sets an accented letter as its base capital', () => {
    expect(glyphsOf('Café')).toEqual(['C', 'A', 'F', 'E']);
  });

  it('sets a character it has no glyph for as a space, and drops spaces at the ends', () => {
    expect(glyphsOf('A~B')).toEqual(['A', ' ', 'B']);
    expect(glyphsOf(' ~A~ ')).toEqual(['A']);
    expect(setLine('~').width).toBe(0);
  });

  it('is as wide as its glyphs and one clear column between each', () => {
    const line = setLine('MI-1');
    expect(line.width).toBe(5 + 1 + 1 + 1 + 3 + 1 + 3);
    expect(line.cells).toHaveLength(line.width * GLYPH_ROWS);
    // The gap after the M is clear on every row.
    for (let y = 0; y < GLYPH_ROWS; y++) expect(line.cells[y * line.width + 5]).toBe(0);
    expect(line.cells[6]).toBe(1);
  });
});
