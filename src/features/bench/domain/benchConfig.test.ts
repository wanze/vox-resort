import { describe, expect, it } from 'vitest';
import type { WorldBounds } from '../../layout/domain/worldBounds';
import { benchFraming, DEFAULT_BENCH, parseBenchConfig } from './benchConfig';

const BOUNDS: WorldBounds = { minX: 0, minZ: 0, maxX: 960, maxZ: 832, height: 40 };

describe('parseBenchConfig', () => {
  it('is off unless asked for', () => {
    expect(parseBenchConfig('')).toBeNull();
    expect(parseBenchConfig('?view=street&time=0.1')).toBeNull();
    expect(parseBenchConfig('?bench=0')).toBeNull();
    expect(parseBenchConfig('?bench=false')).toBeNull();
  });

  it('defaults everything the URL leaves out', () => {
    expect(parseBenchConfig('?bench=1')).toEqual(DEFAULT_BENCH);
  });

  it('reads a full configuration', () => {
    expect(
      parseBenchConfig('?bench=1&view=street&time=0.05&warmup=30&frames=200&repeat=3&webgl=1'),
    ).toEqual({
      view: 'street',
      time: 0.05,
      warmupFrames: 30,
      measureFrames: 200,
      repeat: 3,
      forceWebGL: true,
      forceMainThreadMeshing: false,
      detail: true,
    });
  });

  it('can turn the level of detail off, to price what it saves', () => {
    expect(parseBenchConfig('?bench=1')?.detail).toBe(true);
    expect(parseBenchConfig('?bench=1&lod=1')?.detail).toBe(true);
    expect(parseBenchConfig('?bench=1&lod=0')?.detail).toBe(false);
  });

  it('can pin meshing to the main thread, to price what the worker saves', () => {
    expect(parseBenchConfig('?bench=1')?.forceMainThreadMeshing).toBe(false);
    expect(parseBenchConfig('?bench=1&worker=0')?.forceMainThreadMeshing).toBe(true);
  });

  it('stays on the default backend unless the fallback is asked for', () => {
    expect(parseBenchConfig('?bench=1')?.forceWebGL).toBe(false);
    expect(parseBenchConfig('?bench=1&webgl=0')?.forceWebGL).toBe(false);
  });

  it('wraps a time outside the day onto 0..1', () => {
    expect(parseBenchConfig('?bench=1&time=1.25')?.time).toBeCloseTo(0.25, 6);
    expect(parseBenchConfig('?bench=1&time=-0.25')?.time).toBeCloseTo(0.75, 6);
  });

  it('falls back on nonsense rather than measuring something undefined', () => {
    const config = parseBenchConfig('?bench=1&view=orbit&time=x&warmup=-5&frames=0&repeat=0');
    expect(config).toEqual(DEFAULT_BENCH);
  });
});

describe('benchFraming', () => {
  it('frames the overview exactly as the app opens it', () => {
    const framing = benchFraming('overview', BOUNDS, 55);
    expect(framing.target).toEqual({ x: 480, y: 20, z: 416 });
    expect(framing.position.y).toBeGreaterThan(framing.target.y);
  });

  it('puts the street camera at eye level inside the plot', () => {
    const framing = benchFraming('street', BOUNDS, 55);
    expect(framing.position.y).toBeLessThan(BOUNDS.height);
    expect(framing.position.x).toBe(480);
    expect(framing.position.z).toBeGreaterThan(framing.target.z);
    expect(framing.position.z).toBeLessThan(BOUNDS.maxZ);
    expect(framing.target.z).toBeGreaterThan(BOUNDS.minZ);
  });

  it('scales both presets with the plot', () => {
    const bigger: WorldBounds = { ...BOUNDS, maxX: 1920, maxZ: 1664 };
    expect(benchFraming('overview', bigger, 55).position.y).toBeGreaterThan(
      benchFraming('overview', BOUNDS, 55).position.y,
    );
    expect(benchFraming('street', bigger, 55).position.z).toBeGreaterThan(
      benchFraming('street', BOUNDS, 55).position.z,
    );
  });
});
