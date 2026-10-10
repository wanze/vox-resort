import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { plotFactsOf } from './plotFacts';
import { quietNightNow } from './quietNight';
import type { SimNow } from './simNow';
import { createSimState, type SimState } from './simState';
import { keepStaffHours } from './staffing';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const plot = { ...world, layout: world };
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

const stateWith = (away: boolean): SimState =>
  createSimState({
    plan,
    plot,
    shore,
    facts,
    population: 60,
    away,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const HOUR = 60;

const at = (tickOfDay: number): SimNow => ({
  ticks: 1440 + tickOfDay,
  day: 1,
  tickOfDay,
  weather: 'clear',
  forcedWeather: null,
});

// Nobody here, so only the staff, the club and the events can keep the night from being quiet.
const sentHome = (): SimState => {
  const state = stateWith(true);
  keepStaffHours(state, at(3 * HOUR));
  return state;
};

describe('quietNightNow', () => {
  it('waits for the staff to go off shift, not for the walk home', () => {
    const state = stateWith(true);
    expect(quietNightNow(state, at(3 * HOUR))).toBe(false);
    keepStaffHours(state, at(3 * HOUR));
    expect(state.staff.crowd.offPlot.includes(0)).toBe(true);
    expect(quietNightNow(state, at(3 * HOUR))).toBe(true);
  });

  it('ends at five, and waits for the club to shut at two', () => {
    const state = sentHome();
    expect(quietNightNow(state, at(5 * HOUR))).toBe(false);
    expect(quietNightNow(state, at(1 * HOUR))).toBe(false);
    expect(quietNightNow(state, at(2 * HOUR))).toBe(true);
  });

  it('waits for an event on or due', () => {
    const state = sentHome();
    state.events.runs = [{} as (typeof state.events.runs)[number]];
    expect(quietNightNow(state, at(3 * HOUR))).toBe(false);
  });

  it('waits for the guests to be in bed', () => {
    const state = stateWith(false);
    keepStaffHours(state, at(3 * HOUR));
    expect(state.router.asleepCount).toBe(0);
    expect(quietNightNow(state, at(3 * HOUR))).toBe(false);
  });
});
