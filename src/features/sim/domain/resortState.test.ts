import { describe, expect, it } from 'vitest';
import { createBreakdowns } from './breakdowns';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { createRandom } from '../../layout/domain/random';
import { createFootfall } from '../../overlays/domain/overlays';
import { createHappiness } from './happiness';
import { createLedger, record } from './ledger';
import { createCarrying, createLitter } from './litter';
import { createNeeds } from './needs';
import { ratingFor } from './rating';
import { resortSnapshotSchema } from './resortSnapshot';
import { restoreResort, snapshotResort, type ResortState } from './resortState';
import { AUTO_HIRING, hire } from './staff';
import { earn } from './takings';
import { createDay, createThoughts, tallyInto, think } from './thoughts';
import { createUpkeep } from './upkeep';
import { createZones, paintZone, zoneAt } from './zones';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 30 }];
const VENUES = [{ key: 'bar#0' }, { key: 'pool#0' }];

function stateFor(seed: number): ResortState {
  const guests = createGuests({ count: 40, homes: HOMES, variants: 4, childVariant: 3, seed });
  return {
    guests,
    needs: createNeeds(guests, seed),
    happiness: createHappiness(40),
    thoughts: createThoughts(40),
    thoughtDay: createDay(),
    carrying: createCarrying(40),
    litter: createLitter(6, 5),
    upkeep: createUpkeep(VENUES.length),
    breakdowns: createBreakdowns(VENUES.length),
    venues: VENUES,
    takings: new Map(),
    footfall: createFootfall(9),
    reviews: [],
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    ledger: createLedger('sandbox', 0),
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    arrivals: createRandom(8),
    open: true,
    beds: { total: 30, taken: 0 },
    hiring: AUTO_HIRING,
    zones: createZones(6, 5),
  };
}

function played(): ResortState {
  const state = stateFor(5);
  state.needs.level.hunger[1] = 0.1;
  state.needs.level.health[3] = 0.35;
  state.happiness.level[2] = 0.3;
  think(state.thoughts, 3, 'filthy', 'Bar', 77);
  tallyInto(state.thoughtDay, 'filthy', 'Bar');
  state.carrying.nodes[4] = 5;
  state.litter.level[7] = 0.75;
  state.upkeep.level[1] = 0.4;
  state.breakdowns.broken[1] = 1;
  state.breakdowns.since[1] = 300;
  state.breakdowns.worn[1] = 40;
  earn(state.takings, 'bar#0', 120);
  state.footfall.seen[2] = 11;
  state.footfall.mood[2] = 6.5;
  state.reviews = [
    {
      party: 2,
      family: 'Meier',
      partyKind: 'couple',
      name: 'Anna',
      nights: 4,
      stars: 4,
      complaint: 'filthy',
      praise: null,
      subject: 'Bar',
    },
  ];
  state.rating = { stars: 3.5, happiness: 0.6, housed: 0.9, cleanliness: 0.8 };
  state.ledger = record(createLedger('tycoon', 8000), 'visit', 35);
  state.arrivalsPlanned = 12;
  state.arrivalsAdmitted = 5;
  state.arrivals();
  state.arrivals();
  state.open = false;
  state.beds = { total: 30, taken: 18 };
  return state;
}

describe('snapshotResort', () => {
  it('restores into a fresh resort so that it snapshots the same again', () => {
    const saved = snapshotResort(played());
    const fresh = stateFor(9);
    restoreResort(fresh, saved);
    expect(snapshotResort(fresh)).toEqual(saved);
    expect(resortSnapshotSchema.safeParse(saved).success).toBe(true);
  });

  it('carries the arrivals stream on where it was', () => {
    const state = played();
    const fresh = stateFor(9);
    restoreResort(fresh, snapshotResort(state));
    expect(fresh.arrivals()).toBe(state.arrivals());
  });

  it('bumps the litter version, so the drawing picks up the restored pieces', () => {
    const fresh = stateFor(9);
    restoreResort(fresh, snapshotResort(played()));
    expect(fresh.litter.version).toBe(1);
  });

  it('keeps a painted zone, and bumps the version so the staff are dealt afresh', () => {
    const state = played();
    paintZone(state.zones, 4, 3, 2);
    const fresh = stateFor(9);
    const grid = fresh.zones.zone;
    restoreResort(fresh, snapshotResort(state));
    expect(zoneAt(fresh.zones, 4, 3)).toBe(2);
    expect(fresh.zones.zone, 'the grid was replaced').toBe(grid);
    expect(fresh.zones.version).toBe(1);
  });

  it('keeps a hand-set role through a save', () => {
    const state = played();
    state.hiring = hire(AUTO_HIRING, 'cleaner', 3);
    const fresh = stateFor(9);
    restoreResort(fresh, snapshotResort(state));
    expect(fresh.hiring).toEqual({ ...AUTO_HIRING, cleaner: 3 });
  });

  it('keeps every role on Auto through a save', () => {
    const fresh = stateFor(9);
    fresh.hiring = hire(AUTO_HIRING, 'mechanic', 2);
    restoreResort(fresh, snapshotResort(played()));
    expect(fresh.hiring).toEqual(AUTO_HIRING);
  });

  it('refuses litter saved as a plain list', () => {
    const saved = snapshotResort(played());
    expect(resortSnapshotSchema.safeParse({ ...saved, litter: [...saved.litter] }).success).toBe(
      false,
    );
  });
});
