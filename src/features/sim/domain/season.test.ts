import { describe, expect, it } from 'vitest';
import { countArrivals, countDeparture, countTurnedAway, reportOf, startDay } from './dayReport';
import { closeDay, createLedger, record, REASONS } from './ledger';
import { arrivalsFor, type Rating } from './rating';
import {
  closeSeason,
  closingDayOf,
  effectOn,
  firstSeason,
  keepSeason,
  lastNightOf,
  nextPhaseOf,
  nextSeason,
  phaseEffect,
  phaseOfSeasonDay,
  phaseOn,
  SEASON_DAYS,
  SEASONS_KEPT,
  seasonDayOf,
  seasonOfOldSave,
  startTally,
  tallyClosingDay,
  tallyDay,
  USUAL_EFFECT,
  type SeasonPhase,
} from './season';
import { createDay } from './thoughts';
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

describe('the next phase', () => {
  it('counts the days to the next phase, and to the closing day after the last', () => {
    expect(nextPhaseOf(0)).toEqual({ phase: 'early', inDays: 1 });
    expect(nextPhaseOf(1)).toEqual({ phase: 'holidays', inDays: 7 });
    expect(nextPhaseOf(7)).toEqual({ phase: 'holidays', inDays: 1 });
    expect(nextPhaseOf(21)).toEqual({ phase: 'late', inDays: 1 });
    expect(nextPhaseOf(28)).toEqual({ phase: 'closing', inDays: 1 });
    expect(nextPhaseOf(29)).toBeNull();
  });

  it('agrees with the calendar about every season day', () => {
    for (let seasonDay = 1; seasonDay <= SEASON_DAYS + 1; seasonDay++) {
      expect(phaseOfSeasonDay(seasonDay)).toBe(phaseOn(firstSeason(0), seasonDay - 1));
    }
  });
});
