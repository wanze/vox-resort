import { describe, expect, it } from 'vitest';
import { escapeOutcome } from './escape';

describe('escapeOutcome', () => {
  it('closes an open menu whatever else is going on', () => {
    expect(escapeOutcome(true, true, false)).toBe('close');
    expect(escapeOutcome(true, false, false)).toBe('close');
    expect(escapeOutcome(true, true, true)).toBe('close');
    expect(escapeOutcome(true, false, true)).toBe('close');
  });

  it('opens the menu when nothing else wants the key', () => {
    expect(escapeOutcome(false, true, false)).toBe('open');
  });

  it('lets the key through to an armed tool or an open inspector', () => {
    expect(escapeOutcome(false, false, false)).toBe('pass');
  });

  it('lets the tool take the key before the window holding the focus', () => {
    expect(escapeOutcome(false, false, true)).toBe('pass');
  });

  it('closes the window holding the focus when nothing else wants the key', () => {
    expect(escapeOutcome(false, true, true)).toBe('close-window');
  });
});
