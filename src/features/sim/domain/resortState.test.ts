import { describe, expect, it } from 'vitest';
import { createBreakdowns } from './breakdowns';
import {
  countArrivals,
  countPhoto,
  countReview,
  HISTORY_DAYS,
  reportOf,
  startDay,
} from './dayReport';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { createRandom } from '../../layout/domain/random';
import { createFootfall } from '../../overlays/domain/overlays';
import { createHappiness } from './happiness';
import { createLedger, record } from './ledger';
import { createCarrying, createLitter } from './litter';
import { createNeeds } from './needs';
import { createPhotos, NEVER, notePhoto } from './photos';
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
    names: new Map(),
    footfall: createFootfall(9),
    reviews: [],
    today: startDay(0),
    history: [],
    rating: ratingFor({ happiness: null, present: 0, housed: 0 }),
    ledger: createLedger('sandbox', 0),
    arrivalsPlanned: 0,
    arrivalsAdmitted: 0,
    arrivals: createRandom(8),
    open: true,
    beds: { total: 30, taken: 0 },
    hiring: AUTO_HIRING,
    zones: createZones(6, 5),
    photos: createPhotos(40, 9),
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
  state.names = new Map([['bar#0', 'The Anchor']]);
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

function reportedOn(state: ResortState, day: number) {
  return reportOf({
    counts: countReview(countArrivals(startDay(day), 6), 4),
    rating: state.rating,
    present: 22,
    beds: state.beds,
    ledger: state.ledger,
    thoughts: state.thoughtDay,
  });
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

  it('keeps the day counts and the reports of the days before', () => {
    const state = played();
    state.history = [reportedOn(state, 3), reportedOn(state, 4)];
    state.today = countArrivals(startDay(5), 2);
    const saved = snapshotResort(state);
    const fresh = stateFor(9);
    restoreResort(fresh, saved);
    expect(fresh.history).toEqual(state.history);
    expect(fresh.today).toEqual({ from: 5, arrived: 2, left: 0, reviews: 0, reviewStars: 0 });
    expect(resortSnapshotSchema.safeParse(saved).success).toBe(true);
  });

  it('refuses a history longer than the days it keeps', () => {
    const state = played();
    state.history = Array.from({ length: HISTORY_DAYS + 1 }, (_, day) => reportedOn(state, day));
    expect(resortSnapshotSchema.safeParse(snapshotResort(state)).success).toBe(false);
  });

  it('reads a save from before events with no events column and no events counted', () => {
    const saved = snapshotResort(played());
    const { events: _today, ...today } = saved.ledger.today;
    const parsed = resortSnapshotSchema.parse({ ...saved, ledger: { ...saved.ledger, today } });
    expect(parsed.ledger.today.events).toBe(0);
    expect(parsed.today.events).toBeUndefined();
  });

  it('reads a day with fireworks and one from before them', () => {
    const state = played();
    const tally = { held: 1, audience: 80, called: 0, fireworks: 1, postponed: 1 };
    state.today = { ...state.today, events: tally };
    state.history = [{ ...reportedOn(state, 1), events: { held: 2, audience: 9, called: 0 } }];
    const parsed = resortSnapshotSchema.parse(snapshotResort(state));
    expect(parsed.today.events).toEqual(tally);
    expect(parsed.history[0]!.events?.fireworks ?? 0).toBe(0);
  });

  it('reads a day with a welcome and one from before it', () => {
    const state = played();
    state.today = { ...state.today, welcome: { welcomed: 7, gap: null } };
    state.history = [{ ...reportedOn(state, 1), welcome: { welcomed: 0, gap: 'no-stage' } }];
    const saved = snapshotResort(state);
    expect(resortSnapshotSchema.parse(saved).history[0]!.welcome?.gap).toBe('no-stage');
    expect(resortSnapshotSchema.parse(saved).today.welcome?.welcomed).toBe(7);
    const { welcome: _welcome, ...before } = saved.today;
    expect(resortSnapshotSchema.parse({ ...saved, today: before }).today.welcome).toBeUndefined();
  });

  it('refuses litter saved as a plain list', () => {
    const saved = snapshotResort(played());
    expect(resortSnapshotSchema.safeParse({ ...saved, litter: [...saved.litter] }).success).toBe(
      false,
    );
  });

  it("keeps the photo times, the heat and the day's photos through a save", () => {
    const state = played();
    notePhoto(state.photos, 4, 2, 600);
    const shot = { key: 'sunset@1,2', subject: 'Sunset', kind: 'sunset' as const, x: 8, y: 2 };
    state.today = countPhoto(state.today, { ...shot, z: 9, heading: 1, minute: 1260 });
    state.history = [{ ...reportedOn(state, 1), photos: state.today.photos! }];
    const saved = snapshotResort(state);
    expect(resortSnapshotSchema.safeParse(saved).success).toBe(true);
    const fresh = stateFor(9);
    restoreResort(fresh, saved);
    expect(fresh.photos.lastAt[4]).toBe(600);
    expect(fresh.photos.heat[2]).toBe(1);
    expect(fresh.today.photos).toEqual(state.today.photos);
    expect(fresh.history[0]!.photos).toEqual(state.today.photos);
  });

  it("keeps a photo's framing through a save, and reads a spot saved without one", () => {
    const state = played();
    const shot = { key: 'sea@1,2', subject: 'Sea', kind: 'sea' as const, x: 8, y: 2, z: 9 };
    state.today = countPhoto(state.today, { ...shot, heading: 1, minute: 600, fov: 52, tilt: 0 });
    const saved = snapshotResort(state);
    const fresh = stateFor(9);
    restoreResort(fresh, resortSnapshotSchema.parse(saved));
    expect(fresh.today.photos!.spots[0]).toMatchObject({ fov: 52, tilt: 0 });
    const { fov: _fov, tilt: _tilt, ...plain } = saved.today.photos!.spots[0]!;
    const before = { ...saved, today: { ...saved.today, photos: { taken: 1, spots: [plain] } } };
    const parsed = resortSnapshotSchema.parse(before).today.photos!.spots[0]!;
    expect('fov' in parsed || 'tilt' in parsed).toBe(false);
  });

  it('restores a save from before photos with nobody having taken one', () => {
    const state = played();
    notePhoto(state.photos, 4, 2, 600);
    const { photos: _photos, ...before } = snapshotResort(state);
    const fresh = stateFor(9);
    notePhoto(fresh.photos, 1, 3, 90);
    restoreResort(fresh, resortSnapshotSchema.parse(before));
    expect(fresh.photos.lastAt.every((at) => at === NEVER)).toBe(true);
    expect(fresh.photos.heat.every((heat) => heat === 0)).toBe(true);
    expect(fresh.today.photos).toBeUndefined();
  });

  it('keeps what each guest expects, and reads a save from before expectations as easy-going', () => {
    const state = played();
    state.happiness.expects[2] = 0.6;
    const saved = snapshotResort(state);
    const fresh = stateFor(9);
    restoreResort(fresh, resortSnapshotSchema.parse(saved));
    expect(fresh.happiness.expects[2]).toBeCloseTo(0.6);

    const { expects: _expects, ...happiness } = saved.happiness;
    restoreResort(fresh, resortSnapshotSchema.parse({ ...saved, happiness }));
    expect(fresh.happiness.expects.every((expects) => expects === 0)).toBe(true);
  });
});
