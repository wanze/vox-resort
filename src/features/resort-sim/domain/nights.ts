import { isBroken } from '../../sim/domain/breakdowns';
import { djPlays, openNow } from '../../sim/domain/hours';
import { isPastTen, nightOf, planNightsOut } from '../../sim/domain/nightOut';
import { weatherEffect } from '../../sim/domain/weather';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import type { SimState } from './simState';

export const isOutTonight = (
  resort: Pick<SimState, 'nightOutUntil' | 'homeEarly'>,
  party: number,
  now: number,
): boolean => (resort.nightOutUntil[party] ?? -1) > now && !resort.homeEarly.has(party);

// Last orders: a venue that is shut by then is no reason to stay out.
const LATE_CHECK = 23 * TICKS_PER_HOUR;

function lateVenueTonight(resort: SimState, clock: SimNow): boolean {
  const effect = weatherEffect(clock.weather);
  return resort.venues.some(
    (venue, index) =>
      venue.hours !== undefined &&
      !resort.unreachable.has(venue.key) &&
      !isBroken(resort.breakdowns, index) &&
      openNow(venue, effect, LATE_CHECK),
  );
}

export function refreshNightOut(resort: SimState, clock: SimNow): void {
  const { parties, child } = resort.guests;
  if (resort.nightOutUntil.length < parties.length) {
    resort.nightOutUntil = new Int32Array(parties.length);
  }
  if (lateVenueTonight(resort, clock)) {
    planNightsOut(parties, child, nightOf(clock.ticks), resort.nightOutUntil);
  } else resort.nightOutUntil.fill(-1);
}

const isOutAndUp = (resort: SimState, party: number, now: number): boolean =>
  isOutTonight(resort, party, now) &&
  resort.guests.parties[party]!.members.some(
    (member) => resort.guests.present[member] === 1 && !resort.router.isAsleep(member),
  );

// Hourly: whoever is still out and awake past ten wakes the worse for it.
export function markNightOwls(resort: SimState, clock: SimNow): void {
  if (!isPastTen(clock.tickOfDay)) return;
  for (let party = 0; party < resort.guests.parties.length; party++) {
    if (isOutAndUp(resort, party, clock.ticks)) resort.nightOwls.add(party);
  }
}

export function refreshDj(resort: SimState, clock: SimNow): void {
  const { venues } = resort;
  if (resort.djOn.length !== venues.length) resort.djOn = new Uint8Array(venues.length);
  const effect = weatherEffect(clock.weather);
  for (const [index, venue] of venues.entries()) {
    const broken = isBroken(resort.breakdowns, index);
    resort.djOn[index] = Number(djPlays(venue, effect, clock.tickOfDay, broken));
  }
}
