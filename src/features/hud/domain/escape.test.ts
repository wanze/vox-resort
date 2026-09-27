import { describe, expect, it } from 'vitest';
import { escapeOutcome } from './escape';

describe('escapeOutcome', () => {
  it('closes an open menu whatever else is going on', () => {
    expect(escapeOutcome(true, true)).toBe('close');
    expect(escapeOutcome(true, false)).toBe('close');
  });

  it('opens the menu when nothing else wants the key', () => {
    expect(escapeOutcome(false, true)).toBe('open');
  });

  it('lets the key through to an armed tool or an open inspector', () => {
    expect(escapeOutcome(false, false)).toBe('pass');
  });
});
