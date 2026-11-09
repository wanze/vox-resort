import { describe, expect, it } from 'vitest';
import { percent, signed, whole } from './till';

describe('signed', () => {
  it('signs a figure but not zero', () => {
    expect(signed(1240)).toBe('+1,240');
    expect(signed(-40)).toBe('−40');
    expect(signed(0)).toBe('0');
  });
});

describe('whole', () => {
  it('rounds to a whole amount with thousands grouped', () => {
    expect(whole(1239.6)).toBe('1,240');
    expect(whole(0)).toBe('0');
  });
});

describe('percent', () => {
  it('gives a share as a whole percentage', () => {
    expect(percent(0.3)).toBe('30%');
    expect(percent(0.726)).toBe('73%');
  });
});
