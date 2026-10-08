import { describe, expect, it } from 'vitest';
import type { WorldBounds } from '../../layout/domain/worldBounds';
import {
  benchFraming,
  benchRefusal,
  benchStep,
  DEFAULT_BENCH,
  parseBenchConfig,
  timesGpu,
} from './benchConfig';

const refused = (search: string) => benchRefusal(parseBenchConfig(search)!);

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
      weather: null,
    });
  });

  it('can style the authored plot, so a run can price the variants', () => {
    expect(parseBenchConfig('?bench=1')?.styles).toBeUndefined();
    expect(parseBenchConfig('?bench=1&styles=mixed')?.styles).toBe('mixed');
    expect(parseBenchConfig('?bench=1&styles=scatter')?.styles).toBe('scatter');
    expect(parseBenchConfig('?bench=1&styles=gaudy')?.styles).toBeUndefined();
  });

  it('can play a show of any size, so a run can price the fireworks', () => {
    expect(parseBenchConfig('?bench=1&fireworks=grand')?.fireworks).toBe('grand');
    expect(parseBenchConfig('?bench=1&fireworks=small')?.fireworks).toBe('small');
  });

  it('plays no show unless one of the sizes is asked for', () => {
    expect(parseBenchConfig('?bench=1')).not.toHaveProperty('fireworks');
    expect(parseBenchConfig('?bench=1&fireworks=colossal')).not.toHaveProperty('fireworks');
    expect(parseBenchConfig('?bench=1&fireworks=')).not.toHaveProperty('fireworks');
  });

  it('can pave the authored plot in mosaic, so a run can price the pieces', () => {
    expect(parseBenchConfig('?bench=1')?.mosaic).toBeUndefined();
    expect(parseBenchConfig('?bench=1&mosaic=1')?.mosaic).toBe(true);
    expect(parseBenchConfig('?bench=1&mosaic=0')?.mosaic).toBeUndefined();
  });

  it('can run the reference resort, so a run can price the sea and the beach', () => {
    expect(parseBenchConfig('?bench=1&plot=reference')?.plot).toBe('reference');
  });

  it('keeps the authored plot unless the reference resort is asked for', () => {
    expect(parseBenchConfig('?bench=1')).not.toHaveProperty('plot');
    expect(parseBenchConfig('?bench=1&plot=island')).not.toHaveProperty('plot');
  });

  it('refuses to tile, style or pave the reference resort, which runs as it was built', () => {
    expect(refused('?bench=1&plot=reference')).toBeNull();
    expect(refused('?bench=1&plot=reference&repeat=2')).not.toBeNull();
    expect(refused('?bench=1&plot=reference&styles=mixed')).not.toBeNull();
    expect(refused('?bench=1&plot=reference&mosaic=1')).not.toBeNull();
    expect(refused('?bench=1&repeat=2&styles=mixed&mosaic=1')).toBeNull();
  });

  it('can run the clock at any playing speed, so a run can price the sim', () => {
    expect(parseBenchConfig('?bench=1&speed=normal')?.speed).toBe('normal');
    expect(parseBenchConfig('?bench=1&speed=fast')?.speed).toBe('fast');
    expect(parseBenchConfig('?bench=1&speed=rush')?.speed).toBe('rush');
  });

  it('follows a guest at the shoulder or through their eyes', () => {
    expect(parseBenchConfig('?bench=1&follow=third')?.follow).toBe('third');
    expect(parseBenchConfig('?bench=1&follow=first')?.follow).toBe('first');
  });

  it('follows nobody unless a view is asked for', () => {
    expect(parseBenchConfig('?bench=1')).not.toHaveProperty('follow');
    expect(parseBenchConfig('?bench=1&follow=second')).not.toHaveProperty('follow');
    expect(parseBenchConfig('?bench=1&follow=')).not.toHaveProperty('follow');
  });

  it('keeps the clock paused unless a playing speed is asked for', () => {
    expect(parseBenchConfig('?bench=1')).not.toHaveProperty('speed');
    expect(parseBenchConfig('?bench=1&speed=paused')).not.toHaveProperty('speed');
    expect(parseBenchConfig('?bench=1&speed=slow')).not.toHaveProperty('speed');
    expect(parseBenchConfig('?bench=1&speed=warp')).not.toHaveProperty('speed');
    expect(parseBenchConfig('?bench=1&speed=')).not.toHaveProperty('speed');
  });

  it('can pin the weather, so a run can price the rain', () => {
    expect(parseBenchConfig('?bench=1')?.weather).toBeNull();
    expect(parseBenchConfig('?bench=1&weather=storm')?.weather).toBe('storm');
    expect(parseBenchConfig('?bench=1&weather=heatwave')?.weather).toBe('heatwave');
    expect(parseBenchConfig('?bench=1&weather=hail')?.weather).toBeNull();
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

  it('falls back on a repeat too large to build', () => {
    expect(parseBenchConfig('?bench=1&repeat=10')?.repeat).toBe(10);
    expect(parseBenchConfig('?bench=1&repeat=11')?.repeat).toBe(DEFAULT_BENCH.repeat);
    expect(parseBenchConfig('?bench=1&repeat=1000000')?.repeat).toBe(DEFAULT_BENCH.repeat);
  });
});

describe('timesGpu', () => {
  it('times the GPU only under a bench or the gpu flag', () => {
    expect(timesGpu('')).toBe(false);
    expect(timesGpu('?gpu')).toBe(true);
    expect(timesGpu('?gpu=1')).toBe(true);
    expect(timesGpu('?gpu=0')).toBe(false);
    expect(timesGpu('?gpu=false')).toBe(false);
    expect(timesGpu('?bench=1')).toBe(true);
    expect(timesGpu('?bench=0&gpu=1')).toBe(true);
    expect(timesGpu('?people=50')).toBe(false);
  });
});

describe('benchStep', () => {
  it('keeps the paused step, so paused numbers still compare', () => {
    expect(benchStep(DEFAULT_BENCH)).toBe(0.1);
  });

  it("steps a running clock by a 60 Hz player's frame", () => {
    for (const speed of ['normal', 'fast', 'rush']) {
      expect(benchStep(parseBenchConfig(`?bench=1&speed=${speed}`)!)).toBeCloseTo(1 / 60, 9);
    }
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
