import { SPEED_DAY_SECONDS, type SimSpeed } from '../../sim/domain/simClock';
import type { Weather } from '../../sim/domain/weather';

// Kept here rather than in the domain so a phrase can change without touching it.
export const WEATHER_NAMES: { readonly [kind in Weather]: string } = {
  clear: 'Sunny',
  rain: 'Rain',
  storm: 'Storm',
  heatwave: 'Heatwave',
};

export const WEATHER_NOTES: { readonly [kind in Weather]: string } = {
  clear: 'everywhere open',
  rain: 'everything without a roof shuts',
  storm: 'no roof, no business, and tiring',
  heatwave: 'everywhere open, everybody thirsty',
};

export function speedNote(speed: SimSpeed): string {
  const seconds = SPEED_DAY_SECONDS[speed];
  if (!Number.isFinite(seconds)) return 'the resort holds still';
  return seconds < 60 ? `a day lasts ${seconds} s` : `a day lasts ${seconds / 60} min`;
}
