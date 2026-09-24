import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Shelter } from '../../../../voxel-gen/voxelgen.ts';
import { mix } from './night';

export type Weather = 'clear' | 'rain' | 'storm' | 'heatwave';

export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'storm', 'heatwave'];

type PerNeed = { readonly [need in GuestNeed]: number };

export interface WeatherEffect {
  readonly weight: PerNeed;
  readonly decay: PerNeed;
  readonly closes: Shelter | null;
  readonly overcast: number;
}

// Beyond this range the weather would outweigh the archetypes and become the tuning
// surface; weather.test.ts enforces it.
export const MAX_EFFECT = { min: 0.5, max: 2 } as const;

const NO_CHANGE: PerNeed = { hunger: 1, thirst: 1, energy: 1, fun: 1, hygiene: 1 };

// Every day moves both weight and decay: moving only one makes guests thirsty without
// wanting a drink, or the reverse.
const WEATHER_EFFECTS: { readonly [kind in Weather]: WeatherEffect } = {
  clear: { weight: NO_CHANGE, decay: NO_CHANGE, closes: null, overcast: 0 },
  rain: {
    weight: { ...NO_CHANGE, fun: 1.2, hygiene: 0.8 },
    decay: NO_CHANGE,
    closes: 'open',
    overcast: 0.55,
  },
  storm: {
    weight: { ...NO_CHANGE, fun: 1.2, hygiene: 0.8 },
    decay: { ...NO_CHANGE, energy: 1.2 },
    closes: 'open',
    overcast: 0.85,
  },
  // Decay runs ahead of weight so guests are already parched when the weight decides.
  heatwave: {
    weight: { ...NO_CHANGE, thirst: 1.6 },
    decay: { ...NO_CHANGE, thirst: 1.8, energy: 1.3 },
    closes: null,
    overcast: 0,
  },
};

export const CLEAR_EFFECT = WEATHER_EFFECTS.clear;

// Clear is about two days in three: weather every day is no event, and a beach shut
// half the week is one nobody builds.
const DRAW_RANGE = 24;
const CLEAR_IN = 16;
const RAIN_IN = 4;
const HEATWAVE_IN = 2;

// Derived from day and seed on every call, never stored. Hashed rather than taken
// modulo, which would cycle the kinds in lockstep.
export function weatherOn(day: number, seed: number): Weather {
  const draw = mix(Math.trunc(day) * 2_654_435_761 + seed) % DRAW_RANGE;
  if (draw < CLEAR_IN) return 'clear';
  if (draw < CLEAR_IN + RAIN_IN) return 'rain';
  if (draw < CLEAR_IN + RAIN_IN + HEATWAVE_IN) return 'heatwave';
  return 'storm';
}

export function weatherEffect(weather: Weather): WeatherEffect {
  return WEATHER_EFFECTS[weather];
}

// One predicate because three readers (chooseVenue, the router's door, cleaners) must agree.
export function isOpenIn(shelter: Shelter, effect: WeatherEffect): boolean {
  return effect.closes === null || shelter !== effect.closes;
}
