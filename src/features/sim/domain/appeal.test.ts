import { describe, expect, it } from 'vitest';
import { TILE_VOXELS, type GuestNeed, type NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { appealOf, dominantNeedAt, saltFor, tasteFor, usableGain } from './appeal';
import { ARCHETYPES } from './archetypes';
import { createNeeds, NEEDS, type Needs } from './needs';
import type { Venue } from './venues';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guests: Guests = createGuests({
  count: 120,
  homes: HOMES,
  variants: 4,
  childVariant: 3,
  seed: 5,
});

const someone = (kind: PartyKind): number => {
  for (let person = 0; person < guests.count; person++) {
    if (guests.parties[guests.party[person]!]!.kind === kind) return person;
  }
  throw new Error(`no ${kind} on the plot`);
};

const venue = (key: string, satisfies: readonly NeedRelief[]): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'food',
  satisfies,
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
  x: 100,
  z: 0,
  tileX: Math.floor(100 / TILE_VOXELS),
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

/** Everybody content, with the named needs set where the case wants them. */
const levels = (person: number, at: Partial<Record<GuestNeed, number>>): Needs => {
  const needs = createNeeds(guests, 7);
  for (const each of NEEDS) needs.level[each][person] = 1;
  for (const [need, level] of Object.entries(at)) needs.level[need as GuestNeed][person] = level;
  return needs;
};

describe('usableGain', () => {
  it('credits the whole amount to somebody with nothing in the tank', () => {
    expect(usableGain(0.6, 0)).toBeCloseTo(0.6);
  });

  it('credits only the room left when the need is nearly met', () => {
    // The Restaurant's 1.0 and the Snack Bar's 0.6 are the same half meal to
    // somebody who is half fed: a level is clamped at 1 and the rest goes
    // nowhere. This is the whole of plan 030's fault 4.
    expect(usableGain(1, 0.5)).toBeCloseTo(0.5);
    expect(usableGain(0.6, 0.5)).toBeCloseTo(0.5);
  });

  it('bounds a declared cost by what there is to take', () => {
    // An hour of basketball takes 0.4 of your energy, or all of it if you had
    // less than that.
    expect(usableGain(-0.4, 1)).toBeCloseTo(-0.4);
    expect(usableGain(-0.4, 0.1)).toBeCloseTo(-0.1);
    expect(usableGain(-0.4, 0)).toBeCloseTo(0);
  });
});

describe('appealOf', () => {
  it('sums every need the art declares, each weighted by the archetype', () => {
    const person = someone('friends');
    const { weight } = ARCHETYPES.friends;
    const club = venue('beach-club#0', [
      { need: 'fun', amount: 0.7 },
      { need: 'thirst', amount: 0.4 },
    ]);
    const needs = levels(person, { fun: 0.5, thirst: 0.5 });
    expect(appealOf(club, needs, guests, person)).toBeCloseTo(
      weight.fun * 0.5 + weight.thirst * 0.4,
    );
  });

  it('subtracts a declared cost, and can come back negative', () => {
    const person = someone('friends');
    const { weight } = ARCHETYPES.friends;
    // Bored, and only a little tired: the court is fun and it is tiring, and to
    // somebody with nothing left to be bored about it is only the tiring half.
    const court = venue('basketball-court#0', [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ]);
    const rested = levels(person, { fun: 0, energy: 1 });
    expect(appealOf(court, rested, guests, person)).toBeCloseTo(
      weight.fun * 0.8 - weight.energy * 0.4,
    );
    const content = levels(person, { energy: 1 });
    expect(appealOf(court, content, guests, person)).toBeCloseTo(-weight.energy * 0.4);
  });

  it('is 0 for a venue serving nothing this person is short of', () => {
    const person = someone('couple');
    const bakery = venue('bakery#0', [{ need: 'hunger', amount: 0.5 }]);
    expect(appealOf(bakery, levels(person, { thirst: 0 }), guests, person)).toBe(0);
  });

  it('is 0 for a venue that declares nothing at all', () => {
    const person = someone('couple');
    expect(appealOf(venue('bench#0', []), levels(person, { hunger: 0 }), guests, person)).toBe(0);
  });

  it('beats a bigger relief once the guest has no room for it', () => {
    // Plan 030's reported case, as arithmetic: at hunger 0.5 the Snack Bar and
    // the Restaurant are worth exactly the same, so the layout decides. At 0.05
    // the Restaurant is worth more, rightly.
    const person = someone('couple');
    const snack = venue('snack-bar#0', [{ need: 'hunger', amount: 0.6 }]);
    const restaurant = venue('restaurant#0', [{ need: 'hunger', amount: 1 }]);
    const half = levels(person, { hunger: 0.5 });
    expect(appealOf(snack, half, guests, person)).toBeCloseTo(
      appealOf(restaurant, half, guests, person),
    );
    const starving = levels(person, { hunger: 0.05 });
    expect(appealOf(restaurant, starving, guests, person)).toBeGreaterThan(
      appealOf(snack, starving, guests, person),
    );
  });
});

describe('appealOf over a walk', () => {
  it('credits the room the walk will make, not only the room there is now', () => {
    const person = someone('couple');
    const restaurant = venue('restaurant#0', [{ need: 'hunger', amount: 1 }]);
    const half = levels(person, { hunger: 0.5 });
    // A guest half fed has room for half a meal standing at the door. The far
    // side of the reference plot is 1 792 voxels, which `crowdRate.ts` walks in
    // 2.4 simulated hours - so a couple losing 0.13 an hour arrives at 0.188 and
    // four fifths of the meal fits rather than half of it.
    const atTheDoor = appealOf(restaurant, half, guests, person, 0);
    const acrossThePlot = appealOf(restaurant, half, guests, person, 112 * 16);
    const { weight, decayPerHour } = ARCHETYPES.couple;
    expect(atTheDoor).toBeCloseTo(weight.hunger * 0.5);
    expect(acrossThePlot).toBeCloseTo(weight.hunger * (1 - (0.5 - decayPerHour.hunger * 2.4)));
  });

  it('leaves a small relief small however far the walk', () => {
    // The other half of the same case, and the one that matters: an Ice Cream
    // Stand's 0.25 is 0.25 whether you are beside it or eighty minutes away, so
    // walking a long way for one is never the better answer.
    const person = someone('couple');
    const stand = venue('icecream#0', [{ need: 'hunger', amount: 0.25 }]);
    const half = levels(person, { hunger: 0.5 });
    expect(appealOf(stand, half, guests, person, 112 * 16)).toBeCloseTo(
      appealOf(stand, half, guests, person, 0),
    );
  });

  it('does not invent a need out of one that is completely met', () => {
    // The walk deepens a need somebody already has; it does not give them one.
    // Without this, a guest who wants nothing but a sandwich would be pulled
    // across the plot to a bar by the thirst they are going to have on arrival.
    const person = someone('couple');
    const bar = venue('bar#0', [{ need: 'thirst', amount: 1 }]);
    expect(appealOf(bar, levels(person, {}), guests, person, 112 * 16)).toBe(0);
    expect(
      appealOf(bar, levels(person, { thirst: 0.99 }), guests, person, 112 * 16),
    ).toBeGreaterThan(0);
  });

  it('still charges a declared cost in full to somebody with a full tank', () => {
    const person = someone('friends');
    const court = venue('court#0', [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ]);
    const rested = levels(person, { fun: 0 });
    expect(appealOf(court, rested, guests, person, 0)).toBeCloseTo(
      ARCHETYPES.friends.weight.fun * 0.8 - ARCHETYPES.friends.weight.energy * 0.4,
    );
  });
});

describe('dominantNeedAt', () => {
  it('names the need that contributed most, not the largest declared amount', () => {
    const person = someone('friends');
    // Thirst 1.0 against fun 0.2, and they are barely thirsty: the visit is
    // mostly about the fun, however the art ranks the two amounts.
    const bar = venue('poolside-bar#0', [
      { need: 'thirst', amount: 1 },
      { need: 'fun', amount: 0.2 },
    ]);
    const needs = levels(person, { thirst: 0.95, fun: 0 });
    expect(dominantNeedAt(bar, needs, guests, person)).toBe<GuestNeed>('fun');
    expect(dominantNeedAt(bar, levels(person, { thirst: 0 }), guests, person)).toBe<GuestNeed>(
      'thirst',
    );
  });

  it('is null where the visit is worth nothing', () => {
    const person = someone('couple');
    const bakery = venue('bakery#0', [{ need: 'hunger', amount: 0.5 }]);
    expect(dominantNeedAt(bakery, levels(person, {}), guests, person)).toBeNull();
  });

  it('breaks a tie towards the earlier need, whatever order the art lists them in', () => {
    const person = someone('couple');
    const amounts: readonly NeedRelief[] = [
      { need: 'fun', amount: 0.5 },
      { need: 'hunger', amount: 0.5 },
    ];
    const needs = levels(person, { hunger: 0, fun: 0 });
    // The same two reliefs, listed each way round. `hunger` is earlier in
    // `NEEDS`, and a couple weighs the two the same.
    expect(dominantNeedAt(venue('a#0', amounts), needs, guests, person)).toBe<GuestNeed>('hunger');
    expect(
      dominantNeedAt(venue('a#0', amounts.toReversed()), needs, guests, person),
    ).toBe<GuestNeed>('hunger');
  });
});

describe('the taste hash', () => {
  const SPREAD = 0.3;

  it('gives the same person the same taste for the same venue every time', () => {
    const salt = saltFor('poolside-bar#3');
    expect(tasteFor(salt, 17, SPREAD)).toBe(tasteFor(salt, 17, SPREAD));
    // And the salt is the key's, so a plot rebuilt with the venue at another
    // index hands back the same number.
    expect(saltFor('poolside-bar#3')).toBe(salt);
  });

  it('gives two people different tastes for the same venue, and one person different tastes for two', () => {
    const bar = saltFor('poolside-bar#3');
    const club = saltFor('beach-club#1');
    expect(tasteFor(bar, 17, SPREAD)).not.toBe(tasteFor(bar, 18, SPREAD));
    expect(tasteFor(bar, 17, SPREAD)).not.toBe(tasteFor(club, 17, SPREAD));
    expect(saltFor('poolside-bar#3')).not.toBe(saltFor('poolside-bar#4'));
  });

  it('stays inside the spread, and averages 1 over a crowd', () => {
    const salt = saltFor('restaurant#0');
    let sum = 0;
    for (let person = 0; person < 2000; person++) {
      const taste = tasteFor(salt, person, SPREAD);
      expect(taste).toBeGreaterThanOrEqual(1 - SPREAD / 2);
      expect(taste).toBeLessThan(1 + SPREAD / 2);
      sum += taste;
    }
    expect(sum / 2000).toBeCloseTo(1, 2);
  });
});
