import { describe, expect, it } from 'vitest';
import { pavedLookup, tileKey } from './tileKey';

describe('tileKey', () => {
  it('joins the coordinates with a comma', () => {
    expect(tileKey(3, -4)).toBe('3,-4');
  });
});

describe('pavedLookup', () => {
  const isPaved = pavedLookup([
    { x: 2, z: 5 },
    { x: 1, z: 23 },
  ]);

  it('answers true for listed tiles and false for a neighbour', () => {
    expect(isPaved(2, 5)).toBe(true);
    expect(isPaved(1, 23)).toBe(true);
    expect(isPaved(3, 5)).toBe(false);
  });

  it('keeps coordinates that read alike apart', () => {
    expect(isPaved(12, 3)).toBe(false);
  });
});
