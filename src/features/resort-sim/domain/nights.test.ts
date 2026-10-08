import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { isOutTonight, markNightOwls, refreshDj, refreshNightOut } from './nights';
import { plotFactsOf } from './plotFacts';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import { createSimState, type SimState } from './simState';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

const freshState = (): SimState =>
  createSimState({
    plan,
    plot: { ...world, layout: world },
    shore,
    facts,
    population: 60,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const at = (hour: number): SimNow => {
  const ticks = TICKS_PER_DAY + hour * TICKS_PER_HOUR;
  return { ticks, day: 1, tickOfDay: ticks % TICKS_PER_DAY, weather: 'clear', forcedWeather: null };
};

const nightOf = (until: number, homeEarly: readonly number[] = []) => ({
  nightOutUntil: Int32Array.of(until),
  homeEarly: new Set(homeEarly),
});

describe('isOutTonight', () => {
  it('is out until the night ends, unless sent home early', () => {
    expect(isOutTonight(nightOf(100), 0, 99)).toBe(true);
    expect(isOutTonight(nightOf(100), 0, 100)).toBe(false);
    expect(isOutTonight(nightOf(-1), 0, 0)).toBe(false);
    expect(isOutTonight(nightOf(100, [0]), 0, 99)).toBe(false);
  });
});

describe('refreshNightOut', () => {
  it('sends some parties out while a late venue is open', () => {
    const state = freshState();
    refreshNightOut(state, at(18));
    expect(Array.from(state.nightOutUntil).some((until) => until > at(18).ticks)).toBe(true);
  });

  it('keeps everybody in when no late venue is open', () => {
    const state = freshState();
    state.breakdowns.broken.fill(1);
    refreshNightOut(state, at(18));
    expect(Array.from(state.nightOutUntil).every((until) => until === -1)).toBe(true);
  });
});

describe('markNightOwls', () => {
  it('counts nobody out before ten, and the waking ones out after', () => {
    const state = freshState();
    state.nightOutUntil.fill(at(30).ticks);
    markNightOwls(state, at(21));
    expect(state.nightOwls.size).toBe(0);
    markNightOwls(state, at(23));
    expect(state.nightOwls.size).toBeGreaterThan(0);
  });
});

describe('refreshDj', () => {
  it('plays where a DJ is open, and nowhere broken down', () => {
    const state = freshState();
    refreshDj(state, at(21));
    expect(state.djOn.length).toBe(state.venues.length);
    expect(state.djOn.some((on) => on === 1)).toBe(true);
    state.breakdowns.broken.fill(1);
    refreshDj(state, at(21));
    expect(state.djOn.every((on) => on === 0)).toBe(true);
  });
});
