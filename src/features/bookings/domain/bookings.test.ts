import { describe, expect, it } from 'vitest';
import {
  accept,
  arrive,
  arrivingOn,
  bookingOf,
  createBookings,
  decline,
  demandOn,
  expire,
  left,
  offered,
  WORD_OF_MOUTH_DAYS,
  type BookingsState,
} from './bookings';
import { MAX_ACCEPTED, type Offer } from './offers';

const offer = (id: number, over: Partial<Offer> = {}): Offer => ({
  id,
  operator: 'Sunshine Tours',
  kind: 'family',
  parties: 2,
  arrivesOn: 10,
  nights: 4,
  premium: 0.3,
  promisedStars: 4,
  bonusShare: 0.3,
  requirements: [{ kind: 'need', value: 'fun' }],
  expiresOn: 7,
  ...over,
});

const withOffers = (...offers: Offer[]): BookingsState =>
  offers.reduce((state, each) => offered(state, each, 9), createBookings());

const accepted = (state: BookingsState, id: number): BookingsState => {
  const result = accept(state, id);
  expect(result.refusal).toBeNull();
  return result.state;
};

const staying = (parties: readonly number[] = [40, 41]) =>
  arrive(
    accepted(withOffers(offer(1)), 1),
    1,
    { parties, turnedAway: 0, expected: 1_000, unmet: [] },
    10,
  ).state;

describe('offers', () => {
  it('takes an offer, moving the next id past it', () => {
    const state = withOffers(offer(4));
    expect(state.open).toHaveLength(1);
    expect(state.nextId).toBe(5);
    expect(state.nextOfferOn).toBe(9);
  });

  it('accepts an open offer into the book', () => {
    const state = accepted(withOffers(offer(1), offer(2)), 1);
    expect(state.open.map((each) => each.id)).toEqual([2]);
    expect(state.accepted.map((each) => [each.id, each.state])).toEqual([[1, 'booked']]);
  });

  it('refuses a gone offer and a full book', () => {
    expect(accept(createBookings(), 1).refusal).toBe('gone');
    const ids = Array.from({ length: MAX_ACCEPTED + 1 }, (_, at) => at + 1);
    let state = withOffers(...ids.map((id) => offer(id)));
    for (const id of ids.slice(0, MAX_ACCEPTED)) state = accepted(state, id);
    expect(accept(state, ids.at(-1)!).refusal).toBe('full');
  });

  it('declines an offer', () => {
    expect(decline(withOffers(offer(1)), 1).open).toEqual([]);
  });

  it('lets an unanswered offer lapse after its day', () => {
    const state = withOffers(offer(1, { expiresOn: 7 }));
    expect(expire(state, 6).state.open).toHaveLength(1);
    expect(expire(state, 7).state.open).toHaveLength(0);
  });

  it('fails a booking whose arrival day passed without it, and dents the demand', () => {
    const state = accepted(withOffers(offer(1, { arrivesOn: 5 })), 1);
    const { state: after, settlements } = expire(state, 6);
    expect(after.accepted).toEqual([]);
    expect(settlements.map((each) => each.outcome)).toEqual(['failed']);
    expect(demandOn(after, 6)).toBeCloseTo(0.9);
  });
});

describe('arrive and leave', () => {
  it('lists the groups arriving today', () => {
    const state = accepted(withOffers(offer(1)), 1);
    expect(arrivingOn(state, 9)).toEqual([]);
    expect(arrivingOn(state, 10).map((each) => each.id)).toEqual([1]);
  });

  it('knows which booking a party came with', () => {
    const state = staying();
    expect(bookingOf(state, 40)?.operator).toBe('Sunshine Tours');
    expect(bookingOf(state, 39)).toBeNull();
    expect(arrivingOn(state, 10)).toEqual([]);
  });

  it('pays the bonus when the reviews keep the promise, and word gets round', () => {
    const one = left(staying(), 40, 5, 14);
    expect(one.settlement).toBeNull();
    const both = left(one.state, 41, 4, 14);
    expect(both.settlement).toMatchObject({ outcome: 'bonus', bonus: 300, meanStars: 4.5 });
    expect(both.state.accepted).toEqual([]);
    expect(both.state.partyOf.size).toBe(0);
    expect(demandOn(both.state, 14)).toBeCloseTo(1.1);
  });

  it('pays nothing when the reviews fall short, and word gets round too', () => {
    const one = left(staying(), 40, 4, 14);
    const both = left(one.state, 41, 3, 14);
    expect(both.settlement).toMatchObject({ outcome: 'missed', bonus: 0 });
    expect(demandOn(both.state, 14)).toBeCloseTo(0.9);
  });

  it('counts a party leaving without a review as gone', () => {
    const one = left(staying([40]), 40, null, 14);
    expect(one.settlement).toMatchObject({ outcome: 'missed', meanStars: null });
  });

  it('fails a booking short of beds at the door, and takes the penalty at once', () => {
    const state = accepted(withOffers(offer(1)), 1);
    const arrival = { parties: [40], turnedAway: 1, expected: 500, unmet: [] };
    const { state: after } = arrive(state, 1, arrival, 10);
    expect(demandOn(after, 10)).toBeCloseTo(0.9);
    const gone = left(after, 40, 5, 13);
    expect(gone.settlement).toMatchObject({ outcome: 'failed', bonus: 0 });
    expect(demandOn(gone.state, 13)).toBeCloseTo(0.9);
  });

  it('settles at once a group nobody could take in', () => {
    const state = accepted(withOffers(offer(1)), 1);
    const arrival = { parties: [], turnedAway: 2, expected: 0, unmet: [] };
    const result = arrive(state, 1, arrival, 10);
    expect(result.settlement?.outcome).toBe('failed');
    expect(result.state.accepted).toEqual([]);
  });
});

describe('demandOn', () => {
  it('lasts a week of word of mouth, then wears off', () => {
    const { state } = left(staying([40]), 40, 5, 14);
    expect(demandOn(state, 14 + WORD_OF_MOUTH_DAYS - 1)).toBeCloseTo(1.1);
    expect(demandOn(state, 14 + WORD_OF_MOUTH_DAYS)).toBe(1);
    expect(demandOn(createBookings(), 0)).toBe(1);
  });
});
