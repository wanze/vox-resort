import { describe, expect, it } from 'vitest';
import {
  bedCount,
  checkInParty,
  checkOutParty,
  createGuests,
  freeBodiesOf,
  fullNameOf,
  homeOf,
  homelessCount,
  partyOf,
  presentCount,
  rehome,
  STAY_NIGHTS,
  type FreeBodies,
  type GuestOptions,
  type Guests,
} from './guests';
import { NO_HOME, type Home } from './homes';
import { createRandom } from '../../layout/domain/random';

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

const drawOf = (seed: number) => createRandom(seed);

const biggestParty = (guests: Guests): number => {
  let best = 0;
  for (let party = 1; party < guests.parties.length; party++) {
    const bigger = guests.parties[party]!.members.length > guests.parties[best]!.members.length;
    if (bigger) best = party;
  }
  return best;
};

describe('checking out and checking in', () => {
  it('frees the beds and the bodies of a party that leaves', () => {
    const guests = guestsWith();
    const party = biggestParty(guests);
    const members = guests.parties[party]!.members;
    const lodging = guests.home[members[0]!]!;
    const freeBefore = guests.freeBeds[lodging]!;
    const before = bedCount(guests).taken;

    const left = checkOutParty(guests, party);

    expect(left).toEqual([...members]);
    expect(guests.freeBeds[lodging]).toBe(freeBefore + members.length);
    expect(bedCount(guests).taken).toBe(before - members.length);
    for (const person of members) {
      expect(guests.present[person]).toBe(0);
      expect(homeOf(guests, person)).toBeNull();
    }
    expect(freeBodiesOf(guests).adults.length + freeBodiesOf(guests).children.length).toBe(
      members.length,
    );
    expect(checkOutParty(guests, party)).toEqual([]);
    expect(guests.freeBeds[lodging]).toBe(freeBefore + members.length);
  });

  it('fills free bodies and never rewrites what a body is drawn as', () => {
    const guests = guestsWith();
    const child = Array.from(guests.child);
    const variant = Array.from(guests.variant);
    checkOutParty(guests, biggestParty(guests));

    const free = freeBodiesOf(guests);
    const party = checkInParty(guests, { random: drawOf(1), day: 6, free });

    expect(party).not.toBeNull();
    for (const person of party!.members) {
      expect(guests.present[person]).toBe(1);
      expect(guests.child[person], 'a body may never be redrawn').toBe(child[person]);
      expect(guests.variant[person]).toBe(variant[person]);
      expect(fullNameOf(guests, person).endsWith(party!.family)).toBe(true);
    }
    expect(Array.from(guests.child)).toEqual(child);
    expect(Array.from(guests.variant)).toEqual(variant);
  });

  it('cuts a party down to the bodies it can actually be given', () => {
    const guests = guestsWith();
    for (let party = 0; party < guests.parties.length; party++) checkOutParty(guests, party);
    const free = freeBodiesOf(guests);
    const one: FreeBodies = { adults: [free.adults[0]!], children: [free.children[0]!] };

    const party = checkInParty(guests, { random: drawOf(2), day: 3, free: one });

    expect(party!.members.length).toBeLessThanOrEqual(2);
    expect(guests.child[party!.members[0]!], 'adults come first').toBe(0);
    expect(one.adults).toEqual([]);
  });

  it('creates no party at all when no adult body is free', () => {
    const guests = guestsWith();
    for (let party = 0; party < guests.parties.length; party++) checkOutParty(guests, party);
    const free = freeBodiesOf(guests);
    const childrenOnly: FreeBodies = { adults: [], children: [...free.children] };
    const before = guests.parties.length;

    expect(checkInParty(guests, { random: drawOf(3), day: 1, free: childrenOnly })).toBeNull();
    expect(guests.parties.length, 'no party is pushed either').toBe(before);
    expect(childrenOnly.children.length, 'the child bodies go back').toBe(free.children.length);
  });

  it('keeps the present count and the beds taken agreeing over a round trip', () => {
    const guests = guestsWith();
    const before = { present: presentCount(guests), beds: bedCount(guests) };
    const party = biggestParty(guests);
    const size = guests.parties[party]!.members.length;

    checkOutParty(guests, party);
    expect(presentCount(guests)).toBe(before.present - size);
    expect(bedCount(guests).taken).toBe(before.beds.taken - size);

    const free = freeBodiesOf(guests);
    const arrived = checkInParty(guests, { random: drawOf(4), day: 9, free })!;
    expect(presentCount(guests)).toBe(before.present - size + arrived.members.length);
    expect(bedCount(guests)).toEqual({
      beds: before.beds.beds,
      taken: before.beds.taken - size + arrived.members.length,
    });
  });

  it('stamps an arriving party with the day it checked in and a stay of its own', () => {
    const guests = guestsWith();
    checkOutParty(guests, biggestParty(guests));
    const free = freeBodiesOf(guests);
    const party = checkInParty(guests, { random: drawOf(5), day: 12, free })!;

    const nights = guests.nights[party.members[0]!]!;
    expect(nights).toBeGreaterThanOrEqual(STAY_NIGHTS.min);
    expect(nights).toBeLessThanOrEqual(STAY_NIGHTS.max);
    for (const person of party.members) {
      expect(guests.arrivedOn[person]).toBe(12);
      expect(guests.nights[person], 'one stay per party').toBe(nights);
    }
  });
});

describe('a resort that opens empty', () => {
  it('has nobody present and every bed free', () => {
    const guests = guestsWith({ away: true });
    expect(presentCount(guests)).toBe(0);
    expect(Array.from(guests.home).every((lodging) => lodging === NO_HOME)).toBe(true);
    expect(Array.from(guests.freeBeds)).toEqual(HOMES.map((lodging) => lodging.beds));
    expect(bedCount(guests)).toEqual({ beds: 62, taken: 0 });
  });

  it('draws the same parties, names and bodies as a resort that opens full', () => {
    const away = guestsWith({ away: true });
    const full = guestsWith();
    expect(Array.from(away.party)).toEqual(Array.from(full.party));
    expect(Array.from(away.variant)).toEqual(Array.from(full.variant));
    expect(Array.from(away.child)).toEqual(Array.from(full.child));
    expect(away.people).toEqual(full.people);
  });

  it('checks a party into the empty registry', () => {
    const guests = guestsWith({ away: true });
    const party = checkInParty(guests, { random: drawOf(6), day: 0, free: freeBodiesOf(guests) })!;
    expect(party).not.toBeNull();
    expect(presentCount(guests)).toBe(party.members.length);
    expect(bedCount(guests).taken).toBe(party.members.length);
  });
});

describe('rehome', () => {
  const homeKeys = (guests: Guests): (string | null)[] =>
    everybody(guests).map((person) => homeOf(guests, person)?.key ?? null);

  it('adds the beds of a new lodging', () => {
    const guests = guestsWith();
    const before = Array.from(guests.freeBeds);
    const homeless = everybody(guests).filter((person) => guests.home[person] === NO_HOME).length;
    expect(rehome(guests, [...HOMES, home('villa#1', 8)])).toBe(homeless);
    expect(Array.from(guests.freeBeds)).toEqual([...before, 8]);
  });

  it('leaves the guests of a lodging that still stands in their beds', () => {
    const guests = guestsWith();
    const keys = homeKeys(guests);
    const free = Array.from(guests.freeBeds);
    rehome(guests, [home('bungalow#9', 4), ...HOMES]);
    expect(homeKeys(guests)).toEqual(keys);
    expect(Array.from(guests.freeBeds)).toEqual([4, ...free]);
  });

  it('moves a party out of a demolished lodging into a free one that fits', () => {
    const guests = guestsWith({ count: 20 });
    const moved = everybody(guests).filter((person) => homeOf(guests, person)?.key === 'hotel#0');
    expect(moved.length).toBeGreaterThan(0);
    const spare = home('hotel#1', 40);
    expect(rehome(guests, [spare, ...HOMES.slice(1)])).toBe(0);
    for (const person of moved) expect(homeOf(guests, person)?.key).toBe('hotel#1');
  });

  it('leaves a party with nowhere to go without a home, and counts it', () => {
    const guests = guestsWith({ count: 20 });
    expect(everybody(guests).every((person) => homeOf(guests, person)?.key === 'hotel#0')).toBe(
      true,
    );
    const homeless = rehome(guests, [home('bungalow#0', 4)]);
    const housed = everybody(guests).filter((person) => guests.home[person] !== NO_HOME);
    expect(homeless).toBe(20 - housed.length);
    expect(housed.length).toBeGreaterThan(0);
    expect(housed.length).toBeLessThanOrEqual(4);
    expect(new Set(housed.map((person) => guests.party[person])).size).toBe(1);
  });

  it('counts only guests who are here and have no bed', () => {
    const guests = guestsWith({ count: 20 });
    expect(homelessCount(guests)).toBe(0);
    rehome(guests, []);
    expect(homelessCount(guests)).toBe(20);
    for (let party = 0; party < guests.parties.length; party++) checkOutParty(guests, party);
    expect(homelessCount(guests)).toBe(0);
  });

  it('houses everybody the same way on two runs', () => {
    const run = (): (string | null)[] => {
      const guests = guestsWith();
      rehome(guests, [home('villa#7', 8), ...HOMES.slice(1)]);
      return homeKeys(guests);
    };
    expect(run()).toEqual(run());
  });
});
