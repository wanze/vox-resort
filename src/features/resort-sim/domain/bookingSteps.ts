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
  drawOffer,
  nextOfferAfter,
  offerDue,
  partyKindsOf,
  peopleExpected,
} from '../../bookings/domain/offers';
import {
  offeringOf,
  requirementNoun,
  unmetOn,
  type Offering,
  type ResortFacts,
} from '../../bookings/domain/requirements';
import { familyOf, OBJECT_TYPES, venueOf } from '../../catalog/domain/objectTypes';
import { priceOf } from '../../catalog/domain/prices';
import { isUnlocked } from '../../catalog/domain/unlocks';
import type { PartyKind, PartyMix } from '../../guests/domain/parties';
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

const NO_ONE: PartyMix = { family: 0, couple: 0, friends: 0, solo: 0 };
const onlyOf = (kind: PartyKind): PartyMix => ({ ...NO_ONE, [kind]: 1 });

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

// Only what a guest could walk into this morning: a site still building or out of reach is not there.
export function resortFactsAt(resort: StandingState, tick: number): ResortFacts {
  const standing = (key: string) =>
    !resort.unreachable.has(key) && (resort.constructing.get(key) ?? -1) <= tick;
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

// One party a call, as a one-kind mix: runCheckIn's draw order is untouched, only its stream is
// the group's own.
function checkInGroup(
  resort: ArrivalsState,
  booking: Booking,
  day: number,
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
  for (const kind of partyKindsOf(booking)) {
    const people = runCheckIn({
      guests,
      needs: resort.needs,
      happiness: resort.happiness,
      rating: resort.rating,
      day,
      random,
      room: 1,
      expectationOf: (home) => expectationFor(booking.promisedStars, paidShareFor(resort, home)),
      mix: onlyOf(kind),
      lastNight,
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

// Before the day's ordinary arrivals are sized, so a group costs walk-in guests rather than adding
// to them. Short of beds, the rest are turned away and the booking fails at the door.
export function admitBookedGroups(
  resort: ArrivalsState,
  day: number,
  open: boolean,
  admit: (arrived: readonly number[]) => void,
): void {
  const tick = day * TICKS_PER_DAY + CHECK_IN_TICK;
  for (const booking of arrivingOn(resort.bookings, day)) {
    const group = open
      ? checkInGroup(resort, booking, day, admit)
      : { parties: [], turnedAway: booking.parties, arrived: [] };
    const turnedPeople = peopleExpected({ kind: booking.kind, parties: group.turnedAway });
    resort.today = countTurnedAway(resort.today, turnedPeople);
    const unmet = unmetOn(booking.requirements, resortFactsAt(resort, tick));
    for (const requirement of unmet) {
      const noun = requirementNoun(requirement);
      for (const person of group.arrived) {
        if (think(resort.thoughts, person, 'promised', noun, tick)) {
          tallyInto(resort.thoughtDay, 'promised', noun);
        }
      }
    }
    const factor = 1 + booking.premium;
    const expected = group.arrived.reduce((sum, person) => {
      const home = resort.guests.home[person]!;
      return home < 0
        ? sum
        : sum + nightlyRate(resort, home) * factor * resort.guests.nights[person]!;
    }, 0);
    const arrival = { parties: group.parties, turnedAway: group.turnedAway, expected, unmet };
    resort.bookings = arrive(resort.bookings, booking.id, arrival, day).state;
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
export function bookedPartyLeft(
  resort: { bookings: BookingsState; ledger: Ledger },
  party: number,
  stars: number | null,
  day: number,
): Settlement | null {
  if (!resort.bookings.partyOf.has(party)) return null;
  const { state, settlement } = left(resort.bookings, party, stars, day);
  resort.bookings = state;
  if (settlement && settlement.bonus > 0) {
    resort.ledger = record(resort.ledger, 'booking', settlement.bonus);
  }
  return settlement;
}
