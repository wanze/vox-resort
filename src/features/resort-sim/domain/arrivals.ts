import type { EventsState } from '../../events/domain/eventRuns';
import { bedCount, type Guests } from '../../guests/domain/guests';
import type { Random } from '../../layout/domain/random';
import { arrivalsDueBy, bedsOn, runCheckIn, wavesDue } from '../../sim/domain/checkIn';
import { countArrivals, type DayCounts } from '../../sim/domain/dayReport';
import { expectationFor } from '../../sim/domain/expectations';
import type { Happiness } from '../../sim/domain/happiness';
import type { Carrying } from '../../sim/domain/litter';
import type { Lodging } from '../../sim/domain/lodgings';
import type { Needs } from '../../sim/domain/needs';
import { arrivalsFor, type Rating } from '../../sim/domain/rating';
import type { Router } from '../../sim/domain/router';
import type { SceneryField } from '../../sim/domain/scenery';
import { forgetStay, type Thoughts } from '../../sim/domain/thoughts';
import { paidShareFor } from './dayClose';
import type { SimNow } from './simNow';

export interface ArrivalsState {
  readonly router: Pick<Router, 'arrivalNode' | 'receptionReachable' | 'admit' | 'sendHome'>;
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  readonly lodgings: readonly Lodging[];
  readonly scenery: SceneryField;
  events: Pick<EventsState, 'tired' | 'glow'>;
  readonly homeEarly: Set<number>;
  readonly nightOwls: Set<number>;
  readonly carrying: Carrying;
  readonly thoughts: Thoughts;
  today: DayCounts;
  rating: Rating;
  open: boolean;
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  newcomers: number[];
  arrivals: Random;
  beds: { readonly total: number; readonly taken: number };
}

export function partiesArrivedOn(guests: Guests, day: number): number[] {
  const parties = new Set<number>();
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1 && guests.arrivedOn[person] === day) {
      parties.add(guests.party[person]!);
    }
  }
  return [...parties];
}

function noteArrivedParties(resort: ArrivalsState, arrived: readonly number[]): void {
  const known = new Set(resort.newcomers);
  for (const person of arrived) {
    const party = resort.guests.party[person]!;
    if (!known.has(party)) resort.newcomers.push(party);
    known.add(party);
  }
}

// The rating comes first, so the morning coach is sized by the resort the current guests
// experienced.
export function runDay(resort: ArrivalsState, day: number): void {
  // Everybody kept up late has woken by now.
  resort.events.tired.clear();
  resort.homeEarly.clear();
  resort.nightOwls.clear();
  resort.newcomers = [];
  resort.arrivalsPlanned = arrivalsFor(resort.rating, bedsOn(resort.guests));
  resort.arrivalsAdmitted = 0;
  admitWave(resort, day, 0);
  sendDepartures(resort, day);
  const after = bedCount(resort.guests);
  resort.beds = { total: after.beds, taken: after.taken };
}

// The first wave is the day's own check-in, run by runDay with the rating it is sized by.
export function admitLaterWaves(resort: ArrivalsState, clock: SimNow, ticks: number): void {
  for (const wave of wavesDue(clock.ticks - ticks + 1, clock.ticks)) {
    if (wave > 0) admitWave(resort, clock.day, wave);
  }
}

// No reachable gate or desk means no arrivals, which is a real state the advice reports.
const canArrive = (resort: ArrivalsState): boolean =>
  resort.open && resort.router.arrivalNode >= 0 && resort.router.receptionReachable;

export function admitWave(resort: ArrivalsState, day: number, wave: number): void {
  const due = arrivalsDueBy(resort.arrivalsPlanned, wave);
  const room = due - resort.arrivalsAdmitted;
  if (!canArrive(resort) || room <= 0) {
    resort.arrivalsAdmitted = Math.max(resort.arrivalsAdmitted, due);
    return;
  }
  const arrived = runCheckIn({
    guests: resort.guests,
    needs: resort.needs,
    happiness: resort.happiness,
    rating: resort.rating,
    day,
    random: resort.arrivals,
    room,
    // The rating runDay sized the coach by, which is the resort these guests booked.
    expectationOf: (home) => expectationFor(resort.rating.stars, paidShareFor(resort, home)),
  });
  for (const person of arrived) {
    // The body was somebody else's, and so was whatever it was holding and thinking.
    resort.carrying.nodes[person] = 0;
    forgetStay(resort.thoughts, person);
    resort.events.glow[person] = 0;
    resort.router.admit(person, resort.router.arrivalNode);
  }
  noteArrivedParties(resort, arrived);
  resort.arrivalsAdmitted += arrived.length;
  resort.today = countArrivals(resort.today, arrived.length);
  const beds = bedCount(resort.guests);
  resort.beds = { total: beds.beds, taken: beds.taken };
}

// Once a day, not per tick; asking twice is free, so a guest who could not reach a gate is asked
// again tomorrow.
export function sendDepartures(resort: ArrivalsState, day: number): void {
  const { guests } = resort;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    if (guests.arrivedOn[person]! + guests.nights[person]! >= day) continue;
    resort.router.sendHome(person);
  }
}
