import type { Weather } from '../../sim/domain/weather';
import { WIND_HEADING } from './rainfall';

export type FlagSignal = 'calm' | 'caution' | 'danger';

// The colours lifeguards fly: green for safe water, yellow for take care, red for stay out.
export const FLAG_COLORS: { readonly [signal in FlagSignal]: number } = {
  calm: 0x3f9e4d,
  caution: 0xf0c02c,
  danger: 0xd8322a,
};

export function flagFor(weather: Weather): FlagSignal {
  if (weather === 'storm') return 'danger';
  return weather === 'rain' ? 'caution' : 'calm';
}

// The way the rain leans, so the flags and the rain agree where the wind blows.
export const DOWNWIND = { x: -Math.sin(WIND_HEADING), z: -Math.cos(WIND_HEADING) } as const;

// The yaw that points a cloth hung along +x downwind.
export const DOWNWIND_YAW = Math.atan2(-DOWNWIND.z, DOWNWIND.x);
