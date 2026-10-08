import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import type { EventStep } from '../../events/domain/eventRuns';
import { heldAt } from '../../events/domain/sites';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { weatherOn } from '../../sim/domain/weather';
import {
  beachIndexOf,
  refreshEventVenues,
  refreshInvited,
  runEvents,
  runningShowOf,
  WEATHER_SEED,
  weatherOnDay,
} from './eventSteps';
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

const nowAt = (ticks: number): SimNow => ({
  ticks,
  day: Math.floor(ticks / TICKS_PER_DAY),
  tickOfDay: ticks % TICKS_PER_DAY,
  weather: 'clear',
  forcedWeather: null,
});

describe('weatherOnDay', () => {
  it('is the clock’s today, the forecast after, and the pinned weather every day', () => {
    const now = { ...nowAt(0), weather: 'storm' as const };
    expect(weatherOnDay(now, 0)).toBe('storm');
    expect(weatherOnDay(now, 3)).toBe(weatherOn(3, WEATHER_SEED));
    expect(weatherOnDay({ ...now, forcedWeather: 'rain' }, 3)).toBe('rain');
  });
});

describe('runEvents', () => {
  it('tells the steps of the welcome meeting once as it starts, and books its stage', () => {
    const state = freshState();
    const heard: (readonly EventStep[])[] = [];
    const start = 10 * TICKS_PER_HOUR;
    runEvents(state, nowAt(start - TICKS_PER_HOUR), 1, (steps) => heard.push(steps));
    expect(heard.map((steps) => steps.map((step) => step.kind))).toEqual([['announce']]);
    runEvents(state, nowAt(start + 2), 5, (steps) => heard.push(steps));
    expect(heard.length).toBe(2);
    expect(heard[1]!.map((step) => step.kind)).toEqual(['start']);
    const [run] = state.events.runs;
    const stage = heldAt(run!.occurrence.site, run!.occurrence.kind, state.venues);
    expect(stage).toBeGreaterThanOrEqual(0);
    expect(state.eventBooked[stage]).toBe(1);
    expect(state.eventShowing[stage]).toBe(1);
    expect(runningShowOf(state)).toBeNull();
  });
});

describe('refreshEventVenues', () => {
  it('sizes its marks to the venues standing', () => {
    const state = freshState();
    state.venues = state.venues.slice(0, 3);
    refreshEventVenues(state, 0);
    expect(state.eventBooked.length).toBe(3);
    expect(state.eventShowing.length).toBe(3);
    expect(state.hosted).toEqual([]);
  });
});

describe('refreshInvited', () => {
  it('grows with the parties', () => {
    const state = freshState();
    const parties = state.guests.parties.length;
    state.invited = { end: new Int32Array(0), venue: new Int32Array(0) };
    refreshInvited(state);
    expect(state.invited.end.length).toBe(parties);
  });
});

describe('beachIndexOf', () => {
  it('is the last site on a resort with sand, after every venue', () => {
    const state = freshState();
    expect(beachIndexOf(state)).toBe(state.venues.length);
    state.siteVenues = state.venues;
    expect(beachIndexOf(state)).toBe(-1);
  });
});
