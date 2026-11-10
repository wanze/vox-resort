import {
  arrive,
  arrivingOn,
  expire,
  left,
  offered,
  type Booking,
  type BookingsState,
  type Settlement,
} from '../../bookings/domain/bookings';
import {
  groupLeavesOn,
  groupShapesOf,
  planHolds,
  spareUntil,
  type BedHold,
  type HoldOptions,
} from '../../bookings/domain/bedHolds';
import { drawOffer, nextOfferAfter, offerDue, peopleExpected } from '../../bookings/domain/offers';
import {
  offeringOf,
  requirementNoun,
  unmetOn,
  type Offering,
  type Requirement,
  type ResortFacts,
} from '../../bookings/domain/requirements';
import { familyOf, OBJECT_TYPES, venueOf } from '../../catalog/domain/objectTypes';
import {
  ceremonySlot,
  withCeremony,
  withoutCeremony,
  type EventSite,
  type Programme,
} from '../../events/domain/programme';
import { byEventRoom } from '../../events/domain/sites';
import { priceOf } from '../../catalog/domain/prices';
import { isUnlocked } from '../../catalog/domain/unlocks';
import { createRandom } from '../../layout/domain/random';
import { CHECK_IN_TICK, runCheckIn } from '../../sim/domain/checkIn';
import { countTurnedAway } from '../../sim/domain/dayReport';
import { expectationFor } from '../../sim/domain/expectations';
import { record, type Ledger } from '../../sim/domain/ledger';
import type { Lodging } from '../../sim/domain/lodgings';
import type { Prestige } from '../../sim/domain/prestige';
import { lastNightOf } from '../../sim/domain/season';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { tallyInto, think } from '../../sim/domain/thoughts';
import type { Venue } from '../../sim/domain/venues';
import type { ArrivalsState } from './arrivals';
import { nightlyRate, paidShareFor } from './dayClose';

// Their own streams, salted off the day and the booking, so no draw of today's arrivals moves
// and a resort that never accepts an offer replays every seeded scene as before.
const OFFER_SALT = 0x27d4eb2f;
const GROUP_SALT = 0x165667b1;
const GOLDEN = 0x9e3779b1;

const offerRandom = (day: number) => createRandom(OFFER_SALT ^ Math.imul(day + 1, GOLDEN));
const groupRandom = (booking: number) => createRandom(GROUP_SALT ^ Math.imul(booking + 1, GOLDEN));

// Calm is the family's, as the sim's own venues read it: a variant only looks different.
function catalogueOffering(prestige: Prestige, mode: Ledger['mode']): Offering {
  return offeringOf(
    OBJECT_TYPES.flatMap((type) => {
      if (!type.venue || !isUnlocked(type.id, prestige, mode)) return [];
      return [{ ...type.venue, calm: venueOf(familyOf(type.id))?.calm === true }];
    }),
  );
}

interface StandingState {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly unreachable: ReadonlySet<string>;
  readonly constructing: ReadonlyMap<string, number>;
  readonly rating: { readonly stars: number };
}

const standingAt =
  (resort: Pick<StandingState, 'unreachable' | 'constructing'>, tick: number) =>
  (key: string): boolean =>
    !resort.unreachable.has(key) && (resort.constructing.get(key) ?? -1) <= tick;

// Only what a guest could walk into this morning: a site still building or out of reach is not there.
export function resortFactsAt(resort: StandingState, tick: number): ResortFacts {
  const standing = standingAt(resort, tick);
  return {
    ...offeringOf([
      ...resort.venues.filter((venue) => standing(venue.key)),
      ...resort.lodgings
        .filter((lodging) => standing(lodging.key))
        .map((lodging) => ({ role: 'lodging' as const, price: priceOf(lodging.id) })),
    ]),
    stars: resort.rating.stars,
  };
}

type HoldingResort = Pick<
  ArrivalsState,
  'guests' | 'bookings' | 'season' | 'closing' | 'renovating' | 'constructing'
>;

function holdOptions(resort: HoldingResort): HoldOptions {
  const lastNight = resort.season ? lastNightOf(resort.season) : undefined;
  return {
    lastNight,
    openOn: (key, day) => {
      const tick = day * TICKS_PER_DAY + CHECK_IN_TICK;
      return (
        !resort.closing.has(key) &&
        (resort.renovating.get(key) ?? -1) <= tick &&
        (resort.constructing.get(key) ?? -1) <= tick
      );
    },
  };
}

export const bedHoldsOf = (resort: HoldingResort, day: number): readonly BedHold[] =>
  planHolds(resort.guests, resort.bookings.accepted, day, holdOptions(resort));

// Undefined with nothing held, so a resort with no group due checks in exactly as before.
export function spareBedsFor(
  resort: HoldingResort,
  day: number,
  holds: readonly BedHold[],
  except?: number,
): ((leavesOn: number) => ArrayLike<number> | undefined) | undefined {
  if (holds.every((hold) => hold.booking === except)) return undefined;
  const options = holdOptions(resort);
  return (leavesOn) =>
    spareUntil(resort.guests, holds, day, {
      ...options,
      leavesOn,
      ...(except === undefined ? {} : { except }),
    });
}

// One party a call, in the shape its beds were held for: runCheckIn's draw order is untouched,
// only its stream is the group's own.
function checkInGroup(
  resort: ArrivalsState,
  booking: Booking,
  day: number,
  holds: readonly BedHold[],
  admit: (arrived: readonly number[]) => void,
): {
  readonly parties: readonly number[];
  readonly turnedAway: number;
  readonly arrived: number[];
} {
  const { guests } = resort;
  const random = groupRandom(booking.id);
  const lastNight = resort.season ? lastNightOf(resort.season) : undefined;
  const parties: number[] = [];
  const arrived: number[] = [];
  let turnedAway = 0;
  // A group's nights are its booking's, not the draw's, so it asks to the morning it really goes.
  const spare = spareBedsFor(resort, day, holds, booking.id);
  const leavesOn = groupLeavesOn(booking, lastNight);
  for (const shape of groupShapesOf(booking)) {
    const people = runCheckIn({
      guests,
      needs: resort.needs,
      happiness: resort.happiness,
      rating: resort.rating,
      day,
      random,
      room: 1,
      expectationOf: (home) => expectationFor(booking.promisedStars, paidShareFor(resort, home)),
      shape,
      lastNight,
      spare: spare && (() => spare(leavesOn)),
    });
    if (people.length === 0) {
      turnedAway++;
      continue;
    }
    const nights =
      lastNight === undefined ? booking.nights : Math.min(booking.nights, lastNight - day + 1);
    for (const person of people) guests.nights[person] = Math.max(1, nights);
    parties.push(guests.party[people[0]!]!);
    arrived.push(...people);
  }
  admit(arrived);
  return { parties, turnedAway, arrived };
}

// The afternoon after arrival, on the biggest stage standing; with none, there is no ceremony, and
// the missing stage is already the group's broken promise.
function planCeremony(resort: ArrivalsState, booking: Booking, day: number, tick: number): void {
  const standing = standingAt(resort, tick);
  const stages = resort.venues
    .filter((venue) => venue.stage === true && standing(venue.key))
    .toSorted(byEventRoom)
    .map((venue): EventSite => ({ kind: 'stage', venue: venue.key }));
  const held = day + 1;
  const slot = ceremonySlot(resort.events.programme, held, stages);
  if (!slot) return;
  resort.events.programme = withCeremony(resort.events.programme, {
    group: booking.id,
    day: held,
    ...slot,
  });
}

function brokenPromise(
  resort: ArrivalsState,
  requirement: Requirement,
  arrived: readonly number[],
  tick: number,
): void {
  const noun = requirementNoun(requirement);
  for (const person of arrived) {
    if (think(resort.thoughts, person, 'promised', noun, tick)) {
      tallyInto(resort.thoughtDay, 'promised', noun);
    }
  }
}

// Before the day's ordinary arrivals are sized, so a group costs walk-in guests rather than adding
// to them. Short of beds, the rest are turned away and the booking fails at the door.
export function admitBookedGroups(
  resort: ArrivalsState,
  day: number,
  open: boolean,
  admit: (arrived: readonly number[]) => void,
): void {
  const tick = day * TICKS_PER_DAY + CHECK_IN_TICK;
  const holds = open ? bedHoldsOf(resort, day) : [];
  for (const booking of arrivingOn(resort.bookings, day)) {
    const group = open
      ? checkInGroup(resort, booking, day, holds, admit)
      : { parties: [], turnedAway: booking.parties, arrived: [] };
    const turnedPeople = peopleExpected({ kind: booking.kind, parties: group.turnedAway });
    resort.today = countTurnedAway(resort.today, turnedPeople);
    const unmet = unmetOn(booking.requirements, resortFactsAt(resort, tick));
    for (const requirement of unmet) brokenPromise(resort, requirement, group.arrived, tick);
    const factor = 1 + booking.premium;
    const expected = group.arrived.reduce((sum, person) => {
      const home = resort.guests.home[person]!;
      return home < 0
        ? sum
        : sum + nightlyRate(resort, home) * factor * resort.guests.nights[person]!;
    }, 0);
    const arrival = { parties: group.parties, turnedAway: group.turnedAway, expected, unmet };
    resort.bookings = arrive(resort.bookings, booking.id, arrival, day).state;
    if (booking.kind === 'wedding' && group.parties.length > 0) {
      planCeremony(resort, booking, day, tick);
    }
  }
}

interface OfferingState {
  bookings: BookingsState;
  readonly season: ArrivalsState['season'];
  readonly prestige: Prestige;
  readonly ledger: Ledger;
  readonly beds: { readonly total: number };
}

// At the check-in: stale offers lapse, missed groups fail, and every few days a new offer comes.
export function offerTheDay(resort: OfferingState, day: number): readonly Settlement[] {
  const { state, settlements } = expire(resort.bookings, day);
  resort.bookings = state;
  if (!offerDue(state, day, resort.season)) return settlements;
  const random = offerRandom(day);
  const offer = drawOffer(random, {
    id: state.nextId,
    day,
    season: resort.season!,
    tier: resort.prestige.unlocked,
    beds: resort.beds.total,
    buildable: catalogueOffering(resort.prestige, resort.ledger.mode),
  });
  const nextOn = nextOfferAfter(random, day);
  resort.bookings = offer ? offered(state, offer, nextOn) : { ...state, nextOfferOn: nextOn };
  return settlements;
}

// The bonus is paid the moment the last booked party leaves, on the reviews the group left.
// A ceremony not yet held goes with its group; one running keeps the run's own copy.
export function bookedPartyLeft(
  resort: { bookings: BookingsState; ledger: Ledger; events: { programme: Programme } },
  party: number,
  stars: number | null,
  day: number,
): Settlement | null {
  if (!resort.bookings.partyOf.has(party)) return null;
  const { state, settlement } = left(resort.bookings, party, stars, day);
  resort.bookings = state;
  if (settlement) resort.events.programme = withoutCeremony(resort.events.programme, settlement.id);
  if (settlement && settlement.bonus > 0) {
    resort.ledger = record(resort.ledger, 'booking', settlement.bonus);
  }
  return settlement;
}
