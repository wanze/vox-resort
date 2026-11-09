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
import { accept, offered } from '../../bookings/domain/bookings';
import { ceremonyOf, withoutCeremony } from '../../events/domain/programme';
import { stayCount } from '../../sim/domain/thoughts';
import { WEATHER_SEED } from './eventSteps';
import { createHeadlessGame, framesPerTickAt, simNowAt, type HeadlessGame } from './headless';

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
          "balance": 19793,
          "day": 0,
          "left": 0,
          "net": 13560,
          "present": 282,
          "stars": 4.4,
          "taken": 282,
        },
        {
          "arrived": 0,
          "balance": 33118,
          "day": 1,
          "left": 0,
          "net": 13291,
          "present": 282,
          "stars": 4.4,
          "taken": 282,
        },
        {
          "arrived": 0,
          "balance": 44593,
          "day": 2,
          "left": 35,
          "net": 12428,
          "present": 247,
          "stars": 4.3,
          "taken": 282,
        },
      ]
    `);
  });
});

describe('a group booked on the reference resort', () => {
  it('arrives, stays its nights and settles before the week is out', () => {
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
      forcedWeather: 'clear',
    });
    const offer = {
      id: 1,
      operator: 'Sunshine Tours',
      kind: 'couple' as const,
      parties: 3,
      arrivesOn: 3,
      nights: 2,
      premium: 0.3,
      promisedStars: 3,
      bonusShare: 0.3,
      requirements: [],
      expiresOn: 1,
    };
    game.state.bookings = accept(offered(game.state.bookings, offer, 99), 1).state;
    const play = (to: number) =>
      game.play(to, { framesPerTick: framesPerTickAt('normal'), hooks: quiet });
    play(3 * TICKS_PER_DAY + CHECK_IN_TICK);
    const [booking] = game.state.bookings.accepted;
    expect(booking).toMatchObject({ state: 'staying', arrived: 3, turnedAway: 0 });
    play(7 * TICKS_PER_DAY + CHECK_IN_TICK);
    const { bookings, history } = game.state;
    expect(bookings.accepted).toEqual([]);
    const [settled] = bookings.settled;
    expect(settled).toMatchObject({ id: 1, parties: 3, outcome: 'bonus' });
    expect(settled!.bonus).toBe(Math.round(0.3 * booking!.expected));
    const paid = history.find((day) => day.day === settled!.day)!;
    expect(paid.money.booking).toBe(settled!.bonus);
    // A week of the reference resort: about 11s alone, three times that beside the full suite.
  }, 90_000);
});

const guestsOf = (game: HeadlessGame, booked: boolean): number[] => {
  const { guests, bookings } = game.state;
  const people: number[] = [];
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] !== 1) continue;
    if (bookings.partyOf.has(guests.party[person]!) === booked) people.push(person);
  }
  return people;
};

describe('a wedding booked on the reference resort', () => {
  const weddingGame = () => {
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
      forcedWeather: 'clear',
    });
    const offer = {
      id: 1,
      operator: 'Sunshine Tours',
      kind: 'wedding' as const,
      parties: 4,
      arrivesOn: 3,
      nights: 2,
      premium: 0.5,
      promisedStars: 4,
      bonusShare: 0.4,
      requirements: [{ kind: 'flag' as const, value: 'stage' as const }],
      expiresOn: 1,
    };
    game.state.bookings = accept(offered(game.state.bookings, offer, 99), 1).state;
    const play = (to: number) =>
      game.play(to, { framesPerTick: framesPerTickAt('normal'), hooks: quiet });
    return { game, play };
  };

  it('holds the ceremony for the party alone, and settles better than a group without one', () => {
    const held = weddingGame();
    held.play(3 * TICKS_PER_DAY + CHECK_IN_TICK);
    expect(ceremonyOf(held.game.state.events.programme, 1)).toMatchObject({
      repeat: { every: 'once', day: 4 },
      start: 15 * 60,
    });
    held.play(4 * TICKS_PER_DAY + 17 * 60);
    const { thoughts } = held.game.state;
    const party = guestsOf(held.game, true);
    const said = party.filter((person) => stayCount(thoughts, person, 'wedding') > 0);
    expect(said.length).toBeGreaterThan(0);
    for (const person of guestsOf(held.game, false)) {
      expect(stayCount(thoughts, person, 'wedding')).toBe(0);
    }
    held.play(7 * TICKS_PER_DAY + CHECK_IN_TICK);
    const [withOne] = held.game.state.bookings.settled;

    const none = weddingGame();
    none.play(3 * TICKS_PER_DAY + CHECK_IN_TICK);
    none.game.state.events.programme = withoutCeremony(none.game.state.events.programme, 1);
    none.play(7 * TICKS_PER_DAY + CHECK_IN_TICK);
    const [without] = none.game.state.bookings.settled;
    expect(withOne).toMatchObject({ id: 1 });
    expect(without).toMatchObject({ id: 1 });
    expect(withOne!.meanStars!).toBeGreaterThan(without!.meanStars!);
    expect(withOne!.outcome).toBe('bonus');
    expect(without!.outcome).toBe('missed');
    expect(held.game.state.events.programme.bookings.some((each) => each.group === 1)).toBe(false);
    // Two runs of four days each of the reference resort.
  }, 120_000);
});
