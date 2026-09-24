import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { GuestNeed, NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { PartyKind } from '../../guests/domain/parties';
import { saltFor, tasteFor } from './appeal';
import { chooseVenue, type ChoiceOptions } from './chooseVenue';
import { createNeeds, NEEDS, type Needs } from './needs';
import { MAX_QUEUE_SHOWN } from './queueLane';
import type { Venue } from './venues';
import { weatherEffect } from './weather';

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
  doors: [],
});

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

describe('chooseVenue with a line at the door', () => {
  const queued = (
    person: number,
    needs: Needs,
    venues: readonly Venue[],
    queueLength: (venue: number) => number,
  ): ReturnType<typeof chooseVenue> =>
    chooseVenue({ needs, guests, person, venues, x: 0, z: 0, queueLength });

  it('answers exactly as plan 017 did when no queue is handed in', () => {
    const venues = [
      venue('snack#0', [{ need: 'hunger', amount: 0.3 }], 60),
      venue('restaurant#0', [{ need: 'hunger', amount: 1 }], 1400),
    ];
    for (const kind of ['family', 'friends'] as const) {
      const person = someone(kind);
      const needs = wanting(person, 'hunger');
      expect(queued(person, needs, venues, () => 0)).toEqual(decide(person, needs, venues));
    }
  });

  it('walks past the near bakery when the line outside it is long enough', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 150), venue('bakery#1', HUNGER, 600)];
    expect(decide(person, wanting(person, 'hunger'), venues)?.venue).toBe(0);
    expect(
      queued(person, wanting(person, 'hunger'), venues, (v) => (v === 0 ? 10 : 0))?.venue,
    ).toBe(1);
  });

  it('will not choose a venue whose line is already as long as guests will join', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 150)];
    expect(queued(person, wanting(person, 'hunger'), venues, () => MAX_QUEUE_SHOWN)).toBeNull();
    expect(
      queued(person, wanting(person, 'hunger'), venues, () => MAX_QUEUE_SHOWN - 1)?.venue,
    ).toBe(0);
  });

  it('will not choose a venue whose own short lane is full, however far below the ceiling', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 150), venue('bakery#1', HUNGER, 600)];
    const needs = wanting(person, 'hunger');
    const options: ChoiceOptions = {
      needs,
      guests,
      person,
      venues,
      x: 0,
      z: 0,
      queueLength: (v) => (v === 0 ? 2 : 0),
    };
    expect(chooseVenue(options)?.venue).toBe(0);
    expect(chooseVenue({ ...options, queueLimit: (v) => (v === 0 ? 2 : 12) })?.venue).toBe(1);
  });

  it('lets a big place absorb a queue that would rule out a small one', () => {
    const person = someone('couple');
    const venues = [
      { ...venue('kiosk#0', HUNGER, 300), capacity: 2 },
      { ...venue('club#0', HUNGER, 300), capacity: 25 },
    ];
    expect(queued(person, wanting(person, 'hunger'), venues, () => 0)?.venue).toBe(0);
    expect(queued(person, wanting(person, 'hunger'), venues, () => 6)?.venue).toBe(1);
  });
});

describe('chooseVenue on the whole visit, not one need', () => {
  const SNACK: readonly NeedRelief[] = [{ need: 'hunger', amount: 0.6 }];
  const MEAL: readonly NeedRelief[] = [{ need: 'hunger', amount: 1 }];
  const BAR: readonly NeedRelief[] = [
    { need: 'thirst', amount: 1 },
    { need: 'fun', amount: 0.2 },
  ];
  const CLUB: readonly NeedRelief[] = [
    { need: 'fun', amount: 0.7 },
    { need: 'thirst', amount: 0.4 },
  ];

  const at = (person: number, levels: Partial<Record<GuestNeed, number>>): Needs => {
    const needs = createNeeds(guests, 7);
    for (const each of NEEDS) needs.level[each][person] = 1;
    for (const [need, level] of Object.entries(levels)) {
      needs.level[need as GuestNeed][person] = level;
    }
    return needs;
  };

  it('sends a mildly hungry guest to the near snack bar and a starving one to the restaurant', () => {
    const person = someone('couple');
    const venues = [venue('snack#0', SNACK, 200), venue('restaurant#0', MEAL, 220)];
    expect(decide(person, at(person, { hunger: 0.5 }), venues)?.venue).toBe(0);
    expect(decide(person, at(person, { hunger: 0.05 }), venues)?.venue).toBe(1);
  });

  it('sends a bored-and-thirsty guest to the beachclub and a purely thirsty one to the bar', () => {
    const person = someone('friends');
    const venues = [venue('bar#0', BAR, 200), venue('club#0', CLUB, 200)];
    expect(decide(person, at(person, { thirst: 0.5, fun: 0.5 }), venues)?.venue).toBe(1);
    expect(decide(person, at(person, { thirst: 0 }), venues)?.venue).toBe(0);
  });

  it('names the need most of the visit was for, not the one that sent them out', () => {
    const person = someone('friends');
    const choice = decide(person, at(person, { thirst: 0.95, fun: 0 }), [venue('bar#0', BAR, 200)]);
    expect(choice?.need).toBe<GuestNeed>('fun');
  });

  it('will not walk somebody to a place whose cost outweighs what it gives them', () => {
    const person = someone('friends');
    const court = venue(
      'court#0',
      [
        { need: 'fun', amount: 0.05 },
        { need: 'energy', amount: -0.4 },
      ],
      200,
    );
    expect(decide(person, at(person, { fun: 0.5, energy: 0.6 }), [court])).toBeNull();
  });
});

describe('chooseVenue with the place filling up', () => {
  const occupied = (
    person: number,
    needs: Needs,
    venues: readonly Venue[],
    occupants: (venue: number) => number,
  ): ReturnType<typeof chooseVenue> =>
    chooseVenue({ needs, guests, person, venues, x: 0, z: 0, occupants });

  it('sends a guest past a half-full venue to an empty one, with nobody queueing at all', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 200), venue('bakery#1', HUNGER, 260)];
    expect(occupied(person, wanting(person, 'hunger'), venues, () => 0)?.venue).toBe(0);
    expect(
      occupied(person, wanting(person, 'hunger'), venues, (v) => (v === 0 ? 8 : 0))?.venue,
    ).toBe(1);
  });

  it('answers exactly as plan 018 did when nobody is inside anything', () => {
    const venues = [
      venue('snack#0', [{ need: 'hunger', amount: 0.3 }], 60),
      venue('restaurant#0', [{ need: 'hunger', amount: 1 }], 1400),
    ];
    for (const kind of ['family', 'friends'] as const) {
      const person = someone(kind);
      const needs = wanting(person, 'hunger');
      expect(occupied(person, needs, venues, () => 0)).toEqual(decide(person, needs, venues));
    }
  });
});

describe('chooseVenue with a taste and a memory', () => {
  it('sends two guests of the same archetype in the same spot to different places', () => {
    const venues = [venue('bakery#0', HUNGER, 200), venue('bakery#1', HUNGER, 200)];
    const taste = (person: number) => (v: number) => tasteFor(saltFor(venues[v]!.key), person, 0.3);
    const chosen = new Set<number>();
    for (let person = 0; person < guests.count; person++) {
      if (guests.parties[guests.party[person]!]!.kind !== 'couple') continue;
      const needs = wanting(person, 'hunger');
      const choice = chooseVenue({
        needs,
        guests,
        person,
        venues,
        x: 0,
        z: 0,
        affinity: taste(person),
      });
      if (choice) chosen.add(choice.venue);
    }
    expect(chosen, 'every couple on the plot chose the same bakery').toEqual(new Set([0, 1]));
  });

  it('sends a guest to the equal place they did not just come out of', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 200), venue('bakery#1', HUNGER, 200)];
    const needs = wanting(person, 'hunger');
    const options: ChoiceOptions = { needs, guests, person, venues, x: 0, z: 0 };
    expect(chooseVenue(options)?.venue).toBe(0);
    expect(chooseVenue({ ...options, justLeft: 0 })?.venue).toBe(1);
    expect(chooseVenue({ ...options, venues: [venues[0]!], justLeft: 0 })?.venue).toBe(0);
  });
});

describe('chooseVenue against the dirt', () => {
  it('sends a guest to the clean one of two equal places', () => {
    const person = someone('couple');
    const venues = [venue('bakery#0', HUNGER, 200), venue('bakery#1', HUNGER, 200)];
    const needs = wanting(person, 'hunger');
    const options: ChoiceOptions = { needs, guests, person, venues, x: 0, z: 0 };
    expect(chooseVenue(options)?.venue).toBe(0);
    expect(chooseVenue({ ...options, cleanliness: (v) => (v === 0 ? 0.1 : 1) })?.venue).toBe(1);
    expect(chooseVenue({ ...options, cleanliness: () => 0.1 })?.venue).toBe(0);
  });

  it('still sends a desperate guest to the only filthy place standing', () => {
    const person = someone('family');
    const needs = wanting(person, 'hunger');
    const venues = [venue('bar#0', THIRST, 20), venue('bakery#0', HUNGER, 400)];
    const filthy: ChoiceOptions = {
      needs,
      guests,
      person,
      venues,
      x: 0,
      z: 0,
      cleanliness: () => 0,
    };
    expect(chooseVenue(filthy)?.venue).toBe(1);
    expect(chooseVenue(filthy)?.need).toBe<GuestNeed>('hunger');
  });
});

describe('a venue the weather has shut', () => {
  it('is never chosen, however much better than everything else it is', () => {
    const person = someone('couple');
    const needs = wanting(person, 'hunger');
    const venues = [
      venue('restaurant#0', [{ need: 'hunger', amount: 1 }], 20),
      venue('bakery#0', HUNGER, 900),
    ];
    expect(
      chooseVenue({ needs, guests, person, venues, x: 0, z: 0 })?.venue,
      'the near one wins on a clear day',
    ).toBe(0);
    expect(
      chooseVenue({
        needs,
        guests,
        person,
        venues,
        x: 0,
        z: 0,
        isOpen: (index) => index !== 0,
      })?.venue,
      'and is not a candidate at all once it is shut',
    ).toBe(1);
  });

  it('leaves the guest nowhere to go when it was the only thing serving them', () => {
    const person = someone('couple');
    const needs = wanting(person, 'hunger');
    const venues = [venue('bakery#0', HUNGER, 100)];
    expect(
      chooseVenue({ needs, guests, person, venues, x: 0, z: 0, isOpen: () => false }),
    ).toBeNull();
  });

  it('chooses exactly as it always did when no closure is handed in', () => {
    const person = someone('friends');
    const needs = wanting(person, 'thirst');
    const venues = [
      venue('bar#0', THIRST, 400),
      venue('bakery#0', HUNGER, 40),
      venue('bar#1', THIRST, 120),
    ];
    const before = chooseVenue({ needs, guests, person, venues, x: 0, z: 0 });
    const after = chooseVenue({ needs, guests, person, venues, x: 0, z: 0, isOpen: () => true });
    expect(after).toEqual(before);
  });

  it('lets a heatwave decide what is wanted, not only what is open', () => {
    const person = someone('family');
    const needs = createNeeds(guests, 7);
    for (const each of NEEDS) needs.level[each][person] = 1;
    needs.level.hunger[person] = 0.55;
    needs.level.thirst[person] = 0.5;
    const venues = [venue('bakery#0', HUNGER, 100), venue('bar#0', THIRST, 100)];
    expect(chooseVenue({ needs, guests, person, venues, x: 0, z: 0 })?.need).toBe<GuestNeed>(
      'hunger',
    );
    expect(
      chooseVenue({
        needs,
        guests,
        person,
        venues,
        x: 0,
        z: 0,
        weather: weatherEffect('heatwave'),
      })?.venue,
    ).toBe(1);
  });
});
