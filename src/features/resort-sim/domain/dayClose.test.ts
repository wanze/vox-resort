import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { buildCostOf, nightPriceOf, priceOf } from '../../catalog/domain/prices';
import { createEvents } from '../../events/domain/eventRuns';
import { createGuests, presentCount } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { countArrivals, startDay } from '../../sim/domain/dayReport';
import { createHappiness } from '../../sim/domain/happiness';
import { createLedger } from '../../sim/domain/ledger';
import { lodgingsOn } from '../../sim/domain/lodgings';
import { ratingFor } from '../../sim/domain/rating';
import { wagesFor } from '../../sim/domain/staff';
import { maintenanceFor } from '../../sim/domain/takings';
import { createDay } from '../../sim/domain/thoughts';
import { createUpkeep } from '../../sim/domain/upkeep';
import { venuesOn } from '../../sim/domain/venues';
import { closeTheDay, paidShareFor, payTheBills, rateTheDay, type DayCloseState } from './dayClose';

const world = referenceWorldOf(referenceJson);
const [lodging] = lodgingsOn(world.placements);
const placed = world.placements.filter((placement) => placement.key === lodging!.key);
const venues = venuesOn(world.placements).slice(0, 4);
const home = { key: lodging!.key, id: lodging!.id, label: lodging!.label, beds: 4 };
const ROSTER = { cleaner: 2, lifeguard: 1, animator: 1, mechanic: 0 };

// The whole plot at full scenery, so a standing lodging is priced above its bare rate.
const fullScenery = { tilesX: 256, tilesZ: 256, value: new Float32Array(256 * 256).fill(1) };

function stateOf(overrides: Partial<DayCloseState> = {}): DayCloseState {
  const guests = createGuests({ count: 8, homes: [home], variants: 2, childVariant: 1, seed: 3 });
  return {
    plot: { placements: placed, props: world.props.slice(0, 3) },
    ledger: createLedger('sandbox', 0),
    roster: ROSTER,
    takings: new Map(),
    guests,
    lodgings: [lodging!],
    scenery: fullScenery,
    happiness: createHappiness(guests.count),
    upkeep: createUpkeep(venues.length),
    venues,
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    today: startDay(0),
    history: [],
    beds: { total: 4, taken: 4 },
    thoughtDay: createDay(),
    events: createEvents(guests.count),
    ...overrides,
  };
}

const housedOf = (state: DayCloseState): number =>
  Array.from(state.guests.home).filter(
    (each, person) => each !== NO_HOME && state.guests.present[person] === 1,
  ).length;

describe('payTheBills', () => {
  it('closes the day on the wages and the maintenance, and bills tonight into the new one', () => {
    const state = stateOf();
    payTheBills(state);
    const standing = [...state.plot.placements, ...state.plot.props];
    expect(state.ledger.yesterday.wages).toBe(-wagesFor(ROSTER));
    expect(state.ledger.yesterday.maintenance).toBe(
      -maintenanceFor(standing.map((placement) => buildCostOf(placement.id))),
    );
    expect(housedOf(state)).toBeGreaterThan(0);
    expect(state.ledger.today.night).toBeGreaterThan(0);
    expect(state.takings.get(home.key)).toBe(state.ledger.today.night);
  });

  it('prices a night by the setting of a lodging that stands, and bare where it is gone', () => {
    const standing = stateOf();
    payTheBills(standing);
    const gone = stateOf({ lodgings: [] });
    payTheBills(gone);
    const housed = housedOf(standing);
    expect(nightPriceOf(home.id, 1)).toBeGreaterThan(priceOf(home.id));
    expect(standing.ledger.today.night).toBe(housed * nightPriceOf(home.id, 1));
    expect(gone.ledger.today.night).toBe(housed * priceOf(home.id));
  });

  it('reads the share of the list price a bed is charged at, 1 where it is bare', () => {
    expect(paidShareFor(stateOf(), 0)).toBeCloseTo(nightPriceOf(home.id, 1) / priceOf(home.id));
    expect(paidShareFor(stateOf(), 0)).toBeGreaterThan(1);
    expect(paidShareFor(stateOf({ lodgings: [] }), 0)).toBe(1);
  });
});

describe('rateTheDay', () => {
  it('gives fewer stars for dirty venues than for clean ones, all else equal', () => {
    const clean = stateOf();
    rateTheDay(clean);
    const dirty = stateOf();
    dirty.upkeep.level.fill(0);
    rateTheDay(dirty);
    expect(presentCount(clean.guests)).toBeGreaterThan(0);
    expect(dirty.rating.cleanliness).toBe(0);
    expect(dirty.rating.stars).toBeLessThan(clean.rating.stars);
  });
});

describe('closeTheDay', () => {
  it('only restarts the counts on the day they started', () => {
    const state = stateOf({ today: countArrivals(startDay(3), 2) });
    closeTheDay(state, 3);
    expect(state.history).toEqual([]);
    expect(state.today).toEqual(startDay(3));
  });

  it('keeps a report of the day before on a later one', () => {
    const state = stateOf({ today: startDay(3) });
    closeTheDay(state, 4);
    expect(state.history.map((day) => day.day)).toEqual([3]);
    expect(state.today).toEqual(startDay(4));
  });

  it('notes a missed welcome when guests arrived and none was held', () => {
    const state = stateOf({ venues: [], today: countArrivals(startDay(3), 2) });
    closeTheDay(state, 4);
    expect(state.history[0]!.welcome).toEqual({ welcomed: 0, gap: 'no-stage' });
  });

  it('notes nothing when nobody arrived', () => {
    const state = stateOf({ venues: [], today: startDay(3) });
    closeTheDay(state, 4);
    expect(state.history[0]!.welcome).toBeUndefined();
  });
});
