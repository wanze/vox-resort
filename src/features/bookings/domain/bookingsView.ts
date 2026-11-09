import { MAX_ACCEPTED, peopleExpected, type Offer } from './offers';
import { demandOn, type Booking, type BookingsState, type Settlement } from './bookings';
import { isMet, type Requirement, type ResortFacts } from './requirements';

export interface RequirementCheck {
  readonly requirement: Requirement;
  readonly met: boolean;
  // What could be built to meet it; empty once met, or when it is too late to help.
  readonly builds: readonly string[];
}

export type Remedies = (requirement: Requirement) => readonly string[];

const NO_REMEDIES: Remedies = () => [];

export interface OfferCard {
  readonly offer: Offer;
  readonly people: number;
  readonly checks: readonly RequirementCheck[];
}

// A wedding group's ceremony still to come; `start` is a minute of the day.
export interface CeremonyWhen {
  readonly day: number;
  readonly start: number;
  readonly venue: string;
}

export interface BookedRow {
  readonly booking: Booking;
  readonly checks: readonly RequirementCheck[];
  readonly ceremony?: CeremonyWhen;
}

export type CeremonyOf = (booking: number) => CeremonyWhen | null;

const NO_CEREMONIES: CeremonyOf = () => null;

export interface BookingsView {
  readonly day: number;
  readonly offers: readonly OfferCard[];
  readonly booked: readonly BookedRow[];
  readonly settled: readonly Settlement[];
  // No room in the book for another acceptance.
  readonly full: boolean;
  readonly demand: number;
}

function checksOf(
  requirements: readonly Requirement[],
  met: (requirement: Requirement) => boolean,
  remedies: Remedies,
): readonly RequirementCheck[] {
  return requirements.map((requirement) => {
    const done = met(requirement);
    return { requirement, met: done, builds: done ? [] : remedies(requirement) };
  });
}

// By value: a load hands back copies of what was the same object.
const sameRequirement = (a: Requirement, b: Requirement): boolean =>
  a.kind === b.kind && a.value === b.value;

function bookedRowOf(
  booking: Booking,
  now: (requirement: Requirement) => boolean,
  ceremonyOf: CeremonyOf,
  remedies: Remedies,
): BookedRow {
  if (booking.state !== 'staying') {
    return { booking, checks: checksOf(booking.requirements, now, remedies) };
  }
  const arrived = (requirement: Requirement) =>
    !booking.unmet.some((each) => sameRequirement(each, requirement));
  const checks = checksOf(booking.requirements, arrived, NO_REMEDIES);
  const ceremony = ceremonyOf(booking.id);
  return ceremony === null ? { booking, checks } : { booking, checks, ceremony };
}

// Ticked against the resort right now; a group already here is judged as it was on arrival,
// and is past helping with a build.
export function bookingsViewOf(
  state: BookingsState,
  facts: ResortFacts,
  day: number,
  remedies: Remedies = NO_REMEDIES,
  ceremonyOf: CeremonyOf = NO_CEREMONIES,
): BookingsView {
  const now = (requirement: Requirement) => isMet(requirement, facts);
  return {
    day,
    offers: state.open.map((offer) => ({
      offer,
      people: peopleExpected(offer),
      checks: checksOf(offer.requirements, now, remedies),
    })),
    booked: state.accepted
      .toSorted((a, b) => a.arrivesOn - b.arrivesOn)
      .map((booking) => bookedRowOf(booking, now, ceremonyOf, remedies)),
    settled: state.settled,
    full: state.accepted.length >= MAX_ACCEPTED,
    demand: demandOn(state, day),
  };
}

export type Answer = 'confirmed' | 'declined';

export interface AnsweredCard {
  readonly card: OfferCard;
  readonly answer: Answer;
  readonly day: number;
}

export interface DeskCard {
  readonly card: OfferCard;
  readonly answer: Answer | null;
}

// An answered voucher stays on the desk where it lay, stamped, until the day turns.
export function deskOf(
  offers: readonly OfferCard[],
  answered: readonly AnsweredCard[],
  day: number,
): readonly DeskCard[] {
  const open = new Set(offers.map((card) => card.offer.id));
  const stamped = answered
    .filter((each) => each.day === day && !open.has(each.card.offer.id))
    .map(({ card, answer }) => ({ card, answer }));
  return [...offers.map((card) => ({ card, answer: null })), ...stamped].toSorted(
    (a, b) => a.card.offer.id - b.card.offer.id,
  );
}
