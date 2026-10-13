import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { buildCostOf } from '../../catalog/domain/prices';
import { checkOutParty, createGuests } from '../../guests/domain/guests';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { conditionOf, durabilityOf } from '../../sim/domain/condition';
import { startDay } from '../../sim/domain/dayReport';
import { createLedger } from '../../sim/domain/ledger';
import { lodgingsOn } from '../../sim/domain/lodgings';
import { firstSeason } from '../../sim/domain/season';
import { venuesOn } from '../../sim/domain/venues';
import {
  ageBuildings,
  ageDays,
  cancelRenovation,
  carryAgeing,
  closedLodgings,
  conditionShown,
  renovate,
  renovateAll,
  renovationOf,
  RENOVATION_TICKS,
  shutUntil,
  stepRenovations,
  upkeepRows,
} from './ageing';

const world = referenceWorldOf(referenceJson);
const [lodging] = lodgingsOn(world.placements);
const [busy, idle] = venuesOn(world.placements);
const home = { key: lodging!.key, id: lodging!.id, label: lodging!.label, beds: lodging!.beds };

function stateOf(visits = new Map<string, number>()) {
  const guests = createGuests({ count: 8, homes: [home], variants: 2, childVariant: 1, seed: 3 });
  const turnedOut: number[] = [];
  return {
    ageing: true,
    venues: [busy!, idle!],
    lodgings: [lodging!],
    guests,
    homeOfLodging: Int32Array.of(0),
    today: startDay(3),
    condition: new Map<string, number>(),
    lastWear: new Map<string, number>(),
    renovating: new Map<string, number>(),
    closing: new Map<string, number>(),
    names: new Map<string, string>(),
    ledger: createLedger('sandbox', 0),
    season: null as ReturnType<typeof firstSeason> | null,
    turnedOut,
    router: { dayVisits: () => visits, turnOut: (venue: number) => turnedOut.push(venue) },
  };
}

const emptied = <T extends ReturnType<typeof stateOf>>(state: T): T => {
  for (let party = 0; party < state.guests.parties.length; party++) {
    checkOutParty(state.guests, party);
  }
  return state;
};

describe('ageBuildings', () => {
  it('wears a busy venue more than an idle one, each by its own durability', () => {
    const state = stateOf(new Map([[busy!.key, 10_000]]));
    ageBuildings(state, 4);
    const lost = (key: string) => 1 - conditionOf(state.condition, key);
    expect(lost(busy!.key)).toBeCloseTo(0.011 * durabilityOf(busy!.key));
    expect(lost(idle!.key)).toBeCloseTo(0.002 * durabilityOf(idle!.key));
    expect(state.condition.has(lodging!.key)).toBe(true);
  });

  it('wears nothing on the first check-in of a resort built that morning, or one that never ages', () => {
    const fresh = stateOf();
    ageBuildings(fresh, 3);
    expect(fresh.condition.size).toBe(0);
    const ageless = { ...stateOf(), ageing: false };
    ageBuildings(ageless, 4);
    expect(ageless.condition.size).toBe(0);
  });
});

describe('ageDays', () => {
  it("repeats the last check-in's wear for each day, each building its own", () => {
    const state = stateOf(new Map([[busy!.key, 10_000]]));
    ageBuildings(state, 4);
    const day = new Map(state.condition);
    ageDays(state, 7);
    for (const [key, level] of day) {
      expect(conditionOf(state.condition, key)).toBeCloseTo(1 - 8 * (1 - level));
    }
  });

  it("reads today's use before the first check-in, and does nothing where nothing ages", () => {
    const state = stateOf(new Map([[busy!.key, 10_000]]));
    expect(ageDays(state, 28)).toBe(true);
    expect(conditionOf(state.condition, busy!.key)).toBeCloseTo(
      1 - 28 * 0.011 * durabilityOf(busy!.key),
    );
    const ageless = { ...stateOf(), ageing: false };
    expect(ageDays(ageless, 28)).toBe(false);
    expect(ageless.condition.size).toBe(0);
  });
});

describe('carryAgeing', () => {
  it('forgets the wear and the works of a building that was pulled down', () => {
    const state = stateOf();
    state.condition = new Map([
      [busy!.key, 0.3],
      ['gone#0', 0.2],
    ]);
    state.renovating = new Map([['gone#0', 900]]);
    state.closing = new Map([['gone#1', 400]]);
    carryAgeing(state);
    expect([...state.condition]).toEqual([[busy!.key, 0.3]]);
    expect(state.renovating.size).toBe(0);
    expect(state.closing.size).toBe(0);
  });
});

describe('renovate', () => {
  it('charges for the wear, makes a venue as new and shuts it for six hours', () => {
    const state = stateOf();
    state.condition = new Map([[busy!.key, 0]]);
    expect(renovate(state, busy!.key, 1_000).kind).toBe('renovated');
    expect(state.ledger.today.renovate).toBe(-Math.round(buildCostOf(busy!.id) / 2));
    expect(conditionOf(state.condition, busy!.key)).toBe(1);
    expect(shutUntil(state, busy!.key, 1_000)).toBe(1_000 + RENOVATION_TICKS);
    expect(conditionShown(state, busy!.key, 1_060)?.works).toEqual({
      kind: 'renovating',
      from: 1_000,
      until: 1_000 + RENOVATION_TICKS,
    });
    stepRenovations(state, 1_000 + RENOVATION_TICKS);
    expect(state.renovating.size).toBe(0);
  });

  it('turns everybody out of a venue as its works start, and out of nothing in a break', () => {
    const state = stateOf();
    state.condition = new Map([[idle!.key, 0]]);
    renovate(state, idle!.key, 0);
    expect(state.turnedOut).toEqual([1]);

    const between = stateOf();
    between.condition = new Map([[idle!.key, 0]]);
    between.season = { ...firstSeason(0), state: 'break' };
    expect(renovate(between, idle!.key, 0).kind).toBe('renovated');
    expect(between.turnedOut).toEqual([]);
  });

  it('closes a lodging with guests in it, and starts once the last of them has gone', () => {
    const state = stateOf();
    state.condition = new Map([[lodging!.key, 0.3]]);
    expect(renovate(state, lodging!.key, 100).kind).toBe('closing');
    expect(state.ledger.today.renovate).toBeLessThan(0);
    expect(conditionOf(state.condition, lodging!.key)).toBe(0.3);
    expect(closedLodgings(state).has(lodging!.key)).toBe(true);
    expect(conditionShown(state, lodging!.key, 100)?.works?.kind).toBe('closing');
    stepRenovations(state, 160);
    expect(state.closing.has(lodging!.key)).toBe(true);

    stepRenovations(emptied(state), 220);
    expect(state.closing.size).toBe(0);
    expect(conditionOf(state.condition, lodging!.key)).toBe(1);
    expect(shutUntil(state, lodging!.key, 220)).toBe(220 + RENOVATION_TICKS);
  });

  it('starts on an empty lodging at once, and shuts nothing in a break', () => {
    const state = emptied(stateOf());
    state.condition = new Map([
      [lodging!.key, 0.5],
      [busy!.key, 0.5],
    ]);
    state.season = { ...firstSeason(0), state: 'break' };
    expect(renovate(state, lodging!.key, 0).kind).toBe('renovated');
    expect(renovate(state, busy!.key, 0).kind).toBe('renovated');
    expect(state.renovating.size).toBe(0);
  });

  it('gives the money back for a lodging still waiting for its guests to leave, and only then', () => {
    const state = stateOf();
    state.condition = new Map([
      [lodging!.key, 0.3],
      [busy!.key, 0.3],
    ]);
    renovate(state, lodging!.key, 0);
    expect(cancelRenovation(state, lodging!.key)).toBe(true);
    expect(state.ledger.today.renovate).toBe(0);
    expect(state.closing.size).toBe(0);
    renovate(state, busy!.key, 0);
    expect(cancelRenovation(state, busy!.key)).toBe(false);
  });

  it('refuses what it cannot afford in tycoon, and what is nearly new, under way or no building', () => {
    const poor = { ...stateOf(), ledger: createLedger('tycoon', 5) };
    poor.condition = new Map([[busy!.key, 0]]);
    expect(renovate(poor, busy!.key, 0)).toEqual({
      kind: 'unaffordable',
      cost: renovationOf(poor, busy!.key)!.cost,
    });
    expect(poor.ledger.balance).toBe(5);
    const state = stateOf();
    expect(renovationOf(state, busy!.key)?.cost).toBeNull();
    expect(renovate(state, busy!.key, 0).kind).toBe('refused');
    expect(renovate(state, 'path#0', 0).kind).toBe('refused');
    state.condition = new Map([[lodging!.key, 0.3]]);
    renovate(state, lodging!.key, 0);
    expect(renovate(state, lodging!.key, 0).kind).toBe('refused');
  });
});

describe('upkeepRows', () => {
  it('lists every lodging and venue, the most worn first, by its name', () => {
    const state = stateOf();
    state.condition = new Map([
      [idle!.key, 0.2],
      [lodging!.key, 0.6],
    ]);
    state.names = new Map([[idle!.key, 'The Anchor']]);
    const rows = upkeepRows(state, 0);
    expect(rows.map((row) => row.key)).toEqual([idle!.key, lodging!.key, busy!.key]);
    expect(rows[0]).toMatchObject({ label: 'The Anchor', lodging: false, level: 0.2 });
    expect(rows[1]!.lodging).toBe(true);
    expect(rows[2]!.cost).toBeNull();
  });
});

describe('renovateAll', () => {
  it('renovates each in turn and stops at the first the balance cannot pay for', () => {
    const worn = new Map([
      [busy!.key, 0],
      [idle!.key, 0],
    ]);
    const first = renovationOf({ ...stateOf(), condition: worn }, busy!.key)!.cost!;
    const poor = { ...stateOf(), ledger: createLedger('tycoon', first + 1), condition: worn };
    expect(renovateAll(poor, [busy!.key, idle!.key], 0)).toEqual({
      started: true,
      unaffordable: renovationOf(poor, idle!.key)!.cost,
    });
    expect(poor.renovating.has(busy!.key)).toBe(true);
    expect(poor.renovating.has(idle!.key)).toBe(false);
  });

  it('skips what it refuses and says when nothing started', () => {
    const state = stateOf();
    expect(renovateAll(state, [busy!.key, 'path#0'], 0)).toEqual({
      started: false,
      unaffordable: null,
    });
  });
});
