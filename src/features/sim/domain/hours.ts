import type { Shelter } from '../../../../voxel-gen/voxelgen.ts';
import { TICKS_PER_DAY } from './simClock';
import { isOpenIn, type WeatherEffect } from './weather';

export interface Hours {
  readonly opens: number;
  readonly closes: number;
}

// The closing minute itself is shut, so 20:00-02:00 lets nobody in at 02:00.
export function openAt(hours: Hours | undefined, tickOfDay: number): boolean {
  if (!hours || hours.opens === hours.closes) return true;
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (hours.opens < hours.closes) return tick >= hours.opens && tick < hours.closes;
  return tick >= hours.opens || tick < hours.closes;
}

export function openNow(
  venue: { readonly shelter?: Shelter; readonly hours?: Hours },
  effect: WeatherEffect,
  tickOfDay: number,
): boolean {
  return isOpenIn(venue.shelter ?? 'covered', effect) && openAt(venue.hours, tickOfDay);
}

// The sound system is what breaks, so a broken-down venue has no music.
export function djPlays(
  venue: { readonly dj?: boolean; readonly shelter?: Shelter; readonly hours?: Hours },
  effect: WeatherEffect,
  tickOfDay: number,
  broken: boolean,
): boolean {
  return venue.dj === true && !broken && openNow(venue, effect, tickOfDay);
}
