import { SUNRISE_TIME } from '../../lighting/domain/dayNight';
import { EARLY_WAKE_FROM, isEarlyRiser } from '../../sim/domain/night';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { isWet } from '../../sim/domain/views';
import { beachIndexOf } from './eventSteps';
import type { SimNow } from './simNow';
import type { SimState } from './simState';

const SUNRISE_TICK = Math.round(SUNRISE_TIME * TICKS_PER_DAY);

// Asked later, a party would reach the sand with the sun already up and nothing left to wait for.
const ASKED_UNTIL = SUNRISE_TICK;

// The first hour of the sun, while its light is still golden (views.ts): the walk down takes
// half an hour on the reference resort, so a shorter watch would end as many of them arrive.
export const WATCHED_UNTIL = SUNRISE_TICK + 60;

// Kept as a stay on the sand, as a show's audience is, so the router gives the watchers a pitch
// facing the sea and no errands. Derived, never stored: a save holds nothing for it.
export function dawnStayOf(
  resort: Pick<SimState, 'venues' | 'siteVenues'>,
  party: number,
  venue: number,
  now: number,
): number {
  if (venue < 0 || venue !== beachIndexOf(resort) || !isEarlyRiser(party)) return -1;
  const ofDay = now % TICKS_PER_DAY;
  if (ofDay < EARLY_WAKE_FROM || ofDay >= WATCHED_UNTIL) return -1;
  return now - ofDay + WATCHED_UNTIL;
}

// Once a frame. Up and free, an early riser walks to the beach, as an event invites its audience:
// the party's first member, and the router sends the party. The sand is not step-free, so a party
// with a wheelchair stays on the paving, and nobody walks out to a sunrise behind rain.
export function sendToTheSunrise(resort: SimState, clock: SimNow): void {
  const { tickOfDay } = clock;
  if (tickOfDay < EARLY_WAKE_FROM || tickOfDay >= ASKED_UNTIL) return;
  if (isWet(clock.weather)) return;
  const beach = beachIndexOf(resort);
  if (beach < 0) return;
  const { guests, router } = resort;
  for (let party = 0; party < guests.parties.length; party++) {
    if (!isEarlyRiser(party)) continue;
    const { members, wheelchair } = guests.parties[party]!;
    if (wheelchair >= 0) continue;
    const first = members.find((member) => guests.present[member] === 1);
    if (first !== undefined && router.isFree(first)) router.invite(first, beach);
  }
}
