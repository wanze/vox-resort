import type { SeasonAction, UpkeepAction } from '../../resort-sim/domain/debugSteps';
import { firstDayOf, SEASON_DAYS } from '../../sim/domain/season';
import { TURBO_DAY_SECONDS } from '../domain/turbo';

const becomes = (seasonDay: number): string => `today becomes season day ${seasonDay}`;

export const SEASON_ACTION_WORDS: {
  readonly [action in SeasonAction]: { readonly label: string; readonly note: string };
} = {
  early: { label: 'Go to early season', note: becomes(firstDayOf('early')) },
  holidays: { label: 'Go to school holidays', note: becomes(firstDayOf('holidays')) },
  late: { label: 'Go to late season', note: becomes(firstDayOf('late')) },
  last: {
    label: 'Go to the last day',
    note: `${becomes(SEASON_DAYS)}; the season closes tomorrow at 11:00`,
  },
  close: {
    label: 'Close the season now',
    note: 'everybody is sent home; it ends once empty, or at 22:00',
  },
  end: { label: 'End the season now', note: 'straight to the break and the season report' },
};

export const UPKEEP_ACTION_WORDS: {
  readonly [action in UpkeepAction]: { readonly label: string; readonly note: string };
} = {
  week: { label: 'Age a week', note: "every building wears as if the last day's use ran 7 more" },
  season: {
    label: 'Age a season',
    note: `every building wears as if the last day's use ran ${SEASON_DAYS} more`,
  },
};

export const TURBO_WORDS = {
  label: 'Turbo',
  note: `about ${TURBO_DAY_SECONDS} s a day, so a season plays in a minute`,
};
