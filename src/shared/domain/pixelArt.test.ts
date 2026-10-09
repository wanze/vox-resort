import { describe, expect, it } from 'vitest';
import { pixelArt } from './pixelArt';

describe('pixelArt', () => {
  it('merges a row of one ink into a single run', () => {
    expect(pixelArt(['.aaa.']).runs).toEqual([{ x: 1, y: 0, width: 3, ink: 'a' }]);
  });

  it('starts a new run where the ink changes', () => {
    expect(pixelArt(['aab']).runs).toEqual([
      { x: 0, y: 0, width: 2, ink: 'a' },
      { x: 2, y: 0, width: 1, ink: 'b' },
    ]);
  });

  it('leaves clear pixels out and never runs across a row break', () => {
    const art = pixelArt(['..a', 'a..']);
    expect(art.runs).toEqual([
      { x: 2, y: 0, width: 1, ink: 'a' },
      { x: 0, y: 1, width: 1, ink: 'a' },
    ]);
  });

  it('is as wide as its widest row and as tall as its rows', () => {
    const art = pixelArt(['a', 'aaaa', '']);
    expect(art.width).toBe(4);
    expect(art.height).toBe(3);
  });
});
