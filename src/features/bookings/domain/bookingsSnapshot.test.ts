import { describe, expect, it } from 'vitest';
import { accept, arrive, createBookings, offered } from './bookings';
import { bookingsSnapshotSchema, restoreBookings, snapshotBookings } from './bookingsSnapshot';
import type { Offer } from './offers';

const offer = (id: number): Offer => ({
  id,
  operator: 'Blue Lagoon Travel',
  kind: 'wedding',
  parties: 3,
  arrivesOn: 10,
  nights: 2,
  premium: 0.4,
  promisedStars: 4,
  bonusShare: 0.6,
  requirements: [
    { kind: 'flag', value: 'stage' },
    { kind: 'stars', value: 4 },
  ],
  expiresOn: 7,
});

function busy() {
  const twoOffers = offered(offered(createBookings(), offer(1), 9), offer(2), 9);
  const booked = accept(twoOffers, 1).state;
  const arrival = { parties: [12, 15], turnedAway: 0, expected: 900, unmet: [] };
  return arrive(booked, 1, arrival, 10).state;
}

describe('bookings snapshot', () => {
  it('round-trips through the schema, rebuilding who came with whom', () => {
    const state = busy();
    const parsed = bookingsSnapshotSchema.parse(
      JSON.parse(JSON.stringify(snapshotBookings(state))),
    );
    const restored = restoreBookings(parsed);
    expect(restored).toEqual(state);
    expect(restored.partyOf.get(15)).toBe(1);
  });

  it('refuses an offer of a kind nobody books', () => {
    const snapshot = snapshotBookings(busy());
    const odd = { ...snapshot, open: [{ ...snapshot.open[0]!, kind: 'circus' }] };
    expect(bookingsSnapshotSchema.safeParse(odd).success).toBe(false);
  });
});
