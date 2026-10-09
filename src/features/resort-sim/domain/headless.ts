import { PEOPLE_MODELS, STAFF_MODELS } from '../../catalog/domain/objectTypes';
import { MAX_STEP, stepCrowd } from '../../crowd/domain/crowd';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import { crowdScaleFor } from '../../sim/domain/crowdRate';
import { SPEED_DAY_SECONDS, TICKS_PER_DAY, type SimSpeed } from '../../sim/domain/simClock';
import { weatherOn, type Weather } from '../../sim/domain/weather';
import { WEATHER_SEED } from './eventSteps';
import { plotFactsOf } from './plotFacts';
import type { SimNow } from './simNow';
import { createSimState, type SimState } from './simState';
import { stepSim, type SimHooks } from './stepSim';

// As the showcase's clock reads it: a pinned weather holds every day.
export function simNowAt(ticks: number, forcedWeather: Weather | null): SimNow {
  const day = Math.floor(ticks / TICKS_PER_DAY);
  return {
    ticks,
    day,
    tickOfDay: ticks % TICKS_PER_DAY,
    weather: forcedWeather ?? weatherOn(day, WEATHER_SEED),
    forcedWeather,
  };
}

// The frames a tick runs at this speed, so walks take as long against the clock as in the app.
export function framesPerTickAt(speed: SimSpeed): number {
  return Math.round((crowdScaleFor(speed) * SPEED_DAY_SECONDS[speed]) / TICKS_PER_DAY / MAX_STEP);
}

export interface PlayOptions {
  readonly framesPerTick: number;
  readonly hooks: SimHooks;
  readonly afterTick?: (now: SimNow) => void;
}

export interface HeadlessGame {
  readonly state: SimState;
  readonly now: SimNow;
  play(to: number, options: PlayOptions): void;
}

export function createHeadlessGame(parts: {
  readonly plan: ResortPlan;
  readonly plot: Plot;
  readonly population: number;
  readonly startTick: number;
  readonly forcedWeather: Weather | null;
  // Off by default, so a report or a test replays as it did before guests took photos.
  readonly photos?: boolean;
}): HeadlessGame {
  const { plan, plot, forcedWeather } = parts;
  const shore = shoreFor(plan);
  let ticks = parts.startTick;
  const state = createSimState({
    plan,
    plot,
    shore,
    facts: plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, plot.layout, new Map()),
    population: parts.population,
    // As a new game opens a world: only a plot with no paving starts away.
    away: plot.layout.paths.length === 0,
    guestVariants: PEOPLE_MODELS.length,
    childVariant: PEOPLE_MODELS.findIndex((model) => model.id === 'child'),
    staffVariants: Math.max(1, STAFF_MODELS.length),
    clock: {
      ticks: () => ticks,
      tickOfDay: () => ticks % TICKS_PER_DAY,
      weather: () => simNowAt(ticks, forcedWeather).weather,
      photosOn: () => parts.photos === true,
    },
  });
  return {
    state,
    get now() {
      return simNowAt(ticks, forcedWeather);
    },
    // The walking is the caller's in the app too: the sim steps the routers, never a crowd.
    play(to, { framesPerTick, hooks, afterTick }) {
      while (ticks < to) {
        for (let frame = 0; frame < framesPerTick; frame++) {
          stepCrowd(state.crowd.crowd, MAX_STEP);
          stepCrowd(state.staff.crowd, MAX_STEP);
        }
        ticks++;
        const now = simNowAt(ticks, forcedWeather);
        stepSim(state, now, 1, hooks);
        afterTick?.(now);
      }
    },
  };
}
