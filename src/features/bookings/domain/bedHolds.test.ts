import { describe, expect, it } from 'vitest';
import type { Home } from '../../guests/domain/homes';
import {
  bedsOfHolds,
  groupLeavesOn,
  groupShapesOf,
  planHolds,
  spareUntil,
  type HoldingGuests,
  type HoldOptions,
} from './bedHolds';
import type { Booking } from './bookings';

const HOMES: readonly Home[] = [
  { key: 'cottage#1', id: 'cottage', label: 'Cottage', beds: 4 },
  { key: 'bungalow#2', id: 'bungalow', label: 'Bungalow', beds: 4 },
];

interface Stay {
  readonly home: number;
  readonly arrivedOn: number;
  readonly nights: number;
}

function guestsWith(stays: readonly Stay[], freeBeds?: readonly number[]): HoldingGuests {
  const taken = HOMES.map((_, index) => stays.filter((stay) => stay.home === index).length);
  return {
    count: stays.length,
    present: Uint8Array.from(stays, () => 1),
    home: Int32Array.from(stays, (stay) => stay.home),
    arrivedOn: Int32Array.from(stays, (stay) => stay.arrivedOn),
    nights: Int32Array.from(stays, (stay) => stay.nights),
    homes: HOMES,
    freeBeds: Int32Array.from(freeBeds ?? HOMES.map((home, index) => home.beds - taken[index]!)),
  };
}

const stays = (count: number, stay: Stay): Stay[] => Array.from({ length: count }, () => stay);

const couple = (over: Partial<Booking> = {}): Booking => ({
  id: 1,
  operator: 'Seagull Getaways',
  kind: 'couple',
  parties: 1,
  arrivesOn: 5,
  nights: 3,
  premium: 0.3,
  promisedStars: 3,
  bonusShare: 0.3,
  requirements: [],
  expiresOn: 2,
  state: 'booked',
  staying: [],
  arrived: 0,
  stars: [],
  turnedAway: 0,
  expected: 0,
  unmet: [],
  ...over,
});

const OPEN: HoldOptions = { openOn: () => true };

const heldBeds = (guests: HoldingGuests, accepted: readonly Booking[]) =>
  planHolds(guests, accepted, 0, OPEN).map((hold) => Array.from(hold.beds));

describe('groupShapesOf', () => {
  it('draws the same parties for the same booking, of the kinds it booked', () => {
    const wedding = { id: 4, kind: 'wedding' as const, parties: 3 };
    expect(groupShapesOf(wedding)).toEqual(groupShapesOf(wedding));
    expect(groupShapesOf(wedding).map((shape) => shape.kind)).toEqual([
      'friends',
      'couple',
      'couple',
    ]);
    expect(groupShapesOf({ id: 1, kind: 'couple', parties: 2 })).toMatchObject([
      { adults: 2, children: 0 },
      { adults: 2, children: 0 },
    ]);
  });
});

describe('groupLeavesOn', () => {
  it('goes the morning after its last night, cut short by the season', () => {
    expect(groupLeavesOn({ arrivesOn: 5, nights: 3 }, undefined)).toBe(9);
    expect(groupLeavesOn({ arrivesOn: 5, nights: 3 }, 5)).toBe(7);
  });
});

describe('planHolds', () => {
  it('holds beds a guest leaving before the group comes frees, but not one still in bed', () => {
    const leaving = stays(4, { home: 0, arrivedOn: 0, nights: 3 });
    expect(heldBeds(guestsWith(leaving), [couple()])).toEqual([[2, 0]]);
    const staying = stays(4, { home: 0, arrivedOn: 0, nights: 4 });
    expect(heldBeds(guestsWith(staying), [couple()])).toEqual([[0, 2]]);
  });

  it('houses the group booked first first, and a later one around it', () => {
    const full = [
      ...stays(2, { home: 0, arrivedOn: 0, nights: 9 }),
      ...stays(4, { home: 1, arrivedOn: 0, nights: 9 }),
    ];
    const first = couple({ id: 1, arrivesOn: 6 });
    const second = couple({ id: 2, arrivesOn: 5 });
    const holds = planHolds(guestsWith(full), [second, first], 0, OPEN);
    expect(holds.map((hold) => [hold.booking, [...hold.beds], hold.unhoused])).toEqual([
      [1, [2, 0], []],
      [2, [0, 0], [2]],
    ]);
  });

  it('lets a group arriving after another has gone have its beds', () => {
    const full = [
      ...stays(2, { home: 0, arrivedOn: 0, nights: 20 }),
      ...stays(4, { home: 1, arrivedOn: 0, nights: 20 }),
    ];
    const first = couple({ id: 1, arrivesOn: 2, nights: 2 });
    const later = couple({ id: 2, arrivesOn: 6 });
    expect(heldBeds(guestsWith(full), [first, later])).toEqual([
      [2, 0],
      [2, 0],
    ]);
  });

  it('holds nothing in a lodging shut on the group’s morning', () => {
    const shut: HoldOptions = { openOn: (key) => key !== 'cottage#1' };
    const [hold] = planHolds(guestsWith([]), [couple()], 0, shut);
    expect([...hold!.beds]).toEqual([0, 2]);
  });

  it('plans today’s group on the beds free right now', () => {
    const unmade = guestsWith([], [1, 2]);
    const [hold] = planHolds(unmade, [couple({ arrivesOn: 0 })], 0, OPEN);
    expect([...hold!.beds]).toEqual([0, 2]);
  });

  it('holds nothing for a group already here, or one whose day has passed', () => {
    const here = couple({ state: 'staying' });
    expect(planHolds(guestsWith([]), [here, couple({ id: 2, arrivesOn: 0 })], 1, OPEN)).toEqual([]);
  });
});

describe('spareUntil', () => {
  const options = (leavesOn: number, except?: number) => ({
    ...OPEN,
    leavesOn,
    ...(except === undefined ? {} : { except }),
  });

  it('asks nothing of a party gone before the group comes', () => {
    const guests = guestsWith([]);
    const holds = planHolds(guests, [couple()], 0, OPEN);
    expect(spareUntil(guests, holds, 0, options(4))).toBeUndefined();
    expect([...spareUntil(guests, holds, 0, options(5))!]).toEqual([2, 4]);
  });

  it('leaves free now the beds whose guests go before the group comes', () => {
    const guests = guestsWith(stays(2, { home: 0, arrivedOn: 0, nights: 2 }));
    const holds = planHolds(guests, [couple()], 0, OPEN);
    expect([...holds[0]!.beds]).toEqual([2, 0]);
    expect([...spareUntil(guests, holds, 0, options(9))!]).toEqual([2, 4]);
  });

  it('spares the group its own hold', () => {
    const guests = guestsWith([], [2, 0]);
    const today = couple({ arrivesOn: 0 });
    const holds = planHolds(guests, [today], 0, OPEN);
    expect(spareUntil(guests, holds, 0, options(4, 1))).toBeUndefined();
  });
});

describe('bedsOfHolds', () => {
  it('counts the beds held, where, and the guests left with none', () => {
    const guests = guestsWith(stays(4, { home: 1, arrivedOn: 0, nights: 9 }));
    const bedsOf = bedsOfHolds(planHolds(guests, [couple({ parties: 3 })], 0, OPEN), HOMES);
    expect(bedsOf(1)).toEqual({ held: 4, lodgings: ['Cottage'], unhoused: 2 });
    expect(bedsOf(2)).toBeNull();
  });
});
