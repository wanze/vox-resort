import { describe, expect, it } from 'vitest';
import { layoutModeFor, steadySize } from './layoutMode';

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

  it('docks at the bottom once the desk bar would overflow', () => {
    expect(layoutModeFor(1010, 800)).toBe('bottom');
    expect(layoutModeFor(1011, 800)).toBe('desk');
  });

  it('keeps the desk layout on a tablet held sideways', () => {
    expect(layoutModeFor(1180, 820)).toBe('desk');
  });
});

describe('steadySize', () => {
  const upright = { width: 390, height: 844 };
  const keyboardUp = { width: 390, height: 420 };

  it('keeps the height a keyboard takes while a field has focus', () => {
    expect(steadySize(upright, keyboardUp, true)).toBe(upright);
  });

  it('follows the height once nothing is typed into', () => {
    expect(steadySize(upright, keyboardUp, false)).toBe(keyboardUp);
  });

  it('follows a phone turned while a field has focus', () => {
    const sideways = { width: 844, height: 390 };
    expect(steadySize(upright, sideways, true)).toBe(sideways);
  });

  it('takes the first size as it comes', () => {
    expect(steadySize(null, keyboardUp, true)).toBe(keyboardUp);
  });
});
