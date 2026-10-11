import { describe, expect, it } from 'vitest';
import { againstYesterday, shortAmount, signed, toneOf } from './ledgerWords';

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

describe('toneOf', () => {
  it('greens money in, reddens money out and leaves nothing alone', () => {
    expect(toneOf(120)).toBe('good');
    expect(toneOf(-5)).toBe('bad');
    expect(toneOf(0)).toBeUndefined();
  });
});

describe('signed', () => {
  it('signs a figure but not zero', () => {
    expect(signed(1240)).toBe('+1,240');
    expect(signed(-40)).toBe('−40');
    expect(signed(0)).toBe('0');
  });
});

describe('shortAmount', () => {
  it('gives a small figure in full', () => {
    expect(shortAmount(9_870)).toBe('9,870');
    expect(shortAmount(-420)).toBe('-420');
  });

  it('shortens a large one to a tenth of its unit', () => {
    expect(shortAmount(187_826)).toBe('187.8K');
    expect(shortAmount(12_000)).toBe('12K');
    expect(shortAmount(-25_460)).toBe('-25.5K');
  });

  it('moves up a unit rather than rounding to a thousand of the one below', () => {
    expect(shortAmount(999_960)).toBe('1M');
    expect(shortAmount(1_240_000)).toBe('1.2M');
  });
});
