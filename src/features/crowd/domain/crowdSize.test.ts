import { describe, expect, it } from 'vitest';
import { crowdOverrideFrom, crowdSizeFor, crowdSizeForArea, MAX_CROWD } from './crowdSize';

describe('crowdSizeFor', () => {
  it('keeps the authored resort the crowd it was designed around', () => {
    expect(crowdSizeFor(2398)).toBe(600);
  });

  it('grows with the paving', () => {
    expect(crowdSizeFor(32_000)).toBe(8000);
    expect(crowdSizeFor(0)).toBe(0);
  });

  it('stops at the ceiling', () => {
    expect(crowdSizeFor(1_000_000)).toBe(MAX_CROWD);
    expect(crowdSizeFor(10, 50_000)).toBe(MAX_CROWD);
  });

  it('takes an override over the paving', () => {
    expect(crowdSizeFor(2398, 25)).toBe(25);
    expect(crowdSizeFor(2398, 0)).toBe(0);
  });
});

describe('crowdSizeForArea', () => {
  it('deals a plot built by hand what a generated plot of its size holds', () => {
    expect(crowdSizeForArea(112, 100)).toBe(560);
  });

  it('stops at the ceiling', () => {
    expect(crowdSizeForArea(480, 480)).toBe(MAX_CROWD);
  });

  it('takes an override over the area', () => {
    expect(crowdSizeForArea(112, 100, 25)).toBe(25);
  });
});

describe('crowdOverrideFrom', () => {
  it('reads a whole count', () => {
    expect(crowdOverrideFrom('?people=1200')).toBe(1200);
    expect(crowdOverrideFrom('?bench=1&people=0')).toBe(0);
  });

  it('ignores anything that is not one', () => {
    expect(crowdOverrideFrom('')).toBeNull();
    expect(crowdOverrideFrom('?people=')).toBeNull();
    expect(crowdOverrideFrom('?people=-4')).toBeNull();
    expect(crowdOverrideFrom('?people=2.5')).toBeNull();
    expect(crowdOverrideFrom('?people=lots')).toBeNull();
  });
});
