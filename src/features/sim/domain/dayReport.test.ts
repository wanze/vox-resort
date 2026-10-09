import { describe, expect, it } from 'vitest';
import {
  countArrivals,
  countDeparture,
  countEvent,
  countPhoto,
  countReview,
  countWelcomed,
  HISTORY_DAYS,
  keepDay,
  LOUDEST_KEPT,
  noteWelcomeGap,
  PHOTO_SPOTS_KEPT,
  reportOf,
  SPOTS_TRACKED,
  startDay,
  starsTrend,
  type DayCounts,
  type DayReport,
} from './dayReport';
import { closeDay, createLedger, record } from './ledger';
import type { Rating } from './rating';
import { createDay, tallyInto } from './thoughts';

const RATING: Rating = { stars: 3.8, happiness: 0.7, housed: 0.9, cleanliness: 0.8 };

const reportFor = (counts: DayCounts, thoughts = createDay()): DayReport =>
  reportOf({
    counts,
    rating: RATING,
    present: 42,
    beds: { total: 60, taken: 40 },
    ledger: createLedger('tycoon', 1000),
    thoughts,
  });

const dayRated = (day: number, stars: number): DayReport => ({
  ...reportFor(startDay(day)),
  day,
  rating: { ...RATING, stars },
});

describe('the day counts', () => {
  it('start at nothing, on the day they are given', () => {
    expect(startDay(7)).toEqual({ from: 7, arrived: 0, left: 0, reviews: 0, reviewStars: 0 });
  });

  it('add arrivals, departures and reviews, each into a new count', () => {
    const start = startDay(2);
    const counted = countReview(
      countReview(countDeparture(countArrivals(countArrivals(start, 4), 3), 5), 4),
      2,
    );
    expect(counted).toEqual({ from: 2, arrived: 7, left: 5, reviews: 2, reviewStars: 6 });
    expect(start.arrived).toBe(0);
  });

  it('add up the events held, their audience and those called off', () => {
    const start = startDay(2);
    const counted = countEvent(countEvent(start, { held: 1, audience: 34, called: 0 }), {
      held: 0,
      audience: 0,
      called: 1,
    });
    expect(counted.events).toEqual({ held: 1, audience: 34, called: 1 });
    expect(start.events).toBeUndefined();
  });

  it('add up the fireworks and the shows moved, writing them only once there are some', () => {
    const fireworks = countEvent(startDay(2), { held: 1, audience: 120, called: 0, fireworks: 1 });
    const moved = countEvent(fireworks, { held: 0, audience: 0, called: 0, postponed: 1 });
    expect(moved.events).toEqual({ held: 1, audience: 120, called: 0, fireworks: 1, postponed: 1 });
    expect(countEvent(startDay(2), { held: 1, audience: 3, called: 0 }).events).not.toHaveProperty(
      'fireworks',
    );
  });
});

describe('reportOf', () => {
  it('takes the money from the day the books just closed, not from the new one', () => {
    const ended = closeDay(record(createLedger('tycoon', 1000), 'visit', 240));
    const report = reportOf({
      counts: startDay(3),
      rating: RATING,
      present: 42,
      beds: { total: 60, taken: 40 },
      ledger: record(ended, 'build', -90),
      thoughts: createDay(),
    });
    expect(report.money.visit).toBe(240);
    expect(report.money.build).toBe(0);
    expect(report.balance).toBe(1150);
    expect(report.day).toBe(3);
  });

  it('has no mean review on a day nobody wrote one', () => {
    expect(reportFor(startDay(0)).meanReview).toBeNull();
  });

  it('rounds the mean review to a tenth of a star', () => {
    const reviewed = countReview(countReview(countReview(startDay(0), 4), 4), 3);
    expect(reportFor(reviewed).meanReview).toBe(3.7);
  });

  it('carries the events over, and nothing on a day without any', () => {
    const counted = countEvent(startDay(0), { held: 2, audience: 61, called: 0 });
    expect(reportFor(counted).events).toEqual({ held: 2, audience: 61, called: 0 });
    expect(reportFor(startDay(0))).not.toHaveProperty('events');
  });

  it('counts the welcomed, and carries them over only on a day that had a welcome', () => {
    const counted = countWelcomed(countWelcomed(startDay(0), 12), 9);
    expect(reportFor(counted).welcome).toEqual({ welcomed: 21, gap: null });
    expect(reportFor(startDay(0))).not.toHaveProperty('welcome');
  });

  it('keeps the first reason a welcome was missed', () => {
    const noted = noteWelcomeGap(noteWelcomeGap(startDay(0), 'called-off'), 'no-stage');
    expect(noted.welcome).toEqual({ welcomed: 0, gap: 'called-off' });
  });

  it('keeps only the loudest three thoughts', () => {
    const thoughts = createDay();
    for (const subject of ['Bar', 'Pool', 'Slide', 'Café']) tallyInto(thoughts, 'filthy', subject);
    expect(reportFor(startDay(0), thoughts).loudest).toHaveLength(LOUDEST_KEPT);
  });
});

describe('keepDay', () => {
  it('keeps the last fourteen days, oldest first', () => {
    let history: readonly DayReport[] = [];
    for (let day = 0; day < 20; day++) history = keepDay(history, dayRated(day, 3));
    expect(history).toHaveLength(HISTORY_DAYS);
    expect(history[0]!.day).toBe(6);
    expect(history.at(-1)!.day).toBe(19);
  });
});

describe('starsTrend', () => {
  it('has no trend before a second report, and a signed one after', () => {
    expect(starsTrend([])).toBeNull();
    expect(starsTrend([dayRated(0, 3)])).toBeNull();
    expect(starsTrend([dayRated(0, 3.6), dayRated(1, 3.8)])).toBe(0.2);
    expect(starsTrend([dayRated(0, 3.8), dayRated(1, 3.1)])).toBe(-0.7);
    expect(starsTrend([dayRated(0, 3.8), dayRated(1, 3.8)])).toBe(0);
  });
});

const shot = (key: string, minute = 600) => ({
  key,
  subject: key,
  kind: 'sight' as const,
  x: minute,
  y: 2,
  z: 3,
  heading: 0,
  minute,
});

const photographed = (keys: readonly string[]): DayCounts =>
  keys.reduce((counts, key) => countPhoto(counts, shot(key)), startDay(0));

describe('the photos of the day', () => {
  it('merges photos of one spot and keeps the latest viewpoint', () => {
    const counts = countPhoto(
      countPhoto(startDay(0), shot('fountain', 600)),
      shot('fountain', 720),
    );
    expect(counts.photos).toEqual({ taken: 2, spots: [{ ...shot('fountain', 720), count: 2 }] });
  });

  it('drops the least photographed spot past the cap, the earliest on a tie', () => {
    const keys = Array.from({ length: SPOTS_TRACKED }, (_, at) => `spot-${at}`);
    const counts = photographed(['spot-0', ...keys, 'late']);
    const tracked = counts.photos!.spots.map((spot) => spot.key);
    expect(tracked).toHaveLength(SPOTS_TRACKED);
    expect(tracked).toContain('spot-0');
    expect(tracked).not.toContain('spot-1');
    expect(tracked.at(-1)).toBe('late');
    expect(counts.photos!.taken).toBe(SPOTS_TRACKED + 2);
  });

  it('reports the three most photographed, by count and then key', () => {
    const report = reportFor(photographed(['b', 'a', 'c', 'd', 'c', 'd', 'b']));
    expect(report.photos!.spots.map((spot) => spot.key)).toEqual(['b', 'c', 'd']);
    expect(report.photos!.spots).toHaveLength(PHOTO_SPOTS_KEPT);
    expect(report.photos!.taken).toBe(7);
  });

  it('has no photos key on a day nobody took one', () => {
    expect('photos' in startDay(3)).toBe(false);
    expect('photos' in reportFor(startDay(3))).toBe(false);
  });
});
