import { describe, expect, it } from 'vitest';
import type { ResortFacts } from './advice';
import { demandFor } from './demand';
import type { Venue } from './venues';
import type { GuestNeed, NeedRelief } from '../../../../voxel-gen/voxelgen.ts';

// An hour at the table, so each place lets in only the one guest in the half hour counted.
const AN_HOUR = { min: 3600, max: 3600 };

function venueOf(
  key: string,
  needs: readonly GuestNeed[],
  capacity: number,
  dwellSeconds = AN_HOUR,
): Venue {
  const satisfies: readonly NeedRelief[] = needs.map((need) => ({ need, amount: 0.5 }));
  return {
    key,
    id: key.split('#')[0]!,
    label: key,
    role: 'food',
    satisfies,
    capacity,
    dwellSeconds,
    x: 0,
    z: 0,
    tileX: 0,
    tileZ: 0,
    tilesX: 1,
    tilesZ: 1,
    doors: [],
  };
}

const NOTHING_WANTED: { readonly [need in GuestNeed]: number } = {
  hunger: 0,
  thirst: 0,
  energy: 0,
  fun: 0,
  hygiene: 0,
  health: 0,
};

function factsOf(over: Partial<ResortFacts> = {}): ResortFacts {
  return {
    venues: [],
    lodgings: [],
    present: 100,
    homeless: 0,
    bedsFree: 50,
    bedsTotal: 100,
    wanting: NOTHING_WANTED,
    cleanliness: new Map(),
    balks: new Map(),
    visits: new Map(),
    unreachable: new Set(),
    ...over,
  };
}

const wanting = (want: Partial<Record<GuestNeed, number>>) => ({ ...NOTHING_WANTED, ...want });

describe('the demand for each need', () => {
  it('reads every need as about right while nobody is here, and the beds from the beds', () => {
    const demand = demandFor(
      factsOf({ present: 0, bedsFree: 100, wanting: wanting({ hunger: 9 }) }),
    );
    for (const need of ['hunger', 'thirst', 'energy', 'fun', 'hygiene', 'health'] as const) {
      expect(demand.lines[need].pressure).toBe(0);
    }
    expect(demand.lines.beds.pressure).toBe(-1);
  });

  it('is full when guests want what no venue serves, and flat when nobody wants it', () => {
    const demand = demandFor(factsOf({ wanting: wanting({ hunger: 3 }) }));
    expect(demand.lines.hunger.pressure).toBe(1);
    expect(demand.lines.thirst.pressure).toBe(0);
  });

  it('sits below zero where there is plenty of room', () => {
    const demand = demandFor(
      factsOf({ venues: [venueOf('cafe#0', ['hunger'], 50)], wanting: wanting({ hunger: 5 }) }),
    );
    expect(demand.lines.hunger.pressure).toBeCloseTo(-0.9);
    expect(demand.lines.hunger.places).toBe(50);
  });

  it('is full where twice as many want it as there are places', () => {
    const demand = demandFor(
      factsOf({ venues: [venueOf('cafe#0', ['hunger'], 40)], wanting: wanting({ hunger: 80 }) }),
    );
    expect(demand.lines.hunger.pressure).toBe(1);
  });

  it('counts no places at a venue that is shut, broken or out of reach', () => {
    const venues = [
      venueOf('cafe#0', ['hunger'], 10),
      venueOf('cafe#1', ['hunger'], 10),
      venueOf('cafe#2', ['hunger'], 10),
      venueOf('cafe#3', ['hunger'], 10),
    ];
    const demand = demandFor(
      factsOf({
        venues,
        wanting: wanting({ hunger: 10 }),
        closed: new Set(['cafe#0']),
        broken: new Map([['cafe#1', 5]]),
        unreachable: new Set(['cafe#2']),
      }),
    );
    expect(demand.lines.hunger.places).toBe(10);
    expect(demand.lines.hunger.pressure).toBe(0);
  });

  it('lifts a roomy line above zero once guests are turned away at the door', () => {
    const demand = demandFor(
      factsOf({
        venues: [venueOf('cafe#0', ['hunger'], 50)],
        wanting: wanting({ hunger: 5 }),
        balks: new Map([['cafe#0', 10]]),
        visits: new Map([['cafe#0', 30]]),
      }),
    );
    expect(demand.lines.hunger.turnedAway).toBe(0.25);
    expect(demand.lines.hunger.pressure).toBe(0.25);
  });

  it('counts a venue serving two needs towards both', () => {
    const demand = demandFor(factsOf({ venues: [venueOf('club#0', ['hunger', 'thirst'], 20)] }));
    expect(demand.lines.hunger.places).toBe(20);
    expect(demand.lines.thirst.places).toBe(20);
    expect(demand.lines.fun.places).toBe(0);
  });

  it('counts a place freed every two minutes as fifteen in the half hour', () => {
    const restrooms = venueOf('restrooms#0', ['hygiene'], 4, { min: 60, max: 180 });
    const demand = demandFor(factsOf({ venues: [restrooms], wanting: wanting({ hygiene: 87 }) }));
    expect(demand.lines.hygiene.places).toBe(60);
    expect(demand.lines.hygiene.pressure).toBeCloseTo(87 / 60 - 1);
  });

  it('adds the quick places and the slow ones together', () => {
    const venues = [
      venueOf('shower#0', ['hygiene'], 1, { min: 30, max: 90 }),
      venueOf('spa#0', ['hygiene'], 10),
    ];
    expect(demandFor(factsOf({ venues })).lines.hygiene.places).toBe(40);
  });

  it('ignores a venue that makes the need worse', () => {
    const tiring: Venue = {
      ...venueOf('court#0', ['fun'], 10),
      satisfies: [
        { need: 'fun', amount: 0.5 },
        { need: 'energy', amount: -0.2 },
      ],
    };
    expect(demandFor(factsOf({ venues: [tiring] })).lines.energy.places).toBe(0);
  });
});

describe('the demand for beds', () => {
  it('is full on a plot with no beds, even with nobody here', () => {
    const demand = demandFor(factsOf({ present: 0, bedsFree: 0, bedsTotal: 0 }));
    expect(demand.lines.beds.pressure).toBe(1);
  });

  it('sits below zero half full', () => {
    expect(demandFor(factsOf({ bedsFree: 50 })).lines.beds.pressure).toBe(-1);
    expect(demandFor(factsOf({ bedsFree: 30 })).lines.beds.pressure).toBeCloseTo(-0.2);
  });

  it('is full with every bed taken', () => {
    expect(demandFor(factsOf({ bedsFree: 0 })).lines.beds.pressure).toBe(1);
  });

  it('is lifted by guests with nowhere to sleep', () => {
    const demand = demandFor(factsOf({ bedsFree: 50, homeless: 40 }));
    expect(demand.lines.beds.turnedAway).toBe(0.4);
    expect(demand.lines.beds.pressure).toBe(0.4);
    expect(demand.lines.beds.wanting).toBe(90);
  });
});

describe('the loudest line of each group', () => {
  it('picks the line that is shouting', () => {
    const demand = demandFor(
      factsOf({
        venues: [venueOf('cafe#0', ['hunger'], 50), venueOf('bar#0', ['thirst'], 40)],
        wanting: wanting({ hunger: 5, thirst: 80 }),
      }),
    );
    expect(demand.groups.food).toBe('thirst');
  });

  it('picks the first line of the group on a tie', () => {
    const demand = demandFor(factsOf({ present: 0, bedsFree: 0, bedsTotal: 0 }));
    expect(demand.groups.stay).toBe('beds');
    expect(demand.groups.food).toBe('hunger');
    expect(demand.groups.care).toBe('hygiene');
  });
});
