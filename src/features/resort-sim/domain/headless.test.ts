import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { crowdSizeForOwned } from '../../crowd/domain/crowdSize';
import { ownedArea } from '../../land/domain/landRights';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { netOf } from '../../sim/domain/ledger';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { weatherOn } from '../../sim/domain/weather';
import { WEATHER_SEED } from './eventSteps';
import { createHeadlessGame, framesPerTickAt, simNowAt } from './headless';

const quiet = { morning: () => {}, hourly: () => {}, heard: () => {} };

describe('simNowAt', () => {
  it('reads the day and the weather off the ticks, unless the weather is pinned', () => {
    const ticks = 2 * TICKS_PER_DAY + 90;
    expect(simNowAt(ticks, null)).toEqual({
      ticks,
      day: 2,
      tickOfDay: 90,
      weather: weatherOn(2, WEATHER_SEED),
      forcedWeather: null,
    });
    expect(simNowAt(ticks, 'storm').weather).toBe('storm');
  });
});

describe('framesPerTickAt', () => {
  it('is the report’s frames for a normal tick', () => {
    expect(framesPerTickAt('normal')).toBe(22);
  });
});

describe('the reference resort, three days from the first morning', () => {
  it('plays the same days every time', () => {
    const world = referenceWorldOf(referenceJson);
    const plan = planOfWorld(world);
    const { placements, props, paths, rails, tilesX, tilesZ } = world;
    const game = createHeadlessGame({
      plan,
      plot: {
        layout: { placements, props, paths, rails, tilesX, tilesZ },
        placements: [...placements],
        props: [...props],
        paths: [...paths],
        rails: [...rails],
      },
      population: crowdSizeForOwned(ownedArea(plan.land ?? null, plan)),
      startTick: 8 * 60,
      forcedWeather: null,
    });
    game.play(3 * TICKS_PER_DAY + CHECK_IN_TICK, {
      framesPerTick: framesPerTickAt('normal'),
      hooks: quiet,
    });
    const days = game.state.history.map((day) => ({
      day: day.day,
      stars: day.rating.stars,
      present: day.present,
      taken: day.beds.taken,
      arrived: day.arrived,
      left: day.left,
      net: netOf(day.money),
      balance: day.balance,
    }));
    expect(days).toMatchInlineSnapshot(`
      [
        {
          "arrived": 0,
          "balance": 19769,
          "day": 0,
          "left": 0,
          "net": 13475,
          "present": 282,
          "stars": 4.5,
          "taken": 282,
        },
        {
          "arrived": 0,
          "balance": 32843,
          "day": 1,
          "left": 0,
          "net": 13074,
          "present": 282,
          "stars": 4.5,
          "taken": 282,
        },
        {
          "arrived": 0,
          "balance": 43939,
          "day": 2,
          "left": 35,
          "net": 12055,
          "present": 247,
          "stars": 4.5,
          "taken": 282,
        },
      ]
    `);
  });
});
