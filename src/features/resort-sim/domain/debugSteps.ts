import {
  firstDayOf,
  inBreak,
  nextSeason,
  SEASON_DAYS,
  startTally,
  type Season,
} from '../../sim/domain/season';
import { closeTheSeason } from './arrivals';
import { endSeason } from './seasonSteps';
import type { SimNow } from './simNow';
import type { SimState } from './simState';

export const SEASON_ACTIONS = ['early', 'holidays', 'late', 'last', 'close', 'end'] as const;

export type SeasonAction = (typeof SEASON_ACTIONS)[number];

type Jump = Exclude<SeasonAction, 'close' | 'end'>;

const JUMP_DAYS: { readonly [jump in Jump]: number } = {
  early: firstDayOf('early'),
  holidays: firstDayOf('holidays'),
  late: firstDayOf('late'),
  last: SEASON_DAYS,
};

// 'opened' started the next season from a break, whose clock the HUD then resumes.
export type SeasonOutcome = 'moved' | 'opened' | 'closing' | 'ended';

// Today's calendar day becomes the season day, as phaseOn reads it. A season day only starts at
// the 11:00 check-in, so before 11:00 today's coach is the chosen day's; after it, tomorrow's is.
const startedOnFor = (clock: Pick<SimNow, 'day'>, seasonDay: number): number =>
  clock.day - seasonDay + 1;

export function canRunSeasonAction(
  season: Pick<Season, 'state'> | null,
  action: SeasonAction,
): boolean {
  if (!season) return false;
  if (action === 'close') return season.state === 'running';
  if (action === 'end') return season.state !== 'break';
  return true;
}

// Only the calendar moves: the days skipped are not simulated, so the season's tally counts only
// the days played. From a break, a jump opens the next season as Open season does.
export function runSeasonAction(
  resort: SimState,
  clock: Pick<SimNow, 'day'>,
  action: SeasonAction,
): SeasonOutcome | null {
  const { season } = resort;
  if (!season || !canRunSeasonAction(season, action)) return null;
  if (action === 'end') {
    endSeason(resort);
    return 'ended';
  }
  if (action === 'close') {
    // Today becomes the closing day, and its morning's step runs now.
    closeTheSeason(resort, { ...season, startedOn: startedOnFor(clock, SEASON_DAYS + 1) });
    return 'closing';
  }
  const startedOn = startedOnFor(clock, JUMP_DAYS[action]);
  if (!inBreak(season)) {
    resort.season = { ...season, startedOn, state: 'running' };
    return 'moved';
  }
  resort.season = nextSeason(season, startedOn);
  resort.seasonTally = startTally();
  resort.open = true;
  return 'opened';
}
