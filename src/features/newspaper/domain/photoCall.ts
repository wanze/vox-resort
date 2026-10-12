import { lastNightOf, type Season } from '../../sim/domain/season';

// The last evening, while the resort is still full and the light is low; by the time the season
// ends the last guests have gone.
export const PHOTO_CALL_HOUR = 19;

// From the hour on rather than at it, so a frame that steps over 19:00 at speed still asks.
// `answered` is the season a front-page photo is already kept for, if any.
export const photoCallDue = (
  season: Season | null,
  day: number,
  hour: number,
  answered: number | null,
): boolean =>
  season !== null &&
  season.state === 'running' &&
  day === lastNightOf(season) &&
  hour >= PHOTO_CALL_HOUR &&
  answered !== season.number;
