import { MAX_ACCEPTED, peopleExpected, type Offer } from './offers';
import { demandOn, type Booking, type BookingsState, type Settlement } from './bookings';
import { isMet, type Requirement, type ResortFacts } from './requirements';

export interface RequirementCheck {
  readonly requirement: Requirement;
  readonly met: boolean;
}

export interface OfferCard {
  readonly offer: Offer;
  readonly people: number;
  readonly checks: readonly RequirementCheck[];
}

export interface BookedRow {
  readonly booking: Booking;
  readonly checks: readonly RequirementCheck[];
}

export interface BookingsView {
  readonly day: number;
  readonly offers: readonly OfferCard[];
  readonly booked: readonly BookedRow[];
  readonly settled: readonly Settlement[];
  // No room in the book for another acceptance.
  readonly full: boolean;
  readonly demand: number;
}

const checksOf = (
  requirements: readonly Requirement[],
  met: (requirement: Requirement) => boolean,
): readonly RequirementCheck[] =>
  requirements.map((requirement) => ({ requirement, met: met(requirement) }));

// By value: a load hands back copies of what was the same object.
const sameRequirement = (a: Requirement, b: Requirement): boolean =>
  a.kind === b.kind && a.value === b.value;

// Ticked against the resort right now; a group already here is judged as it was on arrival.
export function bookingsViewOf(
  state: BookingsState,
  facts: ResortFacts,
  day: number,
): BookingsView {
  const now = (requirement: Requirement) => isMet(requirement, facts);
  return {
    day,
    offers: state.open.map((offer) => ({
      offer,
      people: peopleExpected(offer),
      checks: checksOf(offer.requirements, now),
    })),
    booked: state.accepted
      .toSorted((a, b) => a.arrivesOn - b.arrivesOn)
      .map((booking) => ({
        booking,
        checks: checksOf(
          booking.requirements,
          booking.state === 'staying'
            ? (requirement) => !booking.unmet.some((each) => sameRequirement(each, requirement))
            : now,
        ),
      })),
    settled: state.settled,
    full: state.accepted.length >= MAX_ACCEPTED,
    demand: demandOn(state, day),
  };
}
