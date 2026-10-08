import { describe, expect, it } from 'vitest';
import { rovingTarget } from './roving';

describe('rovingTarget', () => {
  it('steps along a horizontal strip and wraps at both ends', () => {
    expect(rovingTarget('ArrowRight', 1, 4, 'horizontal')).toBe(2);
    expect(rovingTarget('ArrowLeft', 1, 4, 'horizontal')).toBe(0);
    expect(rovingTarget('ArrowLeft', 0, 4, 'horizontal')).toBe(3);
    expect(rovingTarget('ArrowRight', 3, 4, 'horizontal')).toBe(0);
  });

  it('steps along a vertical list and wraps at both ends', () => {
    expect(rovingTarget('ArrowDown', 1, 4, 'vertical')).toBe(2);
    expect(rovingTarget('ArrowUp', 1, 4, 'vertical')).toBe(0);
    expect(rovingTarget('ArrowUp', 0, 4, 'vertical')).toBe(3);
    expect(rovingTarget('ArrowDown', 3, 4, 'vertical')).toBe(0);
  });

  it('ignores the other axis unless both are allowed', () => {
    expect(rovingTarget('ArrowDown', 1, 4, 'horizontal')).toBeNull();
    expect(rovingTarget('ArrowRight', 1, 4, 'vertical')).toBeNull();
    expect(rovingTarget('ArrowDown', 1, 4, 'both')).toBe(2);
    expect(rovingTarget('ArrowRight', 1, 4, 'both')).toBe(2);
    expect(rovingTarget('ArrowUp', 0, 4, 'both')).toBe(3);
    expect(rovingTarget('ArrowLeft', 0, 4, 'both')).toBe(3);
  });

  it('jumps to the ends with Home and End from anywhere', () => {
    expect(rovingTarget('Home', 2, 4, 'vertical')).toBe(0);
    expect(rovingTarget('End', 0, 4, 'horizontal')).toBe(3);
    expect(rovingTarget('Home', -1, 4, 'both')).toBe(0);
    expect(rovingTarget('End', -1, 4, 'both')).toBe(3);
  });

  it('enters from the container at the first item going forward and the last going back', () => {
    expect(rovingTarget('ArrowDown', -1, 4, 'vertical')).toBe(0);
    expect(rovingTarget('ArrowUp', -1, 4, 'vertical')).toBe(3);
    expect(rovingTarget('ArrowRight', -1, 4, 'horizontal')).toBe(0);
    expect(rovingTarget('ArrowLeft', -1, 4, 'horizontal')).toBe(3);
  });

  it('has nowhere to go in an empty group', () => {
    for (const key of ['Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(rovingTarget(key, 0, 0, 'both')).toBeNull();
    }
  });

  it('leaves other keys alone', () => {
    expect(rovingTarget('a', 1, 4, 'both')).toBeNull();
    expect(rovingTarget('Enter', 1, 4, 'both')).toBeNull();
  });
});
