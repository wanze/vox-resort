import { describe, expect, it } from 'vitest';
import { roughenTowards, roughnessOf } from './seaState';

describe('roughnessOf', () => {
  it('whips the sea up only in a storm', () => {
    expect(roughnessOf('clear')).toBe(0);
    expect(roughnessOf('heatwave')).toBe(0);
    expect(roughnessOf('rain')).toBeGreaterThan(0);
    expect(roughnessOf('storm')).toBe(1);
    expect(roughnessOf('rain')).toBeLessThan(roughnessOf('storm'));
  });
});

describe('roughenTowards', () => {
  it('gets up gradually rather than at once', () => {
    const after = roughenTowards(0, 'storm', 1);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(0.5);
  });

  it('settles on the weather given time', () => {
    let level = 0;
    for (let second = 0; second < 60; second++) level = roughenTowards(level, 'storm', 1);
    expect(level).toBeCloseTo(1, 3);
    for (let second = 0; second < 60; second++) level = roughenTowards(level, 'clear', 1);
    expect(level).toBeCloseTo(0, 3);
  });

  it('stands still when no time passes', () => {
    expect(roughenTowards(0.4, 'storm', 0)).toBe(0.4);
    expect(roughenTowards(0.4, 'storm', -1)).toBe(0.4);
  });
});
