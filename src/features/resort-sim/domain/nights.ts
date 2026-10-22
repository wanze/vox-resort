import { NO_HOME } from '../../guests/domain/homes';
import { isBroken } from '../../sim/domain/breakdowns';
import { djPlays, openNow } from '../../sim/domain/hours';
import { listen, nightsOver, type NoisyNight } from '../../sim/domain/nightNoise';
import { isPastTen, nightOf, planNightsOut } from '../../sim/domain/nightOut';
import { feltOfKind, loudestOf, NOISE, type NuisanceLive } from '../../sim/domain/nuisance';
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

export interface NightEars {
  readonly asleepAt: (person: number) => number;
  readonly feltAt: (lodging: number) => number;
  readonly loudestAt: (lodging: number) => number;
}

const lodgingOf = (resort: SimState, person: number): number => {
  const home = resort.guests.home[person] ?? NO_HOME;
  return home === NO_HOME ? -1 : (resort.lodgingOfHome[home] ?? -1);
};

// Read through the state, as an edit replaces the lists they look in.
export const nightEarsOf = (resort: () => SimState, live: NuisanceLive): NightEars => ({
  asleepAt: (person) => (resort().router.isAsleep(person) ? lodgingOf(resort(), person) : -1),
  feltAt: (lodging) => feltOfKind(resort().lodgingNuisance, lodging, live, NOISE),
  loudestAt: (lodging) => loudestOf(resort().lodgingNuisance, lodging, live, NOISE),
});

// Once a frame, as the dark: a party asleep through the club's last hour hears all of it.
export function listenInTheNight(resort: SimState, hours: number): void {
  if (hours <= 0 || resort.router.asleepCount === 0) return;
  const { asleepAt, feltAt, loudestAt } = resort.nightEars;
  listen(resort.nightNoise, hours, resort.guests.count, asleepAt, feltAt, loudestAt);
}

export function settleTheNight(resort: SimState): void {
  const { guests, lodgings, nightNoise, venues } = resort;
  const nights = nightsOver(
    nightNoise,
    (person) => lodgingOf(resort, person),
    guests.present,
    lodgings.length,
  );
  const settled = new Map<string, NoisyNight>();
  nights.forEach(({ felt, woken }, lodging) => {
    const source = venues[nightNoise.loudest[lodging] ?? -1];
    if (felt <= 0 || !source) return;
    const from = resort.names.get(source.key) ?? source.label;
    settled.set(lodgings[lodging]!.key, { kind: 'noise', from, felt, woken });
  });
  resort.lastNightNoise = settled;
}
