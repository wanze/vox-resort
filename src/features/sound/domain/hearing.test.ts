import { describe, expect, it } from 'vitest';
import type { SoundKind } from '../../../../voxel-gen/voxelgen.ts';
import type { Weather } from '../../sim/domain/weather';
import { SOUND_KINDS } from './bank';
import {
  approach,
  closeness,
  hear,
  hearingRadius,
  kindAt,
  LAYERS,
  MAX_VENUE_VOICES,
  type HeardScene,
  type Layer,
} from './hearing';

const CLOSE = 30;
const FAR = 4;

function scene(over: Partial<HeardScene> = {}, near: Partial<Record<SoundKind, number>> = {}) {
  const nearBy = new Float32Array(SOUND_KINDS.length);
  const open = new Float32Array(SOUND_KINDS.length);
  for (const [kind, value] of Object.entries(near)) {
    nearBy[kindAt(kind as SoundKind)] = value;
    open[kindAt(kind as SoundKind)] = 1;
  }
  return {
    tilePx: CLOSE,
    targetX: 0,
    targetZ: 0,
    night: 0,
    weather: 'clear' as Weather,
    stormSeconds: 0,
    shore: Infinity,
    awake: 1,
    guests: 0,
    children: 0,
    swimmers: 0,
    near: nearBy,
    open,
    ...over,
  };
}

function heard(input: HeardScene): Record<Layer, number> {
  const into = new Float32Array(LAYERS.length);
  hear(input, into);
  return Object.fromEntries(LAYERS.map((layer, at) => [layer, into[at]!])) as Record<Layer, number>;
}

describe('hear: venues', () => {
  it('gives no venue a voice from far out', () => {
    expect(heard(scene({ tilePx: FAR }, { cafe: 1 })).cafe).toBe(0);
  });

  it('plays the café when zoomed in beside one', () => {
    expect(heard(scene({}, { cafe: 0.8 })).cafe).toBeCloseTo(0.8);
  });

  it('quiets the venues as the resort goes to bed', () => {
    expect(heard(scene({ awake: 0.5 }, { cafe: 1 })).cafe).toBeCloseTo(0.5);
    expect(heard(scene({ awake: 0 }, { cafe: 1 })).cafe).toBe(0);
  });

  it('keeps a closed café silent', () => {
    const closed = scene({}, { cafe: 1 });
    closed.open[kindAt('cafe')] = 0;
    expect(heard(closed).cafe).toBe(0);
  });

  it(`plays at most ${MAX_VENUE_VOICES} venue kinds, the loudest`, () => {
    const levels = heard(scene({}, { cafe: 0.9, bar: 0.8, gym: 0.2, spa: 0.6, tennis: 0.4 }));
    const playing = (['cafe', 'bar', 'gym', 'spa', 'tennis'] as const).filter(
      (kind) => levels[kind] > 0,
    );
    expect(playing).toEqual(['cafe', 'bar', 'spa']);
  });
});

describe('hear: weather', () => {
  it('rains harder in a storm, with the wind up', () => {
    const clear = heard(scene());
    const rain = heard(scene({ weather: 'rain' }));
    const storm = heard(scene({ weather: 'storm' }));
    expect(clear.rain).toBe(0);
    expect(rain.rain).toBeGreaterThan(0);
    expect(storm.rain).toBeGreaterThan(rain.rain);
    expect(storm.wind).toBeGreaterThan(rain.wind);
    expect(rain.wind).toBeGreaterThan(clear.wind);
  });

  it('has birds by day and crickets at night among trees, both silent in rain', () => {
    const day = heard(scene({}, { trees: 6 }));
    const night = heard(scene({ night: 1 }, { trees: 6 }));
    expect(day.birds).toBe(1);
    expect(day.crickets).toBe(0);
    expect(night.birds).toBe(0);
    expect(night.crickets).toBe(1);
    const wet = heard(scene({ weather: 'rain' }, { trees: 6 }));
    expect(wet.birds).toBe(0);
    expect(wet.crickets).toBe(0);
  });

  it('has cicadas only in a heatwave', () => {
    expect(heard(scene({}, { trees: 6 })).cicadas).toBe(0);
    expect(heard(scene({ weather: 'heatwave' }, { trees: 6 })).cicadas).toBe(1);
  });
});

describe('hear: the sea and the guests', () => {
  it('fades the surf with distance, to a floor in reach and nothing out of it', () => {
    const levels = [0, 3, 6].map((shore) => heard(scene({ shore })).surf);
    expect(levels[0]).toBeGreaterThan(levels[1]!);
    expect(levels[1]).toBeGreaterThan(levels[2]!);
    expect(heard(scene({ shore: 30 })).surf).toBeCloseTo(0.15);
    expect(heard(scene({ shore: Infinity })).surf).toBe(0);
  });

  it('caps the crowd at full, and quietens it in the rain', () => {
    expect(heard(scene({ guests: 400 })).crowd).toBe(1);
    expect(heard(scene({ guests: 20 })).crowd).toBeCloseTo(0.5);
    expect(heard(scene({ guests: 400, weather: 'rain' })).crowd).toBeCloseTo(0.4);
  });
});

describe('hearingRadius and closeness', () => {
  it('hears further when zoomed out, fading to nothing at the edge', () => {
    expect(hearingRadius(FAR)).toBe(24);
    expect(hearingRadius(CLOSE)).toBe(8);
    expect(closeness(0, 8)).toBe(1);
    expect(closeness(8, 8)).toBe(0);
    expect(closeness(4, 8)).toBe(0.25);
  });
});

describe('approach', () => {
  it('converges on the target without overshooting', () => {
    let level = 0;
    for (let step = 0; step < 100; step++) {
      const next = approach(level, 1, 0.2, 1.5);
      expect(next).toBeGreaterThan(level);
      expect(next).toBeLessThanOrEqual(1);
      level = next;
    }
    expect(level).toBeGreaterThan(0.99);
    expect(approach(0.3, 0, 100, 0.8)).toBeCloseTo(0);
    expect(approach(0.3, 0, 100, 0.8)).toBeGreaterThanOrEqual(0);
  });
});
