import { MAX_ACCEPTED, type Offer, type OfferKind } from './offers';
import type { Requirement } from './requirements';

export interface Booking extends Offer {
  readonly state: 'booked' | 'staying';
  // Party indices still here; never reused, so they survive a load.
  readonly staying: readonly number[];
  readonly arrived: number;
  readonly stars: readonly number[];
  // Parties sent away at the door for want of beds: the operator then pays no bonus.
  readonly turnedAway: number;
  // What the group's nights should take at the premium, which the bonus is a share of.
  readonly expected: number;
  readonly unmet: readonly Requirement[];
  // The stage a wedding group's ceremony was held on, once it has been.
  readonly ceremonyAt?: string;
}

export type Outcome = 'bonus' | 'missed' | 'failed';

export interface Settlement {
  readonly id: number;
  readonly operator: string;
  readonly kind: OfferKind;
  readonly parties: number;
  readonly day: number;
  readonly nights: number;
  readonly premium: number;
  // What the group's nights took at the premium, and the share of it the bonus was worth.
  readonly takings: number;
  readonly bonusShare: number;
  readonly meanStars: number | null;
  readonly promisedStars: number;
  readonly bonus: number;
  readonly outcome: Outcome;
  readonly ceremonyAt?: string;
}

export interface DemandShift {
  readonly factor: number;
  // The first day it no longer holds.
  readonly until: number;
}

export interface BookingsState {
  readonly nextId: number;
  readonly nextOfferOn: number;
  readonly open: readonly Offer[];
  readonly accepted: readonly Booking[];
  // Newest first, kept like the reviews.
  readonly settled: readonly Settlement[];
  // Derived from the staying lists, so a load rebuilds it rather than saving it twice.
  readonly partyOf: ReadonlyMap<number, number>;
  readonly demand: DemandShift | null;
}

const SETTLED_KEPT = 12;

// Word of mouth: a group that left glowing brings friends for a week, one that did not keeps them away.
const WORD_OF_MOUTH = 0.1;
export const WORD_OF_MOUTH_DAYS = 7;

export function createBookings(): BookingsState {
  return {
    nextId: 1,
    nextOfferOn: 0,
    open: [],
    accepted: [],
    settled: [],
    partyOf: new Map(),
    demand: null,
  };
}

export const partyMapOf = (accepted: readonly Booking[]): ReadonlyMap<number, number> =>
  new Map(
    accepted.flatMap((booking) => booking.staying.map((party) => [party, booking.id] as const)),
  );

export const demandOn = (state: BookingsState, day: number): number =>
  state.demand && day < state.demand.until ? state.demand.factor : 1;

export const bookingOf = (state: BookingsState, party: number): Booking | null => {
  const id = state.partyOf.get(party);
  return id === undefined ? null : (state.accepted.find((booking) => booking.id === id) ?? null);
};

export const operatorOf = (state: BookingsState, party: number): string | null =>
  bookingOf(state, party)?.operator ?? null;

export const arrivingOn = (state: BookingsState, day: number): readonly Booking[] =>
  state.accepted.filter((booking) => booking.state === 'booked' && booking.arrivesOn === day);

export function offered(state: BookingsState, offer: Offer, nextOfferOn: number): BookingsState {
  return {
    ...state,
    nextId: Math.max(state.nextId, offer.id + 1),
    nextOfferOn,
    open: [...state.open, offer],
  };
}

export type OfferRefusal = 'gone' | 'full';

export function accept(
  state: BookingsState,
  id: number,
): { readonly state: BookingsState; readonly refusal: OfferRefusal | null } {
  const offer = state.open.find((each) => each.id === id);
  if (!offer) return { state, refusal: 'gone' };
  if (state.accepted.length >= MAX_ACCEPTED) return { state, refusal: 'full' };
  const booking: Booking = {
    ...offer,
    state: 'booked',
    staying: [],
    arrived: 0,
    stars: [],
    turnedAway: 0,
    expected: 0,
    unmet: [],
  };
  return {
    state: {
      ...state,
      open: state.open.filter((each) => each !== offer),
      accepted: [...state.accepted, booking],
    },
    refusal: null,
  };
}

export function decline(state: BookingsState, id: number): BookingsState {
  const open = state.open.filter((each) => each.id !== id);
  return open.length === state.open.length ? state : { ...state, open };
}

const shifted = (sign: 1 | -1, day: number): DemandShift => ({
  factor: 1 + sign * WORD_OF_MOUTH,
  until: day + WORD_OF_MOUTH_DAYS,
});

const meanOf = (stars: readonly number[]): number | null =>
  stars.length === 0 ? null : stars.reduce((sum, each) => sum + each, 0) / stars.length;

function settlementOf(booking: Booking, day: number): Settlement {
  const meanStars = meanOf(booking.stars);
  const failed = booking.turnedAway > 0 || booking.arrived === 0;
  const kept = !failed && meanStars !== null && meanStars >= booking.promisedStars;
  return {
    id: booking.id,
    operator: booking.operator,
    kind: booking.kind,
    parties: booking.arrived,
    day,
    nights: booking.nights,
    premium: booking.premium,
    takings: Math.round(booking.expected),
    bonusShare: booking.bonusShare,
    meanStars,
    promisedStars: booking.promisedStars,
    bonus: kept ? Math.round(booking.bonusShare * booking.expected) : 0,
    outcome: failed ? 'failed' : kept ? 'bonus' : 'missed',
    ...(booking.ceremonyAt === undefined ? {} : { ceremonyAt: booking.ceremonyAt }),
  };
}

// A failure at the door already cost its penalty there, so it is not charged twice.
function settled(state: BookingsState, booking: Booking, day: number): Settled {
  const settlement = settlementOf(booking, day);
  const accepted = state.accepted.filter((each) => each.id !== booking.id);
  const demand =
    settlement.outcome === 'failed'
      ? state.demand
      : shifted(settlement.outcome === 'bonus' ? 1 : -1, day);
  return {
    state: {
      ...state,
      accepted,
      settled: [settlement, ...state.settled].slice(0, SETTLED_KEPT),
      partyOf: partyMapOf(accepted),
      demand,
    },
    settlement,
  };
}

export interface Settled {
  readonly state: BookingsState;
  readonly settlement: Settlement | null;
}

// A group that never came, because the resort was shut or the season over, failed at the door.
export function expire(
  state: BookingsState,
  day: number,
): { readonly state: BookingsState; readonly settlements: readonly Settlement[] } {
  const open = state.open.filter((offer) => offer.expiresOn > day);
  let next: BookingsState = open.length === state.open.length ? state : { ...state, open };
  const settlements: Settlement[] = [];
  for (const booking of next.accepted) {
    if (booking.state !== 'booked' || booking.arrivesOn >= day) continue;
    const missed = settled(
      { ...next, demand: shifted(-1, day) },
      { ...booking, turnedAway: booking.parties },
      day,
    );
    next = missed.state;
    if (missed.settlement) settlements.push(missed.settlement);
  }
  return { state: next, settlements };
}

export interface Arrival {
  readonly parties: readonly number[];
  readonly turnedAway: number;
  readonly expected: number;
  readonly unmet: readonly Requirement[];
}

export function arrive(state: BookingsState, id: number, arrival: Arrival, day: number): Settled {
  const booking = state.accepted.find((each) => each.id === id);
  if (!booking || booking.state !== 'booked') return { state, settlement: null };
  const here: Booking = {
    ...booking,
    state: 'staying',
    staying: arrival.parties,
    arrived: arrival.parties.length,
    turnedAway: arrival.turnedAway,
    expected: arrival.expected,
    unmet: arrival.unmet,
  };
  const accepted = state.accepted.map((each) => (each === booking ? here : each));
  const failed = arrival.turnedAway > 0;
  const next: BookingsState = {
    ...state,
    accepted,
    partyOf: partyMapOf(accepted),
    demand: failed ? shifted(-1, day) : state.demand,
  };
  return here.staying.length === 0 ? settled(next, here, day) : { state: next, settlement: null };
}

export function heldCeremony(state: BookingsState, id: number, at: string): BookingsState {
  const booking = state.accepted.find((each) => each.id === id);
  if (!booking || booking.ceremonyAt !== undefined) return state;
  const accepted = state.accepted.map((each) =>
    each === booking ? { ...each, ceremonyAt: at } : each,
  );
  return { ...state, accepted };
}

// Stars null for a party that left without a review; it still leaves.
export function left(
  state: BookingsState,
  party: number,
  stars: number | null,
  day: number,
): Settled {
  const booking = bookingOf(state, party);
  if (!booking) return { state, settlement: null };
  const after: Booking = {
    ...booking,
    staying: booking.staying.filter((each) => each !== party),
    stars: stars === null ? booking.stars : [...booking.stars, stars],
  };
  if (after.staying.length === 0) return settled(state, after, day);
  const accepted = state.accepted.map((each) => (each === booking ? after : each));
  return { state: { ...state, accepted, partyOf: partyMapOf(accepted) }, settlement: null };
}

// Null while nobody is booked, so the night's bill runs as it always did.
export function premiumOf(
  state: BookingsState,
  partyOfPerson: Int32Array,
): ((person: number) => number) | null {
  if (state.partyOf.size === 0) return null;
  return (person) => 1 + (bookingOf(state, partyOfPerson[person]!)?.premium ?? 0);
}
