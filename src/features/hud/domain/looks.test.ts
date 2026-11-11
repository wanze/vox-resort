import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOKS, isLook, parseLook } from './looks';

describe('parseLook', () => {
  it('reads back every look', () => {
    for (const look of LOOKS) expect(parseLook(look)).toBe(look);
  });

  it('falls back to the default on anything else', () => {
    for (const garbage of [null, 3, 'marble', ['block'], { look: 'pebble' }]) {
      expect(parseLook(garbage)).toBe(DEFAULT_LOOK);
    }
  });
});

describe('isLook', () => {
  it('tells a look from a word that is not one', () => {
    expect(isLook('carved')).toBe(true);
    expect(isLook('Carved')).toBe(false);
  });
});
