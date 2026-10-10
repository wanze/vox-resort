import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import { ownedBounds } from '../../land/domain/landRights';
import { beachTilesOf, shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { AUTO_HIRING, rosterFor, workplacesOf } from '../../sim/domain/staff';
import { NO_ZONE, paintZone } from '../../sim/domain/zones';
import { takeOffPlot } from '../../crowd/domain/crowd';
import type { SimNow } from './simNow';
import { plotFactsOf } from './plotFacts';
import { createSimState, type SimState } from './simState';
import {
  beachTilesFor,
  keepStaffHours,
  knowPaving,
  litterWindowOf,
  offTonight,
  pavingIndexOf,
  rezone,
  rosterNow,
  staffTheResort,
} from './staffing';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const plot = { ...world, layout: world };
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

const freshState = (): SimState =>
  createSimState({
    plan,
    plot,
    shore,
    facts,
    population: 60,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const onPlot = (state: SimState): number =>
  Array.from(state.staff.crowd.offPlot.subarray(0, state.staffPool.count)).filter(
    (off) => off === 0,
  ).length;

describe('pavingIndexOf', () => {
  it('finds the index a build already made, and makes one for a graph it has not seen', () => {
    knowPaving(facts);
    expect(pavingIndexOf(facts.network)).toBe(facts.paving);
    const bare = walkNetworkFor({
      paved: [],
      levelOf: () => 0,
      shore: null,
      tilesX: 4,
      span: { from: 0, to: 4 },
    });
    expect(pavingIndexOf(bare)).toBe(pavingIndexOf(bare));
  });
});

describe('beachTilesFor', () => {
  it('sweeps a shore once and an inland plot not at all', () => {
    expect(beachTilesFor(null)).toEqual([]);
    const tiles = beachTilesFor(shore);
    expect(tiles.length).toBe(beachTilesOf(shore).length);
    expect(beachTilesFor(shore)).toBe(tiles);
  });
});

describe('litterWindowOf', () => {
  it('is the owned land, or nothing on a plot that owns all of itself', () => {
    const state = freshState();
    expect(state.rights).not.toBeNull();
    expect(litterWindowOf(state)).toEqual(ownedBounds(state.rights!, plan));
    expect(litterWindowOf({ rights: null, plan })).toBeUndefined();
  });
});

describe('rezone', () => {
  it('deals nobody a zone while none is painted', () => {
    const state = freshState();
    rezone(state);
    expect(Array.from(state.zoneOf).every((zone) => zone === NO_ZONE)).toBe(true);
    expect(Array.from(state.venueZones).every((mask) => mask === 0)).toBe(true);
  });

  it('deals the zone painted over the whole plot', () => {
    const state = freshState();
    for (let tileZ = 0; tileZ < plan.tilesZ; tileZ++) {
      for (let tileX = 0; tileX < plan.tilesX; tileX++) paintZone(state.zones, tileX, tileZ, 0);
    }
    rezone(state);
    const onDuty = Array.from(state.zoneOf).filter((_, worker) => state.duty[worker] === 1);
    expect(onDuty.length).toBeGreaterThan(0);
    expect(onDuty.every((zone) => zone === 0)).toBe(true);
    expect(Array.from(state.venueZones).some((mask) => mask !== 0)).toBe(true);
  });
});

describe('rosterNow', () => {
  it('follows the venues standing', () => {
    const state = freshState();
    const { posts } = state.staff.crowd.network;
    expect(rosterNow(state).recommended).toEqual(
      rosterFor(workplacesOf(state.venues, posts, state.lodgings)),
    );
    state.venues = [];
    expect(rosterNow(state).recommended).toEqual(
      rosterFor(workplacesOf([], posts, state.lodgings)),
    );
  });
});

describe('staffTheResort', () => {
  it('clocks the roster on and the rest off', () => {
    const state = freshState();
    const onDuty = (): number => state.duty.reduce((sum, each) => sum + each, 0);
    expect(onPlot(state)).toBe(onDuty());
    state.hiring = { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 };
    staffTheResort(state);
    expect(onDuty()).toBe(0);
    state.hiring = AUTO_HIRING;
    staffTheResort(state);
    expect(onDuty()).toBeGreaterThan(0);
    expect(onPlot(state)).toBe(onDuty());
  });
});

const HOUR = 60;

const at = (tickOfDay: number): SimNow => ({
  ticks: 1440 + tickOfDay,
  day: 1,
  tickOfDay,
  weather: 'clear',
  forcedWeather: null,
});

const count = (column: Uint8Array): number => column.reduce((sum, each) => sum + each, 0);

const ofRole = (state: SimState, role: string, column: Uint8Array): number =>
  state.staffPool.role.filter((each, worker) => each === role && column[worker] === 1).length;

const walkedHome = (state: SimState): void => {
  const workers = state.staff.crowd;
  for (let worker = 0; worker < state.staffPool.count; worker++) {
    if (state.staffOff[worker] !== 1) continue;
    takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
  }
};

describe('keepStaffHours', () => {
  it('keeps everybody on through the day', () => {
    const state = freshState();
    keepStaffHours(state, at(20 * HOUR));
    expect(count(state.staffOff)).toBe(0);
    expect(state.onShift).toEqual(state.duty);
  });

  // The reference resort's night club keeps its hours until two.
  it('lets the lifeguards go first while the club keeps the rest', () => {
    const state = freshState();
    keepStaffHours(state, at(23 * HOUR));
    expect(ofRole(state, 'lifeguard', state.staffOff)).toBe(state.roster.lifeguard);
    expect(ofRole(state, 'cleaner', state.staffOff)).toBe(0);
    expect(offTonight(state, 'lifeguard')).toBe(true);
    expect(offTonight(state, 'cleaner')).toBe(false);
    keepStaffHours(state, at(3 * HOUR));
    expect(count(state.onShift)).toBe(0);
    expect(count(state.duty), 'the roster is the same').toBeGreaterThan(0);
  });

  it('walks them home as a worker taken off the roster walks', () => {
    const state = freshState();
    keepStaffHours(state, at(3 * HOUR));
    const lifeguard = state.staffPool.role.indexOf('lifeguard');
    expect(state.staffRouter.taskOf(lifeguard).kind).toBe('home');
  });

  it('keeps them home through an edit and brings them back at five', () => {
    const state = freshState();
    keepStaffHours(state, at(3 * HOUR));
    walkedHome(state);
    expect(onPlot(state)).toBe(0);
    staffTheResort(state);
    expect(onPlot(state)).toBe(0);
    keepStaffHours(state, at(4 * HOUR + 59));
    expect(onPlot(state)).toBe(0);
    keepStaffHours(state, at(5 * HOUR));
    expect(count(state.staffOff)).toBe(0);
    expect(onPlot(state)).toBe(count(state.duty));
  });

  it('keeps the crew while an event is on or due', () => {
    const state = freshState();
    state.events.runs = [{} as (typeof state.events.runs)[number]];
    keepStaffHours(state, at(3 * HOUR));
    expect(ofRole(state, 'cleaner', state.onShift)).toBe(state.roster.cleaner);
    expect(ofRole(state, 'lifeguard', state.onShift)).toBe(0);
  });
});
