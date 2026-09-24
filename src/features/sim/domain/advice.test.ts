import { describe, expect, it } from 'vitest';
import {
  adviceFarFromHome,
  adviceFor,
  adviceFullLines,
  adviceNoBeds,
  adviceNobodyComes,
  adviceDirty,
  adviceUnreachable,
  adviceUnservedNeeds,
  adviceUnvisited,
  adviceWeatherClosed,
  unreachableOn,
  type ResortFacts,
} from './advice';
import type { VenueDoors } from './doors';
import type { Lodging } from './lodgings';
import type { Venue } from './venues';
import type { GuestNeed, NeedRelief } from '../../../../voxel-gen/voxelgen.ts';

const TILE = 16;

function venueOf(parts: {
  key: string;
  label?: string;
  satisfies?: readonly NeedRelief[];
  capacity?: number;
  x?: number;
  z?: number;
}): Venue {
  return {
    key: parts.key,
    id: parts.key.split('#')[0]!,
    label: parts.label ?? parts.key,
    role: 'food',
    satisfies: parts.satisfies ?? [],
    capacity: parts.capacity ?? 8,
    dwellSeconds: { min: 600, max: 1200 },
    x: parts.x ?? 0,
    z: parts.z ?? 0,
    tileX: Math.floor((parts.x ?? 0) / TILE),
    tileZ: Math.floor((parts.z ?? 0) / TILE),
    tilesX: 1,
    tilesZ: 1,
    doors: [],
  };
}

function lodgingOf(parts: { key: string; label?: string; x?: number; z?: number }): Lodging {
  return {
    key: parts.key,
    id: parts.key.split('#')[0]!,
    label: parts.label ?? parts.key,
    beds: 4,
    dwellSeconds: { min: 3600, max: 7200 },
    tileX: Math.floor((parts.x ?? 0) / TILE),
    tileZ: Math.floor((parts.z ?? 0) / TILE),
    tilesX: 2,
    tilesZ: 2,
    x: parts.x ?? 0,
    z: parts.z ?? 0,
    doors: [],
  };
}

const NOTHING_WANTED: { readonly [need in GuestNeed]: number } = {
  hunger: 0,
  thirst: 0,
  energy: 0,
  fun: 0,
  hygiene: 0,
};

function healthyFacts(over: Partial<ResortFacts> = {}): ResortFacts {
  const everything: readonly NeedRelief[] = [
    { need: 'hunger', amount: 0.5 },
    { need: 'thirst', amount: 0.5 },
    { need: 'energy', amount: 0.5 },
    { need: 'fun', amount: 0.5 },
    { need: 'hygiene', amount: 0.5 },
  ];
  return {
    venues: [venueOf({ key: 'bakery#0', label: 'Bakery', satisfies: everything, x: 32, z: 32 })],
    lodgings: [lodgingOf({ key: 'hotel#0', label: 'Hotel', x: 48, z: 32 })],
    present: 100,
    homeless: 0,
    bedsFree: 20,
    wanting: { ...NOTHING_WANTED, hunger: 40 },
    cleanliness: new Map(),
    balks: new Map(),
    visits: new Map([['bakery#0', 30]]),
    unreachable: new Set(),
    ...over,
  };
}

describe('the advice rules', () => {
  it('says how many guests have nowhere to sleep', () => {
    const advice = adviceNoBeds(healthyFacts({ homeless: 25, bedsFree: 0 }));
    expect(advice).toEqual({
      kind: 'no-beds',
      weight: 0.25,
      subject: 'beds',
      count: 25,
      at: null,
      need: null,
    });
  });

  it('softens the bed shortage where beds are standing free, which is a rooming problem', () => {
    const full = adviceNoBeds(healthyFacts({ homeless: 25, bedsFree: 0 }))!;
    const roomy = adviceNoBeds(healthyFacts({ homeless: 25, bedsFree: 10 }))!;
    expect(roomy.count).toBe(full.count);
    expect(roomy.weight).toBeLessThan(full.weight);
  });

  it('names a need nothing on the plot relieves, and only one that somebody wants', () => {
    const bar = venueOf({ key: 'bar#0', satisfies: [{ need: 'thirst', amount: 0.6 }] });
    const advice = adviceUnservedNeeds(
      healthyFacts({ venues: [bar], wanting: { ...NOTHING_WANTED, hunger: 30, fun: 0 } }),
    );
    expect(advice).toEqual([
      {
        kind: 'unserved-need',
        weight: 0.3,
        subject: 'hunger',
        count: 30,
        at: null,
        need: 'hunger',
      },
    ]);
  });

  it('picks out the place turning most people away, scaled by how many that was', () => {
    const quiet = venueOf({ key: 'shower#0', label: 'Beach Shower' });
    const busy = venueOf({ key: 'restaurant#0', label: 'Restaurant' });
    const advice = adviceFullLines(
      healthyFacts({
        venues: [quiet, busy],
        balks: new Map([
          ['shower#0', 2],
          ['restaurant#0', 60],
        ]),
        visits: new Map([['restaurant#0', 60]]),
      }),
    );
    expect(advice?.subject).toBe('Restaurant');
    expect(advice?.count).toBe(60);
    expect(advice?.weight).toBeCloseTo(0.5, 5);
  });

  it('names the place the cleaners are furthest behind on, and is quiet below the line', () => {
    const big = venueOf({ key: 'pool#0', label: 'Swimming Pool', capacity: 40 });
    const small = venueOf({ key: 'shower#0', label: 'Beach Shower', capacity: 1 });
    const venues = [big, small];

    expect(
      adviceDirty(healthyFacts({ venues, cleanliness: new Map([['pool#0', 0.8]]) })),
    ).toBeNull();
    expect(adviceDirty(healthyFacts({ venues }))).toBeNull();

    const worst = adviceDirty(
      healthyFacts({
        venues,
        cleanliness: new Map([
          ['pool#0', 0.2],
          ['shower#0', 0.5],
        ]),
      }),
    );
    expect(worst?.kind).toBe('dirty');
    expect(worst?.subject).toBe('Swimming Pool');
    expect(worst?.count).toBe(20);
    expect(worst?.at).toEqual({ tileX: 0, tileZ: 0 });
    const dirt = new Map([
      ['pool#0', 0.3],
      ['shower#0', 0.3],
    ]);
    const bigger = adviceDirty(healthyFacts({ venues, cleanliness: dirt }));
    expect(bigger?.subject).toBe('Swimming Pool');
    const alone = adviceDirty(healthyFacts({ venues: [small], cleanliness: dirt }));
    expect(alone?.subject).toBe('Beach Shower');
    expect(alone!.weight).toBeLessThan(bigger!.weight);
  });

  it('names every venue nothing can walk to, with the places standing idle in it', () => {
    const bar = venueOf({ key: 'bar#0', label: 'Poolside Bar', capacity: 12 });
    const advice = adviceUnreachable(
      healthyFacts({ venues: [bar], unreachable: new Set(['bar#0']) }),
    );
    expect(advice).toEqual([
      {
        kind: 'unreachable',
        weight: 0.9,
        subject: 'Poolside Bar',
        count: 12,
        at: { tileX: 0, tileZ: 0 },
        need: null,
      },
    ]);
  });

  it('names the lodging furthest from anything serving a need, in tiles', () => {
    const food = venueOf({
      key: 'bakery#0',
      label: 'Bakery',
      satisfies: [{ need: 'hunger', amount: 0.5 }],
      x: 0,
      z: 0,
    });
    const advice = adviceFarFromHome(
      healthyFacts({
        venues: [food],
        lodgings: [lodgingOf({ key: 'hotel#0', label: 'Hotel', x: 640, z: 0 })],
      }),
    );
    expect(advice?.kind).toBe('far-from-home');
    expect(advice?.subject).toBe('Hotel');
    expect(advice?.count).toBe(40);
    expect(advice?.weight).toBeCloseTo(640 / 900, 5);
    expect(advice?.need).toBe('hunger');
    expect(advice?.at).toEqual({ tileX: 40, tileZ: 0 });
  });

  it('measures to the nearest venue serving the need, not to the nearest venue', () => {
    const bar = venueOf({
      key: 'bar#0',
      satisfies: [{ need: 'thirst', amount: 0.6 }],
      x: 640,
      z: 0,
    });
    const bakery = venueOf({
      key: 'bakery#0',
      satisfies: [{ need: 'hunger', amount: 0.5 }],
      x: 0,
      z: 0,
    });
    const advice = adviceFarFromHome(
      healthyFacts({
        venues: [bar, bakery],
        lodgings: [lodgingOf({ key: 'hotel#0', label: 'Hotel', x: 656, z: 0 })],
      }),
    );
    expect(advice?.count).toBe(41);
    expect(advice?.need).toBe('hunger');
  });

  it('notes a venue nobody went to all day, and says nothing about an unreachable one', () => {
    const idle = venueOf({ key: 'tennis#0', label: 'Tennis Court', capacity: 4 });
    const stranded = venueOf({ key: 'bar#0', label: 'Poolside Bar' });
    const busy = venueOf({ key: 'bakery#0', label: 'Bakery' });
    const advice = adviceUnvisited(
      healthyFacts({
        venues: [idle, stranded, busy],
        visits: new Map([['bakery#0', 12]]),
        unreachable: new Set(['bar#0']),
      }),
    );
    expect(advice).toHaveLength(1);
    expect(advice[0]).toMatchObject({
      kind: 'unvisited',
      subject: 'Tennis Court',
      count: 4,
      at: { tileX: 0, tileZ: 0 },
      need: null,
    });
    expect(advice[0]!.weight).toBeCloseTo(0.22, 5);
  });

  it('ranks an idle venue by how much room stood empty in it', () => {
    const pool = venueOf({ key: 'pool#0', label: 'Swimming Pool', capacity: 30, x: 16 });
    const shower = venueOf({ key: 'shower#0', label: 'Beach Shower', capacity: 1, x: 32 });
    const busy = venueOf({ key: 'bakery#0', label: 'Bakery', x: 48 });
    const advice = adviceUnvisited(
      healthyFacts({ venues: [shower, pool, busy], visits: new Map([['bakery#0', 3]]) }),
    );
    expect(advice.map((each) => each.subject)).toEqual(['Beach Shower', 'Swimming Pool']);
    expect(advice[1]!.weight).toBeGreaterThan(advice[0]!.weight);
    expect(advice[1]!.weight).toBeLessThan(0.9);
  });

  it('says nothing about a day on which nobody went anywhere at all', () => {
    const advice = adviceUnvisited(healthyFacts({ visits: new Map() }));
    expect(advice).toEqual([]);
  });
});

describe('adviceFor', () => {
  it('has nothing to say about a plot with nothing wrong with it', () => {
    expect(adviceFor(healthyFacts())).toEqual([]);
  });

  it('has nothing to say about a plot with nobody on it, rather than dividing by zero', () => {
    const empty = adviceFor(
      healthyFacts({
        present: 0,
        homeless: 0,
        wanting: NOTHING_WANTED,
        visits: new Map(),
        unreachable: new Set(['bakery#0']),
      }),
    );
    expect(empty).toEqual([]);
  });

  it('puts nowhere to sleep above a full line at the same count', () => {
    const advice = adviceFor(
      healthyFacts({
        homeless: 50,
        bedsFree: 0,
        balks: new Map([['bakery#0', 50]]),
        visits: new Map([['bakery#0', 50]]),
      }),
    );
    expect(advice[0]!.kind).toBe('no-beds');
    expect(advice.map((each) => each.kind)).toContain('full-lines');
  });

  it('sorts by weight descending, and breaks a tie towards the earlier kind', () => {
    const one = venueOf({ key: 'a#0', label: 'A' });
    const two = venueOf({ key: 'b#0', label: 'B' });
    const advice = adviceFor(
      healthyFacts({
        venues: [one, two],
        unreachable: new Set(['a#0']),
        visits: new Map([['somewhere-else#0', 4]]),
        wanting: NOTHING_WANTED,
      }),
    );
    expect(advice.map((each) => [each.kind, each.subject])).toEqual([
      ['unreachable', 'A'],
      ['unvisited', 'B'],
    ]);
    expect(advice[0]!.weight).toBeGreaterThan(advice[1]!.weight);
  });
});

const doorsOf = (nodes: readonly number[], sand: readonly { x: number; z: number }[]) =>
  ({ nodes, declared: true, sand }) satisfies VenueDoors;

describe('unreachableOn', () => {
  it('strands a venue with no door node and no sand in front of it', () => {
    const bar = venueOf({ key: 'bar#0' });
    expect([...unreachableOn([bar], () => doorsOf([], []))]).toEqual(['bar#0']);
  });

  it('leaves a venue with sand in front of it alone, though it has no door node', () => {
    const shower = venueOf({ key: 'beach-shower#0' });
    expect([...unreachableOn([shower], () => doorsOf([], [{ x: 8, z: 8 }]))]).toEqual([]);
  });

  it('leaves a venue with a door node alone', () => {
    const bakery = venueOf({ key: 'bakery#0' });
    expect([...unreachableOn([bakery], () => doorsOf([4], []))]).toEqual([]);
  });
});

describe('adviceWeatherClosed', () => {
  const twoKindsOfFun = (): Partial<ResortFacts> => ({
    venues: [
      venueOf({ key: 'swimming-pool#0', label: 'Pool', satisfies: [{ need: 'fun', amount: 0.8 }] }),
      venueOf({
        key: 'game-hall#0',
        label: 'Games Hall',
        satisfies: [{ need: 'fun', amount: 0.8 }],
      }),
    ],
    wanting: { ...NOTHING_WANTED, fun: 50 },
    visits: new Map([
      ['swimming-pool#0', 30],
      ['game-hall#0', 30],
    ]),
  });

  it('says nothing on a day that shut nothing', () => {
    expect(adviceWeatherClosed(healthyFacts(twoKindsOfFun()))).toEqual([]);
    expect(adviceWeatherClosed(healthyFacts({ ...twoKindsOfFun(), closed: new Set() }))).toEqual(
      [],
    );
  });

  it('says nothing while half of what serves a need is still standing', () => {
    const facts = healthyFacts({ ...twoKindsOfFun(), closed: new Set(['swimming-pool#0']) });
    expect(adviceWeatherClosed(facts)).toEqual([]);
  });

  it('names the need whose venues are mostly shut', () => {
    const facts = healthyFacts({
      ...twoKindsOfFun(),
      closed: new Set(['swimming-pool#0', 'game-hall#0']),
    });
    expect(adviceWeatherClosed(facts)).toEqual([
      {
        kind: 'weather-closed',
        weight: 0.5,
        subject: 'fun',
        count: 2,
        at: null,
        need: 'fun',
      },
    ]);
  });

  it('leaves a need nobody wants, and one nothing serves, to the rules that own them', () => {
    const unwanted = healthyFacts({
      ...twoKindsOfFun(),
      wanting: NOTHING_WANTED,
      closed: new Set(['swimming-pool#0', 'game-hall#0']),
    });
    expect(adviceWeatherClosed(unwanted)).toEqual([]);
    const unserved = healthyFacts({
      venues: [],
      wanting: { ...NOTHING_WANTED, fun: 50 },
      visits: new Map(),
      closed: new Set(),
    });
    expect(adviceWeatherClosed(unserved)).toEqual([]);
  });

  it('comes out on the list the panel reads', () => {
    const facts = healthyFacts({
      ...twoKindsOfFun(),
      closed: new Set(['swimming-pool#0', 'game-hall#0']),
    });
    expect(adviceFor(facts).map((advice) => advice.kind)).toContain('weather-closed');
  });
});

describe('why nobody comes', () => {
  const newPlot = (over: Partial<ResortFacts>): ResortFacts =>
    healthyFacts({
      present: 0,
      homeless: 0,
      wanting: NOTHING_WANTED,
      visits: new Map(),
      ...over,
    });

  it('says the resort is closed once it has a bed, and not on a bare plot', () => {
    expect(adviceFor(newPlot({ open: false, bedsTotal: 4 })).map((each) => each.kind)).toEqual([
      'closed',
    ]);
    expect(adviceFor(newPlot({ open: false, bedsTotal: 0 }))).toEqual([]);
  });

  it('says there is no entrance on an empty resort that is open', () => {
    const advice = adviceFor(newPlot({ open: true, entrance: false, reception: false }));
    expect(advice.map((each) => each.kind)).toEqual(['no-entrance']);
  });

  it('says no reception is reachable on an empty resort that is open', () => {
    const advice = adviceFor(newPlot({ open: true, entrance: true, reception: false }));
    expect(advice.map((each) => each.kind)).toEqual(['no-reception']);
  });

  it('is silent on a running resort, and puts itself first when it is not', () => {
    const running = { open: true, entrance: true, reception: true, bedsTotal: 40 };
    expect(adviceNobodyComes(healthyFacts(running))).toBeNull();
    expect(adviceFor(healthyFacts(running))).toEqual([]);
    const shut = adviceFor(
      healthyFacts({ ...running, open: false, homeless: 100, bedsFree: 0 }),
    ).map((each) => each.kind);
    expect(shut).toEqual(['closed', 'no-beds']);
  });
});
