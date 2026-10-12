import { describe, expect, it } from 'vitest';
import {
  countArrivals,
  countDeparture,
  countEvent,
  countPhoto,
  countTurnedAway,
  reportOf,
  startDay,
  type DayCounts,
} from './dayReport';
import { closeDay, createLedger, record, REASONS } from './ledger';
import { arrivalsFor, type Rating } from './rating';
import {
  closeSeason,
  closingDayOf,
  effectOn,
  firstDayOf,
  firstSeason,
  keepSeason,
  lastNightOf,
  nextPhaseOf,
  nextSeason,
  phaseEffect,
  phaseOfSeasonDay,
  phaseOn,
  SEASON_DAYS,
  SEASON_VOICES,
  SEASONS_KEPT,
  seasonDayOf,
  seasonOfOldSave,
  startTally,
  tallyClosingDay,
  tallyDay,
  USUAL_EFFECT,
  type SeasonPhase,
} from './season';
import { createDay, tallyInto, type ThoughtKind } from './thoughts';
import { WEATHER_DRAWS } from './weather';

const PHASES: readonly SeasonPhase[] = ['early', 'holidays', 'late', 'closing'];

const FOUR_STARS: Rating = { stars: 4, happiness: 0.8, housed: 1, cleanliness: 1 };

const dayReport = (day: number, parts: { stars: number; present: number; visit: number }) =>
  reportOf({
    counts: countTurnedAway(countDeparture(countArrivals(startDay(day), 10), 4), 2),
    rating: { ...FOUR_STARS, stars: parts.stars },
    present: parts.present,
    beds: { total: 60, taken: parts.present },
    ledger: closeDay(record(record(createLedger('tycoon', 0), 'visit', parts.visit), 'wages', -50)),
    thoughts: createDay(),
  });

describe('the calendar', () => {
  it('runs the early season, the school holidays and the late season, then closes', () => {
    const season = firstSeason(10);
    const phaseOfDay = (seasonDay: number) => phaseOn(season, 10 + seasonDay - 1);
    expect(phaseOfDay(1)).toBe('early');
    expect(phaseOfDay(7)).toBe('early');
    expect(phaseOfDay(8)).toBe('holidays');
    expect(phaseOfDay(21)).toBe('holidays');
    expect(phaseOfDay(22)).toBe('late');
    expect(phaseOfDay(28)).toBe('late');
    expect(phaseOfDay(29)).toBe('closing');
    expect(phaseOn(season, 9)).toBe('closing');
  });

  it('books nobody past the last night, and closes the morning after it', () => {
    const season = firstSeason(10);
    expect(lastNightOf(season)).toBe(10 + SEASON_DAYS - 1);
    expect(closingDayOf(season)).toBe(lastNightOf(season) + 1);
    expect(seasonDayOf(season, closingDayOf(season))).toBe(SEASON_DAYS + 1);
  });

  it('places an old save of day 89 on season 4, which started on day 84', () => {
    const season = seasonOfOldSave(89);
    expect(season).toEqual({ number: 4, startedOn: 84, state: 'running' });
    expect(seasonDayOf(season, 89)).toBe(6);
    expect(seasonOfOldSave(0)).toEqual(firstSeason(0));
  });

  it('numbers the next season up and starts it on the day given', () => {
    const closed = { ...firstSeason(0), state: 'break' as const };
    expect(nextSeason(closed, 31)).toEqual({ number: 2, startedOn: 31, state: 'running' });
  });
});

describe('the phases', () => {
  it('give mixes that share out every party, and weather bands that fit the draw', () => {
    for (const phase of PHASES) {
      const { mix, weather } = phaseEffect(phase);
      expect(Object.values(mix).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9);
      expect(weather.clear + weather.rain + weather.heatwave).toBeLessThanOrEqual(WEATHER_DRAWS);
      for (const band of Object.values(weather)) expect(band).toBeGreaterThanOrEqual(0);
    }
  });

  it('brings nobody on the closing day, and runs a resort without seasons as usual', () => {
    expect(phaseEffect('closing').demand).toBe(0);
    expect(effectOn(null, 40)).toBe(USUAL_EFFECT);
    expect(effectOn(firstSeason(0), 10)).toBe(phaseEffect('holidays'));
  });

  it('plans at least twice the early season’s arrivals in the school holidays', () => {
    const season = firstSeason(0);
    const planned = new Map<SeasonPhase, number[]>();
    for (let day = 0; day < SEASON_DAYS; day++) {
      const phase = phaseOn(season, day);
      const beds = { free: 200, total: 200 };
      const arrivals = arrivalsFor(FOUR_STARS, beds, phaseEffect(phase).demand);
      planned.set(phase, [...(planned.get(phase) ?? []), arrivals]);
    }
    const mean = (phase: SeasonPhase) => {
      const days = planned.get(phase)!;
      return days.reduce((sum, each) => sum + each, 0) / days.length;
    };
    expect(mean('holidays')).toBeGreaterThanOrEqual(2 * mean('early'));
    expect(mean('late')).toBeLessThan(mean('holidays'));
  });
});

describe('the season report', () => {
  it('sums the money and the guests over the days, and finds the busiest and the best', () => {
    let tally = startTally();
    tally = tallyDay(tally, dayReport(3, { stars: 3.5, present: 20, visit: 100 }));
    tally = tallyDay(tally, dayReport(4, { stars: 4.5, present: 50, visit: 400 }));
    tally = tallyDay(tally, dayReport(5, { stars: 4, present: 40, visit: 900 }));
    expect(tally.days).toBe(3);
    expect(tally.arrived).toBe(30);
    expect(tally.left).toBe(12);
    expect(tally.turnedAway).toBe(6);
    expect(tally.money.visit).toBe(1_400);
    expect(tally.money.wages).toBe(-150);
    expect(tally.busiest).toEqual({ day: 4, value: 50 });
    expect(tally.best).toEqual({ day: 5, value: 850 });
  });

  it('keeps the mean, the best and the worst stars, and the balance at the end', () => {
    let tally = startTally();
    for (const [day, stars] of [
      [3, 3.5],
      [4, 4.5],
      [5, 4],
    ] as const) {
      tally = tallyDay(tally, dayReport(day, { stars, present: 10, visit: 0 }));
    }
    const report = closeSeason(tally, firstSeason(3), 2_500);
    expect(report.meanStars).toBe(4);
    expect(report.bestStars).toBe(4.5);
    expect(report.worstStars).toBe(3.5);
    expect(report.balance).toBe(2_500);
    expect(report.net).toBe(-150);
    expect(report.number).toBe(1);
  });

  it('counts the closing day’s goodbyes and money but not as a day of the season', () => {
    const counts = countDeparture(startDay(31), 9);
    const money = record(createLedger('tycoon', 0), 'night', 300).today;
    const tally = tallyClosingDay(startTally(), counts, money);
    expect(tally.days).toBe(0);
    expect(tally.left).toBe(9);
    expect(tally.money.night).toBe(300);
    expect(tally.best).toBeNull();
  });

  it('reports a season with no days played as empty', () => {
    const report = closeSeason(startTally(), firstSeason(0), 0);
    expect(report.days).toBe(0);
    expect(report.meanStars).toBeNull();
    expect(report.meanReview).toBeNull();
    expect(report.busiest).toBeNull();
    for (const reason of REASONS) expect(report.money[reason]).toBe(0);
  });

  it('keeps the last seasons only', () => {
    let seasons = keepSeason([], closeSeason(startTally(), firstSeason(0), 0));
    for (let number = 2; number <= SEASONS_KEPT + 3; number++) {
      const season = { ...firstSeason(0), number };
      seasons = keepSeason(seasons, closeSeason(startTally(), season, 0));
    }
    expect(seasons).toHaveLength(SEASONS_KEPT);
    expect(seasons.at(-1)!.number).toBe(SEASONS_KEPT + 3);
  });
});

const storyDay = (
  day: number,
  heard: readonly (readonly [ThoughtKind, string | null, number])[],
  counts: DayCounts = startDay(day),
) => {
  const thoughts = createDay();
  for (const [kind, subject, times] of heard) {
    for (let time = 0; time < times; time++) tallyInto(thoughts, kind, subject);
  }
  return reportOf({
    counts,
    rating: FOUR_STARS,
    present: 10,
    beds: { total: 60, taken: 10 },
    ledger: closeDay(createLedger('tycoon', 0)),
    thoughts,
  });
};

const shot = (key: string) => ({
  key,
  subject: key,
  kind: 'view' as const,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  minute: 600,
});

const photographed = (day: number, keys: readonly string[]) =>
  keys.reduce((counts, key) => countPhoto(counts, shot(key)), startDay(day));

describe('what the season paper reads from the tally', () => {
  it('adds up the loudest thoughts of each day and keeps the loudest of the season', () => {
    let tally = startTally();
    tally = tallyDay(
      tally,
      storyDay(1, [
        ['queue-too-long', 'Tiki Bar', 5],
        ['littered', null, 2],
      ]),
    );
    tally = tallyDay(
      tally,
      storyDay(2, [
        ['queue-too-long', 'Tiki Bar', 4],
        ['sunset', null, 3],
      ]),
    );
    tally = tallyDay(
      tally,
      storyDay(3, [
        ['hurt', null, 6],
        ['enjoyed', 'Pool', 1],
      ]),
    );
    tally = tallyDay(
      tally,
      storyDay(4, [
        ['filthy', 'Taverna', 2],
        ['broken', 'Slide', 1],
      ]),
    );
    expect(tally.voices).toHaveLength(SEASON_VOICES);
    expect(tally.voices![0]).toEqual({ kind: 'queue-too-long', subject: 'Tiki Bar', count: 9 });
    expect(tally.voices![1]).toEqual({ kind: 'hurt', subject: null, count: 6 });
  });

  it('adds nothing for a day nobody thought, photographed or watched anything', () => {
    const tally = tallyDay(startTally(), storyDay(1, []));
    expect(tally).not.toHaveProperty('voices');
    expect(tally).not.toHaveProperty('events');
    expect(tally).not.toHaveProperty('photos');
    expect(tally).not.toHaveProperty('topSpot');
  });

  it('sums the events of the days, writing fireworks only once there were some', () => {
    const quiet = countEvent(startDay(1), { held: 2, audience: 40, called: 1 });
    const loud = countEvent(startDay(2), { held: 1, audience: 90, called: 0, fireworks: 1 });
    let tally = tallyDay(startTally(), storyDay(1, [], quiet));
    expect(tally.events).toEqual({ held: 2, audience: 40, called: 1 });
    tally = tallyDay(tally, storyDay(2, [], loud));
    expect(tally.events).toEqual({ held: 3, audience: 130, called: 1, fireworks: 1 });
  });

  it('counts the photos and keeps the spot photographed most on any one day', () => {
    let tally = tallyDay(startTally(), storyDay(1, [], photographed(1, ['pier', 'pier', 'bar'])));
    tally = tallyDay(tally, storyDay(2, [], photographed(2, ['pool', 'pool', 'pool', 'bar'])));
    tally = tallyDay(tally, storyDay(3, [], photographed(3, ['bar', 'bar', 'bar'])));
    expect(tally.photos).toBe(10);
    expect(tally.topSpot).toMatchObject({ key: 'pool', count: 3 });
  });

  it('reports a season without them just as before', () => {
    let tally = startTally();
    tally = tallyDay(tally, dayReport(3, { stars: 3.5, present: 20, visit: 100 }));
    const report = closeSeason(tally, firstSeason(3), 0);
    expect(Object.keys(report)).toEqual(Object.keys(closeSeason(startTally(), firstSeason(3), 0)));
    expect(report).not.toHaveProperty('voices');
  });

  it('copies them onto the report when the season had them', () => {
    const counts = countEvent(photographed(1, ['pier']), { held: 1, audience: 9, called: 0 });
    const tally = tallyDay(startTally(), storyDay(1, [['sunset', null, 2]], counts));
    const report = closeSeason(tally, firstSeason(1), 0);
    expect(report.voices).toEqual([{ kind: 'sunset', subject: null, count: 2 }]);
    expect(report.events).toEqual({ held: 1, audience: 9, called: 0 });
    expect(report.photos).toBe(1);
    expect(report.topSpot).toMatchObject({ key: 'pier' });
  });
});

describe('the next phase', () => {
  it('counts the days to the next phase, and to the closing day after the last', () => {
    expect(nextPhaseOf(0)).toEqual({ phase: 'early', inDays: 1 });
    expect(nextPhaseOf(1)).toEqual({ phase: 'holidays', inDays: 7 });
    expect(nextPhaseOf(7)).toEqual({ phase: 'holidays', inDays: 1 });
    expect(nextPhaseOf(21)).toEqual({ phase: 'late', inDays: 1 });
    expect(nextPhaseOf(28)).toEqual({ phase: 'closing', inDays: 1 });
    expect(nextPhaseOf(29)).toBeNull();
  });

  it('names the first season day of each phase, and the closing day after the last', () => {
    expect(firstDayOf('early')).toBe(1);
    expect(firstDayOf('holidays')).toBe(8);
    expect(firstDayOf('late')).toBe(22);
    expect(firstDayOf('closing')).toBe(SEASON_DAYS + 1);
    for (const phase of ['early', 'holidays', 'late', 'closing'] as const) {
      expect(phaseOfSeasonDay(firstDayOf(phase))).toBe(phase);
    }
  });

  it('agrees with the calendar about every season day', () => {
    for (let seasonDay = 1; seasonDay <= SEASON_DAYS + 1; seasonDay++) {
      expect(phaseOfSeasonDay(seasonDay)).toBe(phaseOn(firstSeason(0), seasonDay - 1));
    }
  });
});
