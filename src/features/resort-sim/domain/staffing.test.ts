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
import { plotFactsOf } from './plotFacts';
import { createSimState, type SimState } from './simState';
import {
  beachTilesFor,
  knowPaving,
  litterWindowOf,
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
