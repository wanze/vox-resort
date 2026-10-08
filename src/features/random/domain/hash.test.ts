import { describe, expect, it } from 'vitest';
import { fnv, mix, unitAt, unitOf } from './hash';

// Pinned values: every bedtime, style roll and visual draw follows from these.
describe('mix', () => {
  it('gives the pinned hashes', () => {
    expect(mix(0)).toBe(0);
    expect(mix(1)).toBe(1364076727);
    expect(mix(2)).toBe(821347078);
    expect(mix(42)).toBe(142593372);
    expect(mix(-1)).toBe(2180083513);
    expect(mix(2147483647)).toBe(4190899880);
    expect(mix(123456789)).toBe(3126909082);
  });
});

describe('fnv', () => {
  it('gives the pinned signed hashes', () => {
    expect(fnv('')).toBe(-2128831035);
    expect(fnv('a')).toBe(-468965076);
    expect(fnv('bungalow#0')).toBe(935579763);
    expect(fnv('restaurant@3,4')).toBe(208408907);
    expect(fnv('ü')).toBe(2030796987);
  });
});

describe('unitOf', () => {
  it('divides by 2^32', () => {
    expect(unitOf(0)).toBe(0);
    expect(unitOf(2147483648)).toBe(0.5);
    expect(unitOf(4294967295)).toBe(0.9999999997671694);
  });
});

describe('unitAt', () => {
  const pairs: readonly (readonly [number, number, number])[] = [
    [0, 0, 0.07026689755730331],
    [7, 3, 0.8173010400496423],
    [123456789, -1, 0.7280402542091906],
    [-5, 104729, 0.6805525540839881],
  ];

  it('gives the pinned fractions', () => {
    for (const [seed, index, expected] of pairs) expect(unitAt(seed, index)).toBe(expected);
  });

  it('is the golden-ratio spread index mixed with the seed', () => {
    for (const [seed, index] of pairs) {
      expect(unitAt(seed, index)).toBe(unitOf(mix(Math.imul(index + 1, 0x9e37_79b1) ^ seed)));
    }
  });
});
