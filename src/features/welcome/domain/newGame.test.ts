import { describe, expect, it } from 'vitest';
import { groundOf, paramsFor } from './newGame';

describe('groundOf', () => {
  it('always starts a tycoon on bare ground', () => {
    expect(groundOf({ mode: 'tycoon', ground: 'bare' })).toBe('bare');
    expect(groundOf({ mode: 'tycoon', ground: 'grown' })).toBe('bare');
  });

  it('lets free play start on bare ground or a grown resort', () => {
    expect(groundOf({ mode: 'sandbox', ground: 'bare' })).toBe('bare');
    expect(groundOf({ mode: 'sandbox', ground: 'grown' })).toBe('grown');
  });
});

describe('paramsFor', () => {
  const draft = { tilesX: 112, tilesZ: 100, density: 1, seed: 7 };

  it('sets a bare game to the fixed world', () => {
    expect(paramsFor({ mode: 'tycoon', ground: 'grown' }, draft)).toEqual({
      ...draft,
      tilesX: 256,
      tilesZ: 256,
    });
    expect(paramsFor({ mode: 'sandbox', ground: 'bare' }, draft)).toEqual({
      ...draft,
      tilesX: 256,
      tilesZ: 256,
    });
  });

  it('leaves a generated game the size it asked for', () => {
    expect(paramsFor({ mode: 'sandbox', ground: 'grown' }, draft)).toBe(draft);
  });
});
