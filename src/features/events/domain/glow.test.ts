import { describe, expect, it } from 'vitest';
import { dimGlow, fadeGlow, GLOW_FADE_PER_HOUR, glowOn } from './glow';

describe('glowOn', () => {
  it('keeps the better of two shows rather than adding them', () => {
    const glow = new Float32Array(2);
    glowOn(glow, 0, 0.08);
    glowOn(glow, 0, 0.05);
    expect(glow[0]).toBeCloseTo(0.08);
    glowOn(glow, 0, 0.12);
    expect(glow[0]).toBeCloseTo(0.12);
    glowOn(glow, 5, 1);
    expect([...glow]).toHaveLength(2);
  });
});

describe('fadeGlow', () => {
  it('fades by the hour', () => {
    const glow = Float32Array.of(0.1, 0);
    fadeGlow(glow, 10);
    expect(glow[0]).toBeCloseTo(0.1 - 10 * GLOW_FADE_PER_HOUR);
    expect(glow[1]).toBe(0);
  });

  it('never fades past nothing, from either side', () => {
    const glow = Float32Array.of(0.01, -0.01);
    fadeGlow(glow, 24);
    expect([...glow]).toEqual([0, 0]);
  });

  it('wears a let-down off as it does a lift', () => {
    const glow = Float32Array.of(-0.1);
    fadeGlow(glow, 10);
    expect(glow[0]).toBeCloseTo(-0.1 + 10 * GLOW_FADE_PER_HOUR);
  });
});

describe('dimGlow', () => {
  it('takes a let-down off the lift there, and sinks no lower than the worst one', () => {
    const glow = new Float32Array(2);
    glow[0] = 0.14;
    dimGlow(glow, 0, 0.1);
    expect(glow[0]).toBeCloseTo(0.04);
    dimGlow(glow, 0, 0.1);
    expect(glow[0]).toBeCloseTo(-0.06);
    dimGlow(glow, 0, 0.1);
    expect(glow[0]).toBeCloseTo(-0.1);
    dimGlow(glow, 0, 0.05);
    expect(glow[0]).toBeCloseTo(-0.1);
    dimGlow(glow, 0, 0.2);
    expect(glow[0]).toBeCloseTo(-0.2);
    dimGlow(glow, 5, 1);
    expect([...glow]).toHaveLength(2);
  });
});
