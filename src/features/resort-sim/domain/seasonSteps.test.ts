import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { presentCount } from '../../guests/domain/guests';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { closingDayOf, firstSeason, SEASON_DAYS } from '../../sim/domain/season';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { plotFactsOf } from './plotFacts';
import { endSeason, openSeason, seasonDueToEnd } from './seasonSteps';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import { createSimState } from './simState';
import { stepSim, type SimHooks } from './stepSim';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

function gameAt(start: number) {
  let now = start;
  const state = createSimState({
    plan,
    plot: { ...world, layout: world },
    shore,
    facts,
    population: 120,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => now, tickOfDay: () => now % TICKS_PER_DAY, weather: () => 'clear' },
    seasons: true,
  });
  const simNow = (): SimNow => ({
    ticks: now,
    day: Math.floor(now / TICKS_PER_DAY),
    tickOfDay: now % TICKS_PER_DAY,
    weather: 'clear',
    forcedWeather: null,
  });
  return {
    state,
    now: simNow,
    jump(ticks: number, hooks: SimHooks) {
      now += ticks;
      stepSim(state, simNow(), ticks, hooks);
    },
  };
}

const quiet: SimHooks = { morning: () => {}, hourly: () => {}, heard: () => {} };

const closingMorning = SEASON_DAYS * TICKS_PER_DAY + CHECK_IN_TICK;

const hourOf = (day: number, hour: number): SimNow => {
  const ticks = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR;
  return { ticks, day, tickOfDay: ticks % TICKS_PER_DAY, weather: 'clear', forcedWeather: null };
};

describe('a season with guests', () => {
  it('starts a generated resort in season 1 at once, and a resort without seasons in none', () => {
    expect(gameAt(0).state.season).toEqual(firstSeason(0));
    const off = createSimState({
      plan,
      plot: { ...world, layout: world },
      shore,
      facts,
      population: 10,
      away: false,
      guestVariants: 4,
      childVariant: 1,
      staffVariants: 4,
      clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
    });
    expect(off.season).toBeNull();
  });

  it('sends everybody home on the closing morning and lets nobody in', () => {
    const game = gameAt(closingMorning - 1);
    expect(closingDayOf(game.state.season!)).toBe(SEASON_DAYS);
    game.jump(1, quiet);
    expect(game.state.season!.state).toBe('closing');
    expect(game.state.arrivalsPlanned).toBe(0);
    expect(game.state.today.arrived).toBe(0);
  });

  it('ends at 22:00 at the latest, seeing off anybody still on the plot', () => {
    const game = gameAt(closingMorning - 1);
    let ended = 0;
    const hooks = { ...quiet, seasonEnded: () => ended++ };
    game.jump(1, hooks);
    const present = presentCount(game.state.guests);
    expect(present).toBeGreaterThan(0);
    game.jump(9 * TICKS_PER_HOUR, hooks);
    expect(ended).toBe(0);
    game.jump(2 * TICKS_PER_HOUR, hooks);
    expect(ended).toBe(1);
    expect(presentCount(game.state.guests)).toBe(0);
    expect(game.state.season).toEqual({ ...firstSeason(0), state: 'break' });
    expect(game.state.open).toBe(false);
    const [report] = game.state.seasons;
    expect(report!.number).toBe(1);
    expect(report!.left).toBeGreaterThanOrEqual(present);
    expect(game.state.seasonTally.days).toBe(0);
  });

  it('is due to end once the resort is empty, or at 22:00', () => {
    const game = gameAt(closingMorning);
    const { state } = game;
    expect(seasonDueToEnd(state, hourOf(SEASON_DAYS, 23))).toBe(false);
    state.season = { ...state.season!, state: 'closing' };
    expect(seasonDueToEnd(state, hourOf(SEASON_DAYS, 15))).toBe(false);
    expect(seasonDueToEnd(state, hourOf(SEASON_DAYS, 22))).toBe(true);
    endSeason(state);
    state.season = { ...state.season!, state: 'closing' };
    expect(seasonDueToEnd(state, hourOf(SEASON_DAYS, 15))).toBe(true);
  });
});

describe('openSeason', () => {
  it('opens only a break, from the next check-in, with the gates open', () => {
    const { state } = gameAt(closingMorning);
    expect(openSeason(state, hourOf(SEASON_DAYS, 15))).toBe(false);
    state.season = { ...state.season!, state: 'closing' };
    endSeason(state);
    expect(openSeason(state, hourOf(SEASON_DAYS, 15))).toBe(true);
    expect(state.season).toEqual({ number: 2, startedOn: SEASON_DAYS + 1, state: 'running' });
    expect(state.open).toBe(true);
  });

  it('starts today when the clock has not reached the check-in', () => {
    const { state } = gameAt(closingMorning);
    state.season = { ...state.season!, state: 'break' };
    openSeason(state, hourOf(40, 9));
    expect(state.season!.startedOn).toBe(40);
  });
});
