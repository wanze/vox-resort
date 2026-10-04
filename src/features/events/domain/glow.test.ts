import { describe, expect, it } from 'vitest';
import { fadeGlow, GLOW_FADE_PER_HOUR, glowOn } from './glow';

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

  it('never fades below nothing', () => {
    const glow = Float32Array.of(0.01);
    fadeGlow(glow, 24);
    expect(glow[0]).toBe(0);
  });
});
