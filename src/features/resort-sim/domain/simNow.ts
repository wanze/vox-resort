import type { Weather } from '../../sim/domain/weather';

export const TICKS_PER_HOUR = 60;

// What the rules read of the clock; the showcase's Clock satisfies it.
export interface SimNow {
  readonly ticks: number;
  readonly day: number;
  readonly tickOfDay: number;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
}
