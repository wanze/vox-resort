import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from './simClock';
import { busiestOf, createVenueUse, noteUse } from './venueUse';
import type { Venue } from './venues';

const venueAt = (key: string): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
  capacity: 10,
  dwellSeconds: { min: 600, max: 600 },
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

const HOUR = TICKS_PER_DAY / 24;

describe('noteUse', () => {
  const venues = [venueAt('cafe#0')];

  it('keeps the busiest hour of the day', () => {
    const use = createVenueUse();
    noteUse(use, venues, () => 12, 13 * HOUR);
    noteUse(use, venues, () => 2, 16 * HOUR);
    noteUse(use, venues, () => 5, 23 * HOUR);
    expect(busiestOf(use).get('cafe#0')).toBe(12);
  });

  it('forgets an hour once a day has gone by since it', () => {
    const use = createVenueUse();
    noteUse(use, venues, () => 12, 13 * HOUR);
    noteUse(use, venues, () => 2, 13 * HOUR + TICKS_PER_DAY - 1);
    expect(busiestOf(use).get('cafe#0')).toBe(12);
    noteUse(use, venues, () => 2, 13 * HOUR + TICKS_PER_DAY);
    expect(busiestOf(use).get('cafe#0')).toBe(2);
  });

  it('clears every hour skipped in one step', () => {
    const use = createVenueUse();
    noteUse(use, venues, () => 12, 13 * HOUR);
    noteUse(use, venues, () => 1, 3 * TICKS_PER_DAY);
    expect(busiestOf(use).get('cafe#0')).toBe(1);
  });

  it('starts over when the clock runs backwards, as on a load', () => {
    const use = createVenueUse();
    noteUse(use, venues, () => 12, 2 * TICKS_PER_DAY);
    noteUse(use, venues, () => 3, TICKS_PER_DAY);
    expect(busiestOf(use).get('cafe#0')).toBe(3);
  });

  it('reads each venue by its own index', () => {
    const use = createVenueUse();
    noteUse(use, [venueAt('cafe#0'), venueAt('cafe#1')], (venue) => venue * 5, 0);
    expect(busiestOf(use)).toEqual(
      new Map([
        ['cafe#0', 0],
        ['cafe#1', 5],
      ]),
    );
  });

  it('forgets a venue that was pulled down and keeps one that only moved index', () => {
    const use = createVenueUse();
    noteUse(use, [venueAt('cafe#0'), venueAt('cafe#1')], (venue) => 4 + venue * 4, 0);
    noteUse(use, [venueAt('cafe#1')], () => 0, 1);
    expect(busiestOf(use)).toEqual(new Map([['cafe#1', 8]]));
  });
});
