import { bedCount, presentCount } from '../../guests/domain/guests';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import {
  closeSeason,
  inBreak,
  keepSeason,
  nextSeason,
  startTally,
  tallyClosingDay,
} from '../../sim/domain/season';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import { seeOff, type SimState } from './simState';

// A guest who cannot reach a gate would keep the season open for ever otherwise.
const LAST_CALL_TICK = 22 * TICKS_PER_HOUR;

export const seasonDueToEnd = (resort: SimState, clock: SimNow): boolean =>
  resort.season?.state === 'closing' &&
  (presentCount(resort.guests) === 0 || clock.tickOfDay >= LAST_CALL_TICK);

export function endSeason(resort: SimState): void {
  const { season, guests } = resort;
  if (!season) return;
  const parties = new Set<number>();
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1) parties.add(guests.party[person]!);
  }
  for (const party of parties) seeOff(resort, party);
  const tally = tallyClosingDay(resort.seasonTally, resort.today, resort.ledger.today);
  resort.seasons = keepSeason(resort.seasons, closeSeason(tally, season, resort.ledger.balance));
  resort.seasonTally = startTally();
  resort.open = false;
  resort.season = { ...season, state: 'break' };
  const beds = bedCount(guests);
  resort.beds = { total: beds.beds, taken: beds.taken };
}

// The season starts at the next 11:00 check-in, today's if the clock has not reached it yet.
export function openSeason(resort: SimState, clock: Pick<SimNow, 'day' | 'tickOfDay'>): boolean {
  const { season } = resort;
  if (!season || !inBreak(season)) return false;
  const startsOn = clock.tickOfDay < CHECK_IN_TICK ? clock.day : clock.day + 1;
  resort.season = nextSeason(season, startsOn);
  resort.seasonTally = startTally();
  resort.open = true;
  return true;
}
