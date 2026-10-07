import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP, isDoubleTap } from './doubleTap';

const tap = (x: number, at: number) => ({ x, y: 0, at });

describe('isDoubleTap', () => {
  it('needs a tap before it', () => {
    expect(isDoubleTap(null, tap(0, 0))).toBe(false);
  });

  it('takes a second tap close by and soon after', () => {
    expect(isDoubleTap(tap(0, 0), tap(DOUBLE_TAP_SLOP, DOUBLE_TAP_MS))).toBe(true);
  });

  it('refuses one too late or too far', () => {
    expect(isDoubleTap(tap(0, 0), tap(0, DOUBLE_TAP_MS + 1))).toBe(false);
    expect(isDoubleTap(tap(0, 0), tap(DOUBLE_TAP_SLOP + 1, 100))).toBe(false);
  });

  it('refuses a tap stamped before the one it follows', () => {
    expect(isDoubleTap(tap(0, 100), tap(0, 50))).toBe(false);
  });
});
