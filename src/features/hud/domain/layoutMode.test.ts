import { describe, expect, it } from 'vitest';
import { layoutModeFor } from './layoutMode';

describe('layoutModeFor', () => {
  it('keeps the desk layout on a desktop', () => {
    expect(layoutModeFor(1440, 900)).toBe('desk');
  });

  it('docks at the bottom on a phone held upright', () => {
    expect(layoutModeFor(390, 844)).toBe('bottom');
  });

  it('docks on a side rail on a phone held sideways', () => {
    expect(layoutModeFor(844, 390)).toBe('rail');
  });

  it('docks at the bottom on a tablet held upright', () => {
    expect(layoutModeFor(820, 1180)).toBe('bottom');
  });

  it('keeps the desk layout on a tablet held sideways', () => {
    expect(layoutModeFor(1180, 820)).toBe('desk');
  });
});
