import { describe, expect, it } from 'vitest';
import { accept, arrive, createBookings, offered } from './bookings';
import { bookingsViewOf, deskOf, type OfferCard } from './bookingsView';
import type { Offer } from './offers';
import { offeringOf } from './requirements';

const offer = (id: number, arrivesOn: number): Offer => ({
  id,
  operator: 'Starfish Holidays',
  kind: 'family',
  parties: 3,
  arrivesOn,
  nights: 4,
  premium: 0.25,
  promisedStars: 4,
  bonusShare: 0.3,
  requirements: [
    { kind: 'need', value: 'fun' },
    { kind: 'stars', value: 4 },
  ],
  expiresOn: 6,
});

const facts = {
  ...offeringOf([{ role: 'activity', satisfies: [{ need: 'fun', amount: 1 }] }]),
  stars: 3.5,
};

const remedies = () => ['Play Area'];

describe('bookingsViewOf', () => {
  it('shows a ceremony to come under a group staying, and none under one still to arrive', () => {
    let state = offered(offered(createBookings(), offer(1, 4), 9), offer(2, 8), 9);
    state = accept(accept(state, 1).state, 2).state;
    state = arrive(state, 1, { parties: [3], turnedAway: 0, expected: 100, unmet: [] }, 4).state;
    const ceremony = { day: 5, start: 15 * 60, venue: 'Plaza Stage' };
    const view = bookingsViewOf(state, facts, 4, remedies, () => ceremony);
    expect(view.booked.map((row) => row.ceremony)).toEqual([ceremony, undefined]);
    expect(bookingsViewOf(state, facts, 4).booked.every((row) => !('ceremony' in row))).toBe(true);
  });

  it('ticks an offer against the resort right now', () => {
    const state = offered(createBookings(), offer(1, 9), 9);
    const [card] = bookingsViewOf(state, facts, 5).offers;
    expect(card!.checks.map((check) => check.met)).toEqual([true, false]);
    expect(card!.people).toBe(12);
  });

  it('lists the book soonest first, judging a group here as it arrived', () => {
    let state = offered(offered(createBookings(), offer(1, 12), 9), offer(2, 8), 9);
    state = accept(accept(state, 1).state, 2).state;
    const arrival = {
      parties: [5],
      turnedAway: 0,
      expected: 100,
      unmet: [{ kind: 'need' as const, value: 'fun' as const }],
    };
    state = arrive(state, 2, arrival, 8).state;
    const view = bookingsViewOf(state, facts, 8);
    expect(view.booked.map((row) => row.booking.id)).toEqual([2, 1]);
    expect(view.booked[0]!.checks.map((check) => check.met)).toEqual([false, true]);
    expect(view.booked[1]!.checks.map((check) => check.met)).toEqual([true, false]);
    expect(view.full).toBe(false);
    expect(view.demand).toBe(1);
  });

  it('names what to build only for a wish still open on a group yet to come', () => {
    const state = offered(createBookings(), offer(1, 9), 9);
    const [card] = bookingsViewOf(state, facts, 5, remedies).offers;
    expect(card!.checks.map((check) => check.builds)).toEqual([[], ['Play Area']]);
  });
});

describe('deskOf', () => {
  const card = (id: number): OfferCard => ({ offer: offer(id, 9), people: 12, checks: [] });

  it('keeps a voucher answered today in its place, stamped', () => {
    const desk = deskOf(
      [card(1), card(3)],
      [
        { card: card(2), answer: 'confirmed', day: 5 },
        { card: card(4), answer: 'declined', day: 5 },
      ],
      5,
    );
    expect(desk.map((each) => [each.card.offer.id, each.answer])).toEqual([
      [1, null],
      [2, 'confirmed'],
      [3, null],
      [4, 'declined'],
    ]);
  });

  it('clears the stamped vouchers when the day turns', () => {
    const desk = deskOf([card(1)], [{ card: card(2), answer: 'confirmed', day: 4 }], 5);
    expect(desk.map((each) => each.card.offer.id)).toEqual([1]);
  });

  it('shows an offer still open unstamped, whatever was answered for it', () => {
    const desk = deskOf([card(1)], [{ card: card(1), answer: 'confirmed', day: 5 }], 5);
    expect(desk).toEqual([{ card: card(1), answer: null }]);
  });
});
