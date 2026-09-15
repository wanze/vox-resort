import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { GuestNeed, NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { chooseVenue, type ChoiceOptions } from './chooseVenue';
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

const venue = (key: string, satisfies: readonly NeedRelief[], x: number, z: number = 0): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'food',
  satisfies,
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
  x,
  z,
  tileX: Math.floor(x / TILE_VOXELS),
  tileZ: Math.floor(z / TILE_VOXELS),
  tilesX: 1,
  tilesZ: 1,
});

/** Everybody content but for the one need, which is run right down. */
const wanting = (person: number, need: GuestNeed | null): Needs => {
  const needs = createNeeds(guests, 7);
  for (const each of NEEDS) needs.level[each][person] = 1;
  if (need !== null) needs.level[need][person] = 0;
  return needs;
};

const decide = (
  person: number,
  needs: Needs,
  venues: readonly Venue[],
  at: { x: number; z: number } = { x: 0, z: 0 },
): ReturnType<typeof chooseVenue> => {
  const options: ChoiceOptions = { needs, guests, person, venues, x: at.x, z: at.z };
  return chooseVenue(options);
};

const HUNGER: readonly NeedRelief[] = [{ need: 'hunger', amount: 0.5 }];
const THIRST: readonly NeedRelief[] = [{ need: 'thirst', amount: 1 }];

describe('chooseVenue', () => {
  it('sends a guest who wants nothing nowhere', () => {
    const person = someone('couple');
    expect(decide(person, wanting(person, null), [venue('bakery#0', HUNGER, 100)])).toBeNull();
  });

  it('sends a hungry guest nowhere when the plot has nothing to eat', () => {
    const person = someone('couple');
    expect(decide(person, wanting(person, 'hunger'), [venue('bar#0', THIRST, 100)])).toBeNull();
  });

  it('picks the place that serves what is wanted, not merely the nearest', () => {
    const person = someone('couple');
    const venues = [venue('bar#0', THIRST, 20), venue('bakery#0', HUNGER, 400)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(1);
  });

  it('names the need it chose the place for', () => {
    const person = someone('couple');
    const choice = decide(person, wanting(person, 'hunger'), [venue('bakery#0', HUNGER, 200)]);
    expect(choice?.need).toBe<GuestNeed>('hunger');
  });

  it('walks to the nearer of two identical bakeries', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 600), venue('bakery#1', HUNGER, 150)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(1);
    expect(decide(person, wanting(person, 'hunger'), venues, { x: 900, z: 0 })?.venue).toBe(0);
  });

  it('measures the distance in both axes, not along one', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 300, 300), venue('bakery#1', HUNGER, 0, 200)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(1);
  });

  it('lets a short reach settle for the weak place nearby and a long one cross the plot', () => {
    // The same case twice: a snack at the door, a proper meal a long way off.
    const venues = [
      venue('snack#0', [{ need: 'hunger', amount: 0.3 }], 60),
      venue('restaurant#0', [{ need: 'hunger', amount: 1 }], 1400),
    ];
    const family = someone('family');
    const friends = someone('friends');
    expect(decide(family, wanting(family, 'hunger'), venues)?.venue).toBe(0);
    expect(decide(friends, wanting(friends, 'hunger'), venues)?.venue).toBe(1);
  });

  it('breaks a tie towards the lower index, so iteration luck never decides it', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 200), venue('bakery#1', HUNGER, -200)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(0);
  });

  it('will not send anybody somewhere that makes the need worse', () => {
    const person = someone('friends');
    const court = venue('court#0', [{ need: 'energy', amount: -0.4 }], 50);
    expect(decide(person, wanting(person, 'energy'), [court])).toBeNull();
  });

  it('chooses nothing on a plot with no venues standing at all', () => {
    const person = someone('couple');
    expect(decide(person, wanting(person, 'hunger'), [])).toBeNull();
  });
});

describe('chooseVenue with a real walking distance', () => {
  const walked = (
    person: number,
    needs: Needs,
    venues: readonly Venue[],
    walkingDistance: (venue: number) => number,
  ): ReturnType<typeof chooseVenue> =>
    chooseVenue({ needs, guests, person, venues, x: 0, z: 0, walkingDistance });

  it('prefers the one that is further as the crow flies but nearer on foot', () => {
    // The near one is across a river with no bridge: a long way round. The far
    // one is straight down the path. A straight line cannot tell them apart.
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 100), venue('bakery#1', HUNGER, 500)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(0);
    expect(
      walked(person, wanting(person, 'hunger'), venues, (v) => (v === 0 ? 2000 : 520))?.venue,
    ).toBe(1);
  });

  it('never sends anybody somewhere there is no path to', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 100)];
    expect(walked(person, wanting(person, 'hunger'), venues, () => Infinity)).toBeNull();
  });

  it('answers exactly as it did without one when it is not given', () => {
    // The same fixture as "a short reach settles for the weak place nearby",
    // handed its own straight-line distances: the walk that is the line.
    const venues = [
      venue('snack#0', [{ need: 'hunger', amount: 0.3 }], 60),
      venue('restaurant#0', [{ need: 'hunger', amount: 1 }], 1400),
    ];
    const asTheLine = (index: number): number => Math.hypot(venues[index]!.x, venues[index]!.z);
    for (const kind of ['family', 'friends'] as const) {
      const person = someone(kind);
      const needs = wanting(person, 'hunger');
      expect(walked(person, needs, venues, asTheLine)).toEqual(decide(person, needs, venues));
    }
  });
});
