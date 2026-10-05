import { describe, expect, it } from 'vitest';
import { againstYesterday, signed } from './ledgerWords';

describe('againstYesterday', () => {
  it('goes up for more money in and down for more money out', () => {
    expect(againstYesterday(500, 300)).toBe('up');
    expect(againstYesterday(-500, -300)).toBe('down');
    expect(againstYesterday(-200, -300)).toBe('up');
  });

  it('says nothing for a day like the one before', () => {
    expect(againstYesterday(0, 0)).toBeNull();
    expect(againstYesterday(-40, -40)).toBeNull();
  });
});

describe('signed', () => {
  it('signs a figure but not zero', () => {
    expect(signed(1240)).toBe('+1,240');
    expect(signed(-40)).toBe('-40');
    expect(signed(0)).toBe('0');
  });
});
