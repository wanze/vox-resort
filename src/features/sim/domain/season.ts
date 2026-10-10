import { USUAL_MIX, type PartyMix } from '../../guests/domain/parties';
import type { DayCounts, DayReport } from './dayReport';
import { netOf, REASONS, type Column } from './ledger';
import { USUAL_WEATHER, type WeatherBands } from './weather';

export const SEASON_DAYS = 28;

const EARLY_DAYS = 7;

const HOLIDAY_DAYS = 14;

export const SEASONS_KEPT = 8;

export type SeasonPhase = 'early' | 'holidays' | 'late' | 'closing';

export type SeasonState = 'running' | 'closing' | 'break';

// Kept on the resort, not the clock: the calendar day and the weekdays keep counting through a
// break, so the events programme never hears of seasons.
export interface Season {
  readonly number: number;
  // The calendar day of season day 1, whose 11:00 check-in opens it.
  readonly startedOn: number;
  readonly state: SeasonState;
}

export interface PhaseEffect {
  readonly demand: number;
  readonly mix: PartyMix;
  readonly weather: WeatherBands;
}

const PHASE_EFFECTS: { readonly [phase in SeasonPhase]: PhaseEffect } = {
  early: {
    demand: 0.6,
    mix: { family: 0.15, couple: 0.45, friends: 0.15, solo: 0.25 },
    weather: { clear: 17, rain: 5, heatwave: 0 },
  },
  holidays: {
    demand: 1.5,
    mix: { family: 0.65, couple: 0.15, friends: 0.12, solo: 0.08 },
    weather: { clear: 15, rain: 3, heatwave: 5 },
  },
  late: {
    demand: 0.7,
    mix: { family: 0.15, couple: 0.3, friends: 0.4, solo: 0.15 },
    weather: { clear: 14, rain: 5, heatwave: 1 },
  },
  closing: { demand: 0, mix: USUAL_MIX, weather: USUAL_WEATHER },
};

// A resort with no seasons, as the sim report and the tests run one: every day as it always was.
export const USUAL_EFFECT: PhaseEffect = { demand: 1, mix: USUAL_MIX, weather: USUAL_WEATHER };

export const PHASE_WORDS: { readonly [phase in SeasonPhase]: string } = {
  early: 'Early season',
  holidays: 'School holidays',
  late: 'Late season',
  closing: 'Closing',
};

export function firstSeason(day: number): Season {
  return { number: 1, startedOn: day, state: 'running' };
}

// A save from before seasons is cut into 28-day seasons from day 0, so it lands mid-season.
export function seasonOfOldSave(day: number): Season {
  const whole = Math.max(0, Math.floor(day));
  return {
    number: Math.floor(whole / SEASON_DAYS) + 1,
    startedOn: whole - (whole % SEASON_DAYS),
    state: 'running',
  };
}

export const seasonDayOf = (season: Season, day: number): number => day - season.startedOn + 1;

// A day before the season starts reads as closing too, so a break carried over a midnight never
// reads as a phase with guests.
export const phaseOn = (season: Season, day: number): SeasonPhase =>
  phaseOfSeasonDay(seasonDayOf(season, day));

export function phaseOfSeasonDay(seasonDay: number): SeasonPhase {
  if (seasonDay < 1 || seasonDay > SEASON_DAYS) return 'closing';
  if (seasonDay <= EARLY_DAYS) return 'early';
  if (seasonDay <= EARLY_DAYS + HOLIDAY_DAYS) return 'holidays';
  return 'late';
}

const PHASE_STARTS: readonly { readonly phase: SeasonPhase; readonly seasonDay: number }[] = [
  { phase: 'early', seasonDay: 1 },
  { phase: 'holidays', seasonDay: EARLY_DAYS + 1 },
  { phase: 'late', seasonDay: EARLY_DAYS + HOLIDAY_DAYS + 1 },
  { phase: 'closing', seasonDay: SEASON_DAYS + 1 },
];

// Null on the closing day, after which comes a break rather than a phase.
export function nextPhaseOf(
  seasonDay: number,
): { readonly phase: SeasonPhase; readonly inDays: number } | null {
  const next = PHASE_STARTS.find((start) => start.seasonDay > seasonDay);
  return next ? { phase: next.phase, inDays: next.seasonDay - seasonDay } : null;
}

export const phaseEffect = (phase: SeasonPhase): PhaseEffect => PHASE_EFFECTS[phase];

export const effectOn = (season: Season | null, day: number): PhaseEffect =>
  season ? phaseEffect(phaseOn(season, day)) : USUAL_EFFECT;

export const lastNightOf = (season: Pick<Season, 'startedOn'>): number =>
  season.startedOn + SEASON_DAYS - 1;

export const closingDayOf = (season: Season): number => season.startedOn + SEASON_DAYS;

export function nextSeason(season: Season, checkInDay: number): Season {
  return { number: season.number + 1, startedOn: checkInDay, state: 'running' };
}

export const inBreak = (season: Season | null): boolean => season?.state === 'break';

export interface DayMark {
  readonly day: number;
  readonly value: number;
}

export interface SeasonTally {
  readonly days: number;
  readonly starSum: number;
  readonly bestStars: number | null;
  readonly worstStars: number | null;
  readonly arrived: number;
  readonly turnedAway: number;
  readonly left: number;
  readonly reviews: number;
  readonly reviewStars: number;
  readonly money: Column;
  readonly busiest: DayMark | null;
  readonly best: DayMark | null;
}

export interface SeasonReport {
  readonly number: number;
  readonly startedOn: number;
  readonly days: number;
  readonly meanStars: number | null;
  readonly bestStars: number | null;
  readonly worstStars: number | null;
  readonly arrived: number;
  readonly turnedAway: number;
  readonly left: number;
  readonly reviews: number;
  readonly meanReview: number | null;
  readonly money: Column;
  readonly net: number;
  readonly balance: number;
  readonly busiest: DayMark | null;
  readonly best: DayMark | null;
}

const NO_MONEY = Object.fromEntries(REASONS.map((reason) => [reason, 0])) as Column;

export function startTally(): SeasonTally {
  return {
    days: 0,
    starSum: 0,
    bestStars: null,
    worstStars: null,
    arrived: 0,
    turnedAway: 0,
    left: 0,
    reviews: 0,
    reviewStars: 0,
    money: NO_MONEY,
    busiest: null,
    best: null,
  };
}

const addMoney = (a: Column, b: Column): Column =>
  Object.fromEntries(REASONS.map((reason) => [reason, a[reason] + b[reason]])) as Column;

// The first day to reach a mark keeps it, so a tie names the earlier day.
const higher = (mark: DayMark | null, day: number, value: number): DayMark =>
  mark && mark.value >= value ? mark : { day, value };

export function tallyDay(tally: SeasonTally, report: DayReport): SeasonTally {
  const stars = report.rating.stars;
  return {
    days: tally.days + 1,
    starSum: tally.starSum + stars,
    bestStars: tally.bestStars === null ? stars : Math.max(tally.bestStars, stars),
    worstStars: tally.worstStars === null ? stars : Math.min(tally.worstStars, stars),
    arrived: tally.arrived + report.arrived,
    turnedAway: tally.turnedAway + (report.turnedAway ?? 0),
    left: tally.left + report.left,
    reviews: tally.reviews + report.reviews,
    // The report's mean is rounded to a tenth, close enough for a season's.
    reviewStars: tally.reviewStars + (report.meanReview ?? 0) * report.reviews,
    money: addMoney(tally.money, report.money),
    busiest: higher(tally.busiest, report.day, report.present),
    best: higher(tally.best, report.day, netOf(report.money)),
  };
}

// The closing day ends before its own report is written: its goodbyes and takings count, but it
// is not a day of the season, so it never sets a mark or the mean stars.
export function tallyClosingDay(tally: SeasonTally, counts: DayCounts, money: Column): SeasonTally {
  return {
    ...tally,
    left: tally.left + counts.left,
    reviews: tally.reviews + counts.reviews,
    reviewStars: tally.reviewStars + counts.reviewStars,
    money: addMoney(tally.money, money),
  };
}

const oneDecimal = (value: number): number => Math.round(value * 10) / 10 + 0;

export function closeSeason(tally: SeasonTally, season: Season, balance: number): SeasonReport {
  return {
    number: season.number,
    startedOn: season.startedOn,
    days: tally.days,
    meanStars: tally.days > 0 ? oneDecimal(tally.starSum / tally.days) : null,
    bestStars: tally.bestStars,
    worstStars: tally.worstStars,
    arrived: tally.arrived,
    turnedAway: tally.turnedAway,
    left: tally.left,
    reviews: tally.reviews,
    meanReview: tally.reviews > 0 ? oneDecimal(tally.reviewStars / tally.reviews) : null,
    money: tally.money,
    net: netOf(tally.money),
    balance,
    busiest: tally.busiest,
    best: tally.best,
  };
}

// Oldest first, as the day reports are kept.
export const keepSeason = (
  seasons: readonly SeasonReport[],
  report: SeasonReport,
): readonly SeasonReport[] => [...seasons, report].slice(-SEASONS_KEPT);

export interface SeasonView {
  readonly number: number;
  readonly state: SeasonState;
  readonly day: number;
  readonly phase: SeasonPhase;
  readonly closesOn: number;
}

export const seasonViewOf = (season: Season, day: number): SeasonView => ({
  number: season.number,
  state: season.state,
  day: seasonDayOf(season, day),
  phase: phaseOn(season, day),
  closesOn: closingDayOf(season),
});

// Told to React only when one of these changed, not every hour the view is asked for.
export const sameSeasonView = (a: SeasonView | null, b: SeasonView | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.number === b.number &&
    a.state === b.state &&
    a.day === b.day &&
    a.phase === b.phase &&
    a.closesOn === b.closesOn);

export const isSeasonDay = (season: Season, day: number): boolean =>
  day >= season.startedOn && day <= lastNightOf(season);
