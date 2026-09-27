import { describe, expect, it } from 'vitest';
import { groundOf } from './newGame';

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
