import { beforeAll, describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { MAX_STEP, stepCrowd } from '../../crowd/domain/crowd';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { framesPerTickAt } from './headless';
import { plotFactsOf } from './plotFacts';
import type { SimNow } from './simNow';
import { createSimState, type SimState } from './simState';
import { stepSim, type SimHooks } from './stepSim';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());
const FRAMES_PER_TICK = framesPerTickAt('normal');

// One clock for the routers and the rules, or they would disagree about the time.
function gameAt(start: number) {
  let now = start;
  const state = createSimState({
    plan,
    plot: { ...world, layout: world },
    shore,
    facts,
    population: 200,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => now, tickOfDay: () => now % TICKS_PER_DAY, weather: () => 'clear' },
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
    jump(ticks: number, hooks: SimHooks) {
      now += ticks;
      stepSim(state, simNow(), ticks, hooks);
    },
    walk(to: number, hooks: SimHooks) {
      while (now < to) {
        for (let frame = 0; frame < FRAMES_PER_TICK; frame++) {
          stepCrowd(state.crowd.crowd, MAX_STEP);
          stepCrowd(state.staff.crowd, MAX_STEP);
        }
        now++;
        stepSim(state, simNow(), 1, hooks);
      }
    },
  };
}

const quiet: SimHooks = { morning: () => {}, hourly: () => {}, heard: () => {} };

describe('stepSim', () => {
  it('closes a day once over a frame that straddles the check-in', () => {
    const game = gameAt(TICKS_PER_DAY + CHECK_IN_TICK - 6);
    let mornings = 0;
    const hooks = { ...quiet, morning: () => mornings++ };
    game.jump(12, hooks);
    expect(mornings).toBe(1);
    expect(game.state.history.map((day) => day.day)).toEqual([0]);
    game.jump(12, hooks);
    expect(mornings).toBe(1);
    expect(game.state.history.length).toBe(1);
  });

  describe('on the check-in hour', () => {
    const calls: string[] = [];
    let visitsAtMorning = 0;
    let state: SimState;
    beforeAll(() => {
      const game = gameAt(8 * 60);
      state = game.state;
      game.walk(CHECK_IN_TICK, {
        ...quiet,
        morning: () => {
          calls.push('morning');
          visitsAtMorning = state.router.dayVisits().size;
        },
        hourly: () => calls.push('hourly'),
      });
    });

    it('runs the morning before the hour', () => {
      expect(calls.slice(-2)).toEqual(['morning', 'hourly']);
    });

    it('tells the morning before the day’s counters are wiped', () => {
      expect(visitsAtMorning).toBeGreaterThan(0);
      expect(state.router.dayVisits().size).toBe(0);
    });
  });
});
