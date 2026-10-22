import { describe, expect, it, vi } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { lodgingNuisanceFor } from '../../sim/domain/nuisance';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  isOutTonight,
  listenInTheNight,
  markNightOwls,
  refreshDj,
  refreshNightOut,
  settleTheNight,
} from './nights';
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

describe('a night beside the club', () => {
  const SLEEPER = 0;
  const club = facts.venues.findIndex((venue) => venue.id === 'night-club-b');

  // The sleeper's lodging moved against the club and every other lodging far off, so the case
  // does not hang on where the reference resort put them.
  function besideTheClub(asleep: boolean) {
    const state = freshState();
    const lodging = state.lodgingOfHome[state.guests.home[SLEEPER]!]!;
    const { tileX, tileZ, tilesX } = state.venues[club]!;
    state.lodgingNuisance = lodgingNuisanceFor(
      state.lodgings.map((each, index) =>
        index === lodging
          ? { ...each, tileX: tileX + tilesX, tileZ }
          : { ...each, tileX: -100, tileZ: -100 },
      ),
      state.venues,
    );
    vi.spyOn(state.router, 'isAsleep').mockImplementation((person) => asleep && person === SLEEPER);
    vi.spyOn(state.router, 'asleepCount', 'get').mockReturnValue(asleep ? 1 : 0);
    return { state, lodging };
  }

  const packed = (state: SimState) =>
    vi
      .spyOn(state.router, 'occupantsAt')
      .mockImplementation((venue) => (venue === club ? state.venues[club]!.capacity : 0));

  it('keeps a sleeper beside a full club awake, and one beside a shut club not', () => {
    const { state } = besideTheClub(true);
    packed(state);
    listenInTheNight(state, 1);
    expect(state.nightNoise.heard[SLEEPER]).toBeCloseTo(0.8);
    expect(state.nightNoise.heard.filter((heard) => heard > 0).length).toBe(1);
    const shut = besideTheClub(true).state;
    listenInTheNight(shut, 1);
    expect(shut.nightNoise.heard[SLEEPER]).toBe(0);
  });

  it('hears nothing on a paused frame or with nobody asleep', () => {
    const { state } = besideTheClub(true);
    packed(state);
    listenInTheNight(state, 0);
    expect(state.nightNoise.heard[SLEEPER]).toBe(0);
    const awake = besideTheClub(false).state;
    packed(awake);
    listenInTheNight(awake, 1);
    expect(awake.nightNoise.heard.every((heard) => heard === 0)).toBe(true);
  });

  it('names the club in the morning, by the lodging', () => {
    const { state, lodging } = besideTheClub(true);
    packed(state);
    for (let hour = 0; hour < 4; hour++) listenInTheNight(state, 1);
    settleTheNight(state);
    const night = state.lastNightNoise.get(state.lodgings[lodging]!.key)!;
    expect(night.from).toBe(state.venues[club]!.label);
    expect(night.kind).toBe('noise');
    expect(night.woken).toBeGreaterThanOrEqual(1);
    expect(night.felt).toBeGreaterThan(0);
    expect(state.lastNightNoise.size).toBe(1);
  });
});
