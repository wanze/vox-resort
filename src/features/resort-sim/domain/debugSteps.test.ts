import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { presentCount } from '../../guests/domain/guests';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import {
  closingDayOf,
  firstSeason,
  seasonViewOf,
  type Season,
  type SeasonState,
} from '../../sim/domain/season';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { canRunSeasonAction, runSeasonAction, runUpkeepAction, SEASON_ACTIONS } from './debugSteps';
import { plotFactsOf } from './plotFacts';
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
  let ended = 0;
  const hooks: SimHooks = {
    morning: () => {},
    hourly: () => {},
    heard: () => {},
    seasonEnded: () => ended++,
  };
  return {
    state,
    now: simNow,
    ended: () => ended,
    jump(ticks: number) {
      now += ticks;
      stepSim(state, simNow(), ticks, hooks);
    },
  };
}

const at = (day: number, hour: number): number => day * TICKS_PER_DAY + hour * TICKS_PER_HOUR;

const seasonIn = (state: SeasonState): Season => ({ ...firstSeason(0), state });

describe('canRunSeasonAction', () => {
  it('runs nothing on a resort without seasons', () => {
    for (const action of SEASON_ACTIONS) expect(canRunSeasonAction(null, action)).toBe(false);
  });

  it('closes only a running season, ends any but a break, and jumps from anywhere', () => {
    expect(canRunSeasonAction(seasonIn('running'), 'close')).toBe(true);
    expect(canRunSeasonAction(seasonIn('closing'), 'close')).toBe(false);
    expect(canRunSeasonAction(seasonIn('break'), 'close')).toBe(false);
    expect(canRunSeasonAction(seasonIn('running'), 'end')).toBe(true);
    expect(canRunSeasonAction(seasonIn('closing'), 'end')).toBe(true);
    expect(canRunSeasonAction(seasonIn('break'), 'end')).toBe(false);
    for (const state of ['running', 'closing', 'break'] as const) {
      expect(canRunSeasonAction(seasonIn(state), 'holidays')).toBe(true);
    }
  });
});

describe('runSeasonAction', () => {
  it('makes today the first day of the phase asked for, or the last day', () => {
    const game = gameAt(at(3, 15));
    const cases = [
      ['early', 1, 'early'],
      ['holidays', 8, 'holidays'],
      ['late', 22, 'late'],
      ['last', 28, 'late'],
    ] as const;
    for (const [action, day, phase] of cases) {
      expect(runSeasonAction(game.state, game.now(), action)).toBe('moved');
      const view = seasonViewOf(game.state.season!, 3);
      expect(view).toMatchObject({ number: 1, state: 'running', day, phase });
    }
    // Before today: an early resort's season starts on a day the clock never saw.
    expect(game.state.season!.startedOn).toBe(-24);
  });

  it('closes the season the morning after the last day, counting only the days played', () => {
    const game = gameAt(at(0, 0) + CHECK_IN_TICK - 1);
    game.jump(1);
    game.jump(TICKS_PER_DAY);
    expect(game.state.seasonTally.days).toBe(1);
    // Before the check-in, so this morning's coach is the last day's.
    game.jump(TICKS_PER_DAY - 1);
    runSeasonAction(game.state, game.now(), 'last');
    game.jump(1);
    expect(game.state.season!.state).toBe('running');
    game.jump(TICKS_PER_DAY);
    expect(game.state.season!.state).toBe('closing');
    game.jump(11 * TICKS_PER_HOUR);
    expect(game.ended()).toBe(1);
    expect(game.state.seasons[0]!.days).toBe(3);
  });

  it('closes now: today is the closing day, nobody comes and everybody is sent home', () => {
    const game = gameAt(at(5, 15));
    expect(presentCount(game.state.guests)).toBeGreaterThan(0);
    expect(runSeasonAction(game.state, game.now(), 'close')).toBe('closing');
    expect(game.state.season!.state).toBe('closing');
    expect(closingDayOf(game.state.season!)).toBe(5);
    expect(game.state.arrivalsPlanned).toBe(0);
    expect(runSeasonAction(game.state, game.now(), 'close')).toBeNull();
    game.jump(7 * TICKS_PER_HOUR);
    expect(game.ended()).toBe(1);
    expect(game.state.season!.state).toBe('break');
    expect(presentCount(game.state.guests)).toBe(0);
  });

  it('ends now, straight to the break and the report', () => {
    const game = gameAt(at(5, 15));
    expect(runSeasonAction(game.state, game.now(), 'end')).toBe('ended');
    expect(game.state.season).toEqual(seasonIn('break'));
    expect(game.state.open).toBe(false);
    expect(game.state.seasons).toHaveLength(1);
    expect(presentCount(game.state.guests)).toBe(0);
    expect(runSeasonAction(game.state, game.now(), 'end')).toBeNull();
    expect(game.state.seasons).toHaveLength(1);
  });

  it('opens the next season from a break, on the day asked for', () => {
    const game = gameAt(at(5, 15));
    runSeasonAction(game.state, game.now(), 'end');
    expect(runSeasonAction(game.state, game.now(), 'holidays')).toBe('opened');
    expect(game.state.season).toEqual({ number: 2, startedOn: -2, state: 'running' });
    expect(game.state.open).toBe(true);
    expect(game.state.seasonTally.days).toBe(0);
  });

  it('takes a closing season back to running', () => {
    const game = gameAt(at(5, 15));
    runSeasonAction(game.state, game.now(), 'close');
    expect(runSeasonAction(game.state, game.now(), 'early')).toBe('moved');
    expect(game.state.season).toEqual({ number: 1, startedOn: 5, state: 'running' });
  });
});

describe('runUpkeepAction', () => {
  it('wears every building a season to a week, and nothing on a resort that does not age', () => {
    const { state } = gameAt(CHECK_IN_TICK);
    expect(runUpkeepAction(state, 'week')).toBe(false);
    expect(state.condition.size).toBe(0);

    const week = { ...state, ageing: true, condition: new Map<string, number>() };
    const season = { ...state, ageing: true, condition: new Map<string, number>() };
    runUpkeepAction(week, 'week');
    runUpkeepAction(season, 'season');
    const key = state.lodgings[0]!.key;
    expect(week.condition.get(key)).toBeLessThan(1);
    expect(1 - season.condition.get(key)!).toBeCloseTo(4 * (1 - week.condition.get(key)!));
  });
});
