import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { crowdSizeForOwned } from '../../crowd/domain/crowdSize';
import { stageKeysOf } from '../../events/domain/sites';
import { presentCount } from '../../guests/domain/guests';
import { ownedArea } from '../../land/domain/landRights';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { snapshotResort } from '../../sim/domain/resortState';
import { staffPool } from '../../sim/domain/staff';
import { NO_ZONE } from '../../sim/domain/zones';
import { plotFactsOf } from './plotFacts';
import { createSimState } from './simState';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const { placements, props, paths, rails, tilesX, tilesZ } = world;
const plot = {
  layout: { placements, props, paths, rails, tilesX, tilesZ },
  placements: [...placements],
  props: [...props],
  paths: [...paths],
  rails: [...rails],
};
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, plot.layout, new Map());
const population = crowdSizeForOwned(ownedArea(plan.land ?? null, plan));

const stateOf = (away: boolean) =>
  createSimState({
    plan,
    plot,
    shore,
    facts,
    population,
    away,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 8 * 60, tickOfDay: () => 8 * 60, weather: () => 'clear' },
  });

describe('createSimState on the reference resort', () => {
  const state = stateOf(false);

  it('sizes every per-guest list by the land, and the staff crowd by the pool', () => {
    expect(population).toBeGreaterThan(0);
    expect(state.guests.count).toBe(population);
    expect(state.crowd.crowd.count).toBe(population);
    expect(state.needs.level.hunger.length).toBe(population);
    expect(state.happiness.level.length).toBe(population);
    expect(state.thoughts.people).toBe(population);
    expect(state.staff.crowd.count).toBe(staffPool().count);
  });

  it('keeps everybody off the plot when the guests start away', () => {
    const away = stateOf(true);
    expect(presentCount(away.guests)).toBe(0);
    const offPlot = Array.from(away.crowd.crowd.offPlot.subarray(0, population));
    expect(offPlot.every((off) => off === 1)).toBe(true);
  });

  it('books the welcome meeting when a stage stands', () => {
    expect(stageKeysOf(state.venues).length).toBeGreaterThan(0);
    expect(state.events.programme.bookings.some((each) => each.builtIn === 'welcome')).toBe(true);
  });

  it('deals nobody a zone when none is painted', () => {
    expect(Array.from(state.zoneOf).every((zone) => zone === NO_ZONE)).toBe(true);
  });

  it('is what a save reads', () => {
    expect(snapshotResort(state).guests.count).toBe(population);
  });
});
