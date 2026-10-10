import { describe, expect, it } from 'vitest';
import { debugAllowedBy } from './debugMode';

describe('debugAllowedBy', () => {
  it('turns debug mode on in a local build and off in CI', () => {
    expect(debugAllowedBy({})).toBe(true);
    expect(debugAllowedBy({ CI: 'true' })).toBe(false);
    expect(debugAllowedBy({ CI: '1' })).toBe(false);
    expect(debugAllowedBy({ CI: 'false' })).toBe(true);
    expect(debugAllowedBy({ CI: '' })).toBe(true);
  });

  it('lets VOX_DEBUG say so either way', () => {
    expect(debugAllowedBy({ VOX_DEBUG: 'on', CI: 'true' })).toBe(true);
    expect(debugAllowedBy({ VOX_DEBUG: 'off' })).toBe(false);
    expect(debugAllowedBy({ VOX_DEBUG: ' ', CI: 'true' })).toBe(false);
  });

  it('refuses anything but on or off', () => {
    expect(() => debugAllowedBy({ VOX_DEBUG: 'yes' })).toThrow(/on or off/);
  });
});
