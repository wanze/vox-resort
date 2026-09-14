import { describe, expect, it } from 'vitest';
import {
  bedCount,
  createGuests,
  fullNameOf,
  homeOf,
  partyOf,
  STAY_NIGHTS,
  type GuestOptions,
  type Guests,
} from './guests';
import { NO_HOME, type Home } from './homes';

const home = (key: string, beds: number): Home => ({ key, id: key, label: key, beds });

const HOMES: readonly Home[] = [
  home('hotel#0', 40),
  home('villa#0', 8),
  home('house#0', 6),
  home('bungalow#0', 4),
  home('bungalow#1', 4),
];

const OPTIONS: GuestOptions = { count: 120, homes: HOMES, variants: 4, childVariant: 3, seed: 5 };

const guestsWith = (overrides: Partial<GuestOptions> = {}): Guests =>
  createGuests({ ...OPTIONS, ...overrides });

const everybody = (guests: Guests): number[] => Array.from({ length: guests.count }, (_, i) => i);

describe('createGuests', () => {
  it('sizes every column to the count', () => {
    const guests = guestsWith();
    expect(guests.count).toBe(120);
    for (const column of [
      guests.party,
      guests.home,
      guests.arrivedOn,
      guests.nights,
      guests.child,
      guests.variant,
    ]) {
      expect(column.length).toBe(120);
    }
    expect(guests.people).toHaveLength(120);
  });

  it('draws every child with the child model and no adult with it', () => {
    // A child variant that is not the last, so the shift past it is exercised.
    for (const childVariant of [3, 1, 0]) {
      const guests = guestsWith({ childVariant, count: 400 });
      for (const i of everybody(guests)) {
        expect(guests.variant[i] === childVariant).toBe(guests.child[i] === 1);
        expect(guests.variant[i]).toBeGreaterThanOrEqual(0);
        expect(guests.variant[i]).toBeLessThan(4);
      }
      const adults = new Set(
        everybody(guests)
          .filter((i) => guests.child[i] === 0)
          .map((i) => guests.variant[i]),
      );
      expect(adults.size).toBe(3);
    }
  });

  it('draws everybody as the one model when there is only one', () => {
    const guests = guestsWith({ variants: 1, childVariant: 0 });
    expect(Array.from(guests.variant).every((variant) => variant === 0)).toBe(true);
  });

  it('gives a party one arrival and one stay', () => {
    const guests = guestsWith();
    for (const party of guests.parties) {
      const [first, ...rest] = party.members;
      for (const member of rest) {
        expect(guests.arrivedOn[member]).toBe(guests.arrivedOn[first!]);
        expect(guests.nights[member]).toBe(guests.nights[first!]);
      }
    }
  });

  it('keeps every stay in range, and everybody somewhere in the middle of theirs', () => {
    const guests = guestsWith({ count: 600 });
    for (const i of everybody(guests)) {
      const nights = guests.nights[i]!;
      expect(nights).toBeGreaterThanOrEqual(STAY_NIGHTS.min);
      expect(nights).toBeLessThanOrEqual(STAY_NIGHTS.max);
      expect(guests.arrivedOn[i]).toBeLessThanOrEqual(0);
      expect(guests.arrivedOn[i]).toBeGreaterThanOrEqual(-(nights - 1));
    }
  });

  it('replays the same registry for the same seed', () => {
    const a = guestsWith();
    const b = guestsWith();
    expect(Array.from(a.party)).toEqual(Array.from(b.party));
    expect(Array.from(a.home)).toEqual(Array.from(b.home));
    expect(Array.from(a.arrivedOn)).toEqual(Array.from(b.arrivedOn));
    expect(Array.from(a.nights)).toEqual(Array.from(b.nights));
    expect(Array.from(a.child)).toEqual(Array.from(b.child));
    expect(Array.from(a.variant)).toEqual(Array.from(b.variant));
    expect(a.people).toEqual(b.people);
    expect(a.parties).toEqual(b.parties);
  });
});

describe('fullNameOf', () => {
  it('is a given name and a family name', () => {
    const guests = guestsWith();
    for (const i of everybody(guests)) {
      expect(fullNameOf(guests, i)).toBe(`${guests.people[i]!.given} ${guests.people[i]!.family}`);
    }
    expect(fullNameOf(guests, 0).split(' ')[0]).toBe(guests.people[0]!.given);
  });

  it('shares a family name across a party', () => {
    const guests = guestsWith();
    for (const party of guests.parties) {
      for (const member of party.members) expect(guests.people[member]!.family).toBe(party.family);
    }
  });
});

describe('partyOf', () => {
  it('includes the person asked about', () => {
    const guests = guestsWith();
    for (const i of everybody(guests)) expect(partyOf(guests, i)).toContain(i);
  });
});

describe('homeOf', () => {
  it('is null exactly for the people with nowhere to sleep', () => {
    // Fewer beds than people, so both cases occur.
    const guests = guestsWith({ count: 200 });
    const homeless = everybody(guests).filter((i) => guests.home[i] === NO_HOME);
    expect(homeless.length).toBeGreaterThan(0);
    for (const i of everybody(guests)) {
      const found = homeOf(guests, i);
      expect(found === null).toBe(guests.home[i] === NO_HOME);
      if (found) expect(found).toBe(HOMES[guests.home[i]!]);
    }
  });
});

describe('bedCount', () => {
  it('never has more beds taken than there are', () => {
    for (const count of [0, 10, 62, 200]) {
      const { beds, taken } = bedCount(guestsWith({ count }));
      expect(beds).toBe(62);
      expect(taken).toBeLessThanOrEqual(beds);
    }
    expect(bedCount(guestsWith({ homes: [] }))).toEqual({ beds: 0, taken: 0 });
  });
});
