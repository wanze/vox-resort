import type { Column, Ledger } from './ledger';
import type { Rating } from './rating';
import { loudest, type ThoughtTally } from './thoughts';

export interface EventTally {
  readonly held: number;
  readonly audience: number;
  readonly called: number;
  // Of those held; absent when none, as in saves from before the fireworks.
  readonly fireworks?: number;
  readonly postponed?: number;
}

// Why no welcome meeting was held on a day with arrivals.
export type WelcomeGap = 'no-stage' | 'off' | 'called-off';

export interface WelcomeTally {
  readonly welcomed: number;
  readonly gap: WelcomeGap | null;
}

export interface DayCounts {
  // The day this period started on; reports are labelled with it.
  readonly from: number;
  readonly arrived: number;
  readonly left: number;
  readonly reviews: number;
  readonly reviewStars: number;
  // Absent until the first event of the day, and in saves from before events.
  readonly events?: EventTally;
  // Absent until the welcome meeting is held or missed, and in saves from before it.
  readonly welcome?: WelcomeTally;
}

export interface DayReport {
  readonly day: number;
  readonly rating: Rating;
  readonly present: number;
  readonly beds: { readonly total: number; readonly taken: number };
  readonly arrived: number;
  readonly left: number;
  readonly reviews: number;
  // null when nobody wrote one.
  readonly meanReview: number | null;
  readonly money: Column;
  readonly balance: number;
  readonly loudest: readonly ThoughtTally[];
  readonly events?: EventTally;
  readonly welcome?: WelcomeTally;
}

export const HISTORY_DAYS = 14;

export const LOUDEST_KEPT = 3;

// Adding zero turns a -0 from rounding a tiny fall into a plain 0.
const oneDecimal = (value: number): number => Math.round(value * 10) / 10 + 0;

export function startDay(day: number): DayCounts {
  return { from: day, arrived: 0, left: 0, reviews: 0, reviewStars: 0 };
}

export function countArrivals(counts: DayCounts, arrived: number): DayCounts {
  return { ...counts, arrived: counts.arrived + arrived };
}

export function countDeparture(counts: DayCounts, left: number): DayCounts {
  return { ...counts, left: counts.left + left };
}

export function countReview(counts: DayCounts, stars: number): DayCounts {
  return { ...counts, reviews: counts.reviews + 1, reviewStars: counts.reviewStars + stars };
}

const NO_EVENTS: EventTally = { held: 0, audience: 0, called: 0 };

// Only a count that is not 0 is written, so a day with no fireworks reads as it always has.
function extra(key: 'fireworks' | 'postponed', before: EventTally, tally: EventTally) {
  const sum = (before[key] ?? 0) + (tally[key] ?? 0);
  return sum > 0 ? { [key]: sum } : {};
}

export function countEvent(counts: DayCounts, tally: EventTally): DayCounts {
  const before = counts.events ?? NO_EVENTS;
  return {
    ...counts,
    events: {
      held: before.held + tally.held,
      audience: before.audience + tally.audience,
      called: before.called + tally.called,
      ...extra('fireworks', before, tally),
      ...extra('postponed', before, tally),
    },
  };
}

const NO_WELCOME: WelcomeTally = { welcomed: 0, gap: null };

export function countWelcomed(counts: DayCounts, people: number): DayCounts {
  const before = counts.welcome ?? NO_WELCOME;
  return { ...counts, welcome: { ...before, welcomed: before.welcomed + people } };
}

// The first reason the day had is the one the report gives.
export function noteWelcomeGap(counts: DayCounts, gap: WelcomeGap): DayCounts {
  const before = counts.welcome ?? NO_WELCOME;
  return before.gap === null ? { ...counts, welcome: { ...before, gap } } : counts;
}

// Called after closeDay, so the day that just ended is the ledger's yesterday.
export function reportOf(parts: {
  readonly counts: DayCounts;
  readonly rating: Rating;
  readonly present: number;
  readonly beds: { readonly total: number; readonly taken: number };
  readonly ledger: Ledger;
  readonly thoughts: ReadonlyMap<string, ThoughtTally>;
}): DayReport {
  const { counts, ledger } = parts;
  return {
    day: counts.from,
    rating: parts.rating,
    present: parts.present,
    beds: parts.beds,
    arrived: counts.arrived,
    left: counts.left,
    reviews: counts.reviews,
    meanReview: counts.reviews > 0 ? oneDecimal(counts.reviewStars / counts.reviews) : null,
    money: ledger.yesterday,
    balance: ledger.balance,
    loudest: loudest(parts.thoughts, LOUDEST_KEPT),
    ...(counts.events ? { events: counts.events } : {}),
    ...(counts.welcome ? { welcome: counts.welcome } : {}),
  };
}

// Oldest first, the order the charts draw in.
export function keepDay(history: readonly DayReport[], report: DayReport): readonly DayReport[] {
  return [...history, report].slice(-HISTORY_DAYS);
}

export function starsTrend(history: readonly DayReport[]): number | null {
  const last = history.at(-1);
  const before = history.at(-2);
  if (!last || !before) return null;
  return oneDecimal(last.rating.stars - before.rating.stars);
}
