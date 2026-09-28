import { describe, expect, it } from 'vitest';
import { AUTOSAVE_INTERVAL_MS, autosaveDue } from './autosave';

const asked = {
  enabled: true,
  busy: false,
  dirty: true,
  lastSavedAt: 1_000,
  now: 1_000 + AUTOSAVE_INTERVAL_MS - 1,
  trigger: 'timer' as const,
};

describe('autosaveDue', () => {
  it('waits out the interval on the timer', () => {
    expect(autosaveDue(asked)).toBe(false);
    expect(autosaveDue({ ...asked, now: 1_000 + AUTOSAVE_INTERVAL_MS })).toBe(true);
    expect(autosaveDue({ ...asked, lastSavedAt: null })).toBe(true);
  });

  it('saves at once in the morning and when the tab is hidden', () => {
    expect(autosaveDue({ ...asked, trigger: 'morning' })).toBe(true);
    expect(autosaveDue({ ...asked, trigger: 'hidden' })).toBe(true);
  });

  it('never saves an unchanged game, or one it must not', () => {
    expect(autosaveDue({ ...asked, trigger: 'hidden', dirty: false })).toBe(false);
    expect(autosaveDue({ ...asked, trigger: 'hidden', enabled: false })).toBe(false);
    expect(autosaveDue({ ...asked, trigger: 'hidden', busy: true })).toBe(false);
  });
});
