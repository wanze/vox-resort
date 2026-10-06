import { describe, expect, it } from 'vitest';
import type { Needs } from './needs';
import {
  AUTO_HIRING,
  cheerTheAudience,
  hire,
  isStaffRole,
  onDuty,
  rosterFor,
  rosterOf,
  shiftChange,
  shortOf,
  STAFF_CAPS,
  STAFF_ROLES,
  staffPool,
  unwatched,
  WAGES,
  wagesFor,
  workplacesOf,
  type Workplaces,
} from './staff';
import type { Venue } from './venues';

const NOTHING: Workplaces = { venues: 0, bathing: 0, posts: 0, stages: 0 };

const plot = (places: Partial<Workplaces>): Workplaces => ({ ...NOTHING, ...places });

const NOBODY = { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 };

const venueAt = (key: string, flags: Partial<Venue>): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'activity',
  satisfies: [],
  capacity: 10,
  dwellSeconds: { min: 60, max: 120 },
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
  ...flags,
});

describe('staffPool', () => {
  it('holds every role up to its cap, in role order', () => {
    const pool = staffPool();
    const expected = STAFF_ROLES.flatMap((role) =>
      Array.from({ length: STAFF_CAPS[role] }, () => role),
    );
    expect(pool.role).toEqual(expected);
    expect(pool.count).toBe(expected.length);
  });

  it('deals the cleaners first, as many as the reference plot ever needs, and forty in all', () => {
    const pool = staffPool();
    expect(pool.role.slice(0, STAFF_CAPS.cleaner).every((role) => role === 'cleaner')).toBe(true);
    expect(STAFF_CAPS.cleaner).toBeGreaterThanOrEqual(rosterFor(plot({ venues: 91 })).cleaner);
    expect(pool.count).toBe(40);
  });

  it('draws every one of them with a model the art declares', () => {
    const pool = staffPool();
    expect(pool.variant).toHaveLength(pool.count);
    for (let worker = 0; worker < pool.count; worker++) {
      expect(pool.variant[worker]).toBe(STAFF_ROLES.indexOf(pool.role[worker]!));
    }
  });
});

describe('rosterFor', () => {
  it('puts nobody on a plot with nothing to clean', () => {
    expect(rosterFor(NOTHING).cleaner).toBe(0);
  });

  it('keeps the reference plot the cleaners it always had', () => {
    expect(rosterFor(plot({ venues: 91 })).cleaner).toBe(15);
  });

  it('follows the venue count, and never leaves a plot with venues unstaffed', () => {
    const counts = [1, 3, 6, 12, 30, 60].map((venues) => rosterFor(plot({ venues })).cleaner);
    expect(counts).toEqual([...counts].toSorted((a, b) => a - b));
    expect(rosterFor(plot({ venues: 1 })).cleaner).toBe(1);
    expect(rosterFor(plot({ venues: 6 })).cleaner).toBe(1);
    expect(rosterFor(plot({ venues: 30 })).cleaner).toBeGreaterThan(
      rosterFor(plot({ venues: 6 })).cleaner,
    );
  });

  it('caps every role so a tiled bench plot does not put a town on screen', () => {
    const town = rosterFor({
      venues: 5000,
      bathing: 500,
      posts: 500,
      stages: 500,
      reliable: 500,
    });
    expect(town).toEqual(STAFF_CAPS);
    expect(rosterFor(plot({ venues: 50_000 })).cleaner).toBe(STAFF_CAPS.cleaner);
  });

  it('puts a lifeguard at every pool and every tower', () => {
    expect(rosterFor(plot({ bathing: 1, posts: 1 })).lifeguard).toBe(2);
    expect(rosterFor(plot({ venues: 12 })).lifeguard, 'no water, no lifeguard').toBe(0);
  });

  it('sends one animator round three stages', () => {
    expect(rosterFor(plot({ stages: 7 })).animator).toBe(3);
    expect(rosterFor(plot({ stages: 3 })).animator).toBe(1);
    expect(rosterFor(plot({ stages: 1 })).animator).toBe(1);
    expect(rosterFor(NOTHING).animator).toBe(0);
  });

  it('adds cleaners for the beds they make up', () => {
    expect(rosterFor(plot({ venues: 12, beds: 120 })).cleaner).toBe(4);
    expect(rosterFor(plot({ venues: 12, beds: 120 })).cleaner).toBeGreaterThan(
      rosterFor(plot({ venues: 12 })).cleaner,
    );
  });

  it('gives a plot of lodgings and nothing else one cleaner', () => {
    expect(rosterFor(plot({ beds: 4 })).cleaner).toBe(1);
    expect(rosterFor(plot({ beds: 20 })).cleaner).toBe(1);
  });
});

describe('onDuty', () => {
  it('puts the first bodies of each role on duty and nobody else', () => {
    const pool = staffPool();
    const duty = onDuty(pool, { cleaner: 3, lifeguard: 2, animator: 1, mechanic: 0 });
    expect(Array.from(duty.slice(0, 4))).toEqual([1, 1, 1, 0]);
    const lifeguards = STAFF_CAPS.cleaner;
    expect(Array.from(duty.slice(lifeguards, lifeguards + 3))).toEqual([1, 1, 0]);
    const animators = lifeguards + STAFF_CAPS.lifeguard;
    expect(Array.from(duty.slice(animators, animators + 2))).toEqual([1, 0]);
    expect(duty.reduce((sum, each) => sum + each, 0)).toBe(6);
  });

  it('puts nobody on duty for an empty roster', () => {
    expect(onDuty(staffPool(), NOBODY).every((each) => each === 0)).toBe(true);
  });
});

describe('shiftChange', () => {
  it('starts whoever is on duty and away, and sends home whoever is off duty and here', () => {
    const duty = Uint8Array.from([1, 1, 0, 0]);
    const offPlot = Uint8Array.from([0, 1, 0, 1]);
    expect(shiftChange(duty, offPlot)).toEqual({ starting: [1], leaving: [2] });
  });

  it('changes nothing when the roster already stands', () => {
    expect(shiftChange(Uint8Array.from([1, 0]), Uint8Array.from([0, 1]))).toEqual({
      starting: [],
      leaving: [],
    });
  });
});

describe('wagesFor', () => {
  it('pays the roster times the table', () => {
    expect(wagesFor({ ...NOBODY, cleaner: 15 })).toBe(15 * WAGES.cleaner);
    expect(wagesFor(rosterFor(plot({ venues: 91 })))).toBe(15 * WAGES.cleaner);
  });

  it('pays one of each role the three rows summed, a lifeguard above a cleaner', () => {
    const one = { cleaner: 1, lifeguard: 1, animator: 1, mechanic: 0 };
    expect(wagesFor(one)).toBe(WAGES.cleaner + WAGES.lifeguard + WAGES.animator);
    expect(WAGES.lifeguard).toBeGreaterThan(WAGES.cleaner);
    expect(WAGES.animator).toBeGreaterThan(WAGES.lifeguard);
  });

  it('costs nothing for an empty roster, a cleared plot before anything is built', () => {
    expect(wagesFor(rosterFor(NOTHING))).toBe(0);
  });
});

describe('unwatched', () => {
  const venues = [
    venueAt('swimming-pool#0', { bathing: true }),
    venueAt('game-hall#0', {}),
    venueAt('waterpark#0', { bathing: true }),
    venueAt('beach', { bathing: true }),
  ];

  it('names the water nobody watches, and nothing that is not water', () => {
    expect(unwatched(venues, (venue) => venue === 0, 1)).toEqual(new Set(['waterpark#0', 'beach']));
    expect(unwatched(venues, () => true, 1).size).toBe(0);
  });

  it('leaves the beach out while no tower stands to watch it from', () => {
    expect(unwatched(venues, () => false, 0)).toEqual(new Set(['swimming-pool#0', 'waterpark#0']));
  });
});

describe('workplacesOf', () => {
  it('counts the venues, the water, the stages and the towers a lifeguard can reach', () => {
    const venues = [
      venueAt('swimming-pool#0', { bathing: true }),
      venueAt('kids-club#0', { stage: true }),
      venueAt('game-hall#0', { stage: true }),
      venueAt('bakery#0', {}),
    ];
    expect(workplacesOf(venues, [7])).toEqual({
      venues: 4,
      bathing: 1,
      posts: 1,
      stages: 2,
      reliable: 0,
    });
  });

  it('counts a venue with a resident DJ as a stage, so it is given an animator', () => {
    const venues = [venueAt('night-club#0', { dj: true }), venueAt('bakery#0', {})];
    expect(workplacesOf(venues, []).stages).toBe(1);
    expect(rosterFor(workplacesOf(venues, [])).animator).toBe(1);
  });

  it('sums the beds of the lodgings it is given', () => {
    const places = workplacesOf([venueAt('bakery#0', {})], [], [{ beds: 4 }, { beds: 40 }]);
    expect(places.beds).toBe(44);
  });
});

const needsOf = (count: number): Needs => ({
  count,
  level: {
    hunger: new Float32Array(count).fill(0.5),
    thirst: new Float32Array(count).fill(0.5),
    energy: new Float32Array(count).fill(0.5),
    fun: new Float32Array(count).fill(0.5),
    hygiene: new Float32Array(count).fill(0.5),
    health: new Float32Array(count).fill(1),
  },
});

describe('cheerTheAudience', () => {
  // Guest 0 inside the show, 1 in its line, 2 at the venue with no show, 3 nowhere, 4 gone home.
  const venueOf = [0, 0, 1, -1, 0];
  const shows = (hours: number) => ({
    performing: (venue: number) => venue === 0,
    venueOf: (person: number) => venueOf[person]!,
    waiting: (person: number) => person === 1,
    venues: 2,
    hours,
  });
  const present = Uint8Array.from([1, 1, 1, 1, 0]);

  it('tops up the fun of whoever is in the room with a show on, and nobody else', () => {
    const needs = needsOf(5);
    cheerTheAudience(needs, present, shows(1));
    expect(needs.level.fun[0]).toBeGreaterThan(0.5);
    expect(needs.level.fun[0]).toBeLessThan(1);
    expect(Array.from(needs.level.fun.slice(1))).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(needs.level.hunger[0]).toBe(0.5);
  });

  it('gives an hour of show about what a visit gives, and never more than content', () => {
    const needs = needsOf(5);
    cheerTheAudience(needs, present, shows(0.5));
    const half = needs.level.fun[0]! - 0.5;
    cheerTheAudience(needs, present, shows(0.5));
    expect(needs.level.fun[0]! - 0.5).toBeCloseTo(2 * half, 5);
    cheerTheAudience(needs, present, shows(20));
    expect(needs.level.fun[0]).toBe(1);
  });
});

describe('mechanics', () => {
  it('puts one mechanic on for every five venues that can break, and caps them', () => {
    expect(rosterFor(NOTHING).mechanic).toBe(0);
    expect(rosterFor(plot({ venues: 40 })).mechanic, 'nothing to break').toBe(0);
    expect(rosterFor(plot({ reliable: 1 })).mechanic).toBe(1);
    expect(rosterFor(plot({ reliable: 5 })).mechanic).toBe(1);
    expect(rosterFor(plot({ reliable: 6 })).mechanic).toBe(2);
    expect(rosterFor(plot({ reliable: 500 })).mechanic).toBe(STAFF_CAPS.mechanic);
    const venues = [
      venueAt('waterpark#0', { reliability: 400 }),
      venueAt('game-hall#0', { stage: true, reliability: 600 }),
      venueAt('bakery#0', {}),
    ];
    expect(workplacesOf(venues, []).reliable).toBe(2);
  });

  it('keeps the pool at forty, the mechanics last', () => {
    const pool = staffPool();
    expect(pool.count).toBe(40);
    expect(STAFF_ROLES.at(-1)).toBe('mechanic');
    expect(pool.role.slice(-STAFF_CAPS.mechanic).every((role) => role === 'mechanic')).toBe(true);
    expect(pool.variant.at(-1)).toBe(STAFF_ROLES.indexOf('mechanic'));
  });
});

describe('hiring', () => {
  const wanted = { cleaner: 4, lifeguard: 2, animator: 1, mechanic: 1 };

  it('clamps a hand-set count to the cap and to nobody, and rounds it', () => {
    expect(hire(AUTO_HIRING, 'cleaner', 99).cleaner).toBe(STAFF_CAPS.cleaner);
    expect(hire(AUTO_HIRING, 'lifeguard', -3).lifeguard).toBe(0);
    expect(hire(AUTO_HIRING, 'animator', 2.6).animator).toBe(3);
  });

  it('switches a role back to Auto with null', () => {
    const manual = hire(AUTO_HIRING, 'mechanic', 2);
    expect(hire(manual, 'mechanic', null)).toEqual(AUTO_HIRING);
  });

  it('leaves the hiring it was given untouched', () => {
    const before = { ...AUTO_HIRING };
    hire(AUTO_HIRING, 'cleaner', 3);
    expect(AUTO_HIRING).toEqual(before);
  });

  it('staffs an all-Auto resort exactly as the plot recommends', () => {
    expect(rosterOf(AUTO_HIRING, wanted)).toEqual(wanted);
    const reference = rosterFor(plot({ venues: 91, bathing: 3, posts: 2, stages: 4, reliable: 6 }));
    expect(rosterOf(AUTO_HIRING, reference)).toEqual(reference);
  });

  it('keeps a hand-set role at its number while the recommendation moves', () => {
    const hiring = hire(AUTO_HIRING, 'cleaner', 3);
    expect(rosterOf(hiring, wanted).cleaner).toBe(3);
    expect(rosterOf(hiring, { ...wanted, cleaner: 10 }).cleaner).toBe(3);
    expect(rosterOf(hiring, { ...wanted, cleaner: 10 }).lifeguard).toBe(2);
  });

  it('names only hand-set roles below what the plot wants', () => {
    expect(shortOf(AUTO_HIRING, wanted)).toEqual([]);
    const hiring = hire(hire(hire(AUTO_HIRING, 'cleaner', 1), 'lifeguard', 2), 'animator', 5);
    expect(shortOf(hiring, wanted)).toEqual([{ role: 'cleaner', short: 3, wanted: 4 }]);
  });

  it('tells a role from anything else a subject can be', () => {
    expect(isStaffRole('cleaner')).toBe(true);
    expect(isStaffRole('the beach')).toBe(false);
  });
});
