import { describe, expect, it } from 'vitest';
import {
  castsSunShadow,
  deviceShadowQuality,
  groundReach,
  halfSizeFor,
  isShadowQuality,
  knownCount,
  lightBasis,
  SHADOW_MAP_SIZE,
  shadowFrameFor,
  shadowQualityFor,
  SUN_CASTER_HEIGHT,
  type DeviceFacts,
} from './sunShadows';

const MORNING = { x: 0.6, y: 0.5, z: 0.62 };

const DESKTOP: DeviceFacts = { coarsePointer: false, webgpu: true, cores: 10, memoryGb: 16 };

describe('castsSunShadow', () => {
  it('leaves pieces under half a tile out of the map', () => {
    expect(castsSunShadow(SUN_CASTER_HEIGHT - 1)).toBe(false);
    expect(castsSunShadow(SUN_CASTER_HEIGHT)).toBe(true);
  });
});

describe('deviceShadowQuality', () => {
  it('draws the map on a desktop with WebGPU', () => {
    expect(deviceShadowQuality(DESKTOP)).toBe('high');
  });

  it('keeps the blobs on touch screens and the WebGL2 fallback', () => {
    expect(deviceShadowQuality({ ...DESKTOP, coarsePointer: true })).toBe('low');
    expect(deviceShadowQuality({ ...DESKTOP, webgpu: false })).toBe('low');
  });

  it('keeps the blobs on a small machine, and trusts a browser that will not say', () => {
    expect(deviceShadowQuality({ ...DESKTOP, cores: 4 })).toBe('low');
    expect(deviceShadowQuality({ ...DESKTOP, memoryGb: 4 })).toBe('low');
    expect(deviceShadowQuality({ ...DESKTOP, cores: null, memoryGb: null })).toBe('high');
  });
});

describe('shadowQualityFor', () => {
  it("prefers the player's choice to the device's default", () => {
    expect(shadowQualityFor('low', DESKTOP)).toBe('low');
    expect(shadowQualityFor('high', { ...DESKTOP, coarsePointer: true })).toBe('high');
    expect(shadowQualityFor(null, DESKTOP)).toBe('high');
  });

  it('reads a count only when the browser gives a real one', () => {
    expect(knownCount(8)).toBe(8);
    expect(knownCount(0)).toBeNull();
    expect(knownCount(undefined)).toBeNull();
  });

  it('knows its own values', () => {
    expect(isShadowQuality('high')).toBe(true);
    expect(isShadowQuality('ultra')).toBe(false);
  });
});

describe('halfSizeFor', () => {
  it('covers the reach with a margin, in steps', () => {
    const half = halfSizeFor(400);
    expect(half).toBeGreaterThan(400);
    expect(halfSizeFor(401)).toBe(half);
  });

  it('is clamped at both ends', () => {
    expect(halfSizeFor(1)).toBe(64);
    expect(halfSizeFor(1e6)).toBe(2048);
  });
});

const down = (x: number, z: number) => ({
  origin: { x, y: 100, z },
  direction: { x: 0, y: -1, z: 0 },
});

describe('groundReach', () => {
  const target = { x: 0, y: 0, z: 0 };

  it('is the furthest corner where it meets the ground', () => {
    expect(groundReach(target, [down(30, 40), down(-10, 0)], 1000)).toBeCloseTo(50);
  });

  it('follows a slanted ray down to the target level', () => {
    const slanted = { origin: { x: 0, y: 100, z: 0 }, direction: { x: 1, y: -1, z: 0 } };
    expect(groundReach({ x: 0, y: 20, z: 0 }, [slanted], 1000)).toBeCloseTo(80);
  });

  it('takes the cap for a corner on the horizon or beyond', () => {
    const level = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    expect(groundReach(target, [down(5, 5), level], 700)).toBe(700);
  });
});

describe('lightBasis', () => {
  it('lies level across the light and upright along it, as Three.js aims a light', () => {
    const { right, up, back } = lightBasis(MORNING);
    expect(right.y).toBeCloseTo(0);
    expect(up.y).toBeGreaterThan(0);
    expect(right.x * back.x + right.y * back.y + right.z * back.z).toBeCloseTo(0);
    // up × back points right, as the camera's own x axis does.
    expect(back.z * right.x - back.x * right.z).toBeGreaterThan(0);
  });

  it('survives a sun straight overhead', () => {
    const { right } = lightBasis({ x: 0, y: 1, z: 0 });
    expect(Math.hypot(right.x, right.y, right.z)).toBeCloseTo(1);
  });
});

describe('shadowFrameFor', () => {
  it('snaps the focus to the texel grid across the light', () => {
    const frame = shadowFrameFor({ target: { x: 101.3, y: 4, z: 57.9 }, reach: 300 }, MORNING);
    const texel = (frame.halfSize * 2) / SHADOW_MAP_SIZE;
    const { right, up } = lightBasis(MORNING);
    const across = (axis: typeof right): number =>
      (frame.focus.x * axis.x + frame.focus.y * axis.y + frame.focus.z * axis.z) / texel;
    expect(across(right)).toBeCloseTo(Math.round(across(right)), 6);
    expect(across(up)).toBeCloseTo(Math.round(across(up)), 6);
  });

  it('moves the focus by under a texel', () => {
    const target = { x: 101.3, y: 4, z: 57.9 };
    const frame = shadowFrameFor({ target, reach: 300 }, MORNING);
    const texel = (frame.halfSize * 2) / SHADOW_MAP_SIZE;
    const off = Math.hypot(
      frame.focus.x - target.x,
      frame.focus.y - target.y,
      frame.focus.z - target.z,
    );
    expect(off).toBeLessThanOrEqual(texel);
  });
});
