import { describe, expect, it } from 'vitest';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import {
  ageHappiness,
  ARRIVAL_MOOD,
  createHappiness,
  DRIFT_PER_HOUR,
  meanHappiness,
  QUEUE_COST_PER_HOUR,
  type Happiness,
} from './happiness';
import { createNeeds, NEEDS, type Needs } from './needs';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 60 }];

const guestsOf = (count = 40): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

const needsAt = (guests: Guests, level: number): Needs => {
  const needs = createNeeds(guests, 7);
  for (const need of NEEDS) needs.level[need].fill(level);
  return needs;
};

const NO_QUEUE = (): boolean => false;
const ALL_QUEUED = (): boolean => true;

const HOUR = 60;

const moodOf = (happiness: Happiness, person: number): number => happiness.level[person]!;

describe('ageHappiness', () => {
  it('drifts a guest whose needs are all met up towards content', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    const needs = needsAt(guests, 1);
    ageHappiness(happiness, needs, guests, NO_QUEUE, HOUR);
    expect(moodOf(happiness, 0)).toBeCloseTo(ARRIVAL_MOOD + DRIFT_PER_HOUR);

    ageHappiness(happiness, needs, guests, NO_QUEUE, 24 * HOUR);
    expect(moodOf(happiness, 0)).toBe(1);
  });

  it('drifts a guest whose needs are empty down towards nothing', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    const needs = needsAt(guests, 0);
    ageHappiness(happiness, needs, guests, NO_QUEUE, HOUR);
    expect(moodOf(happiness, 0)).toBeCloseTo(ARRIVAL_MOOD - DRIFT_PER_HOUR);
    ageHappiness(happiness, needs, guests, NO_QUEUE, 24 * HOUR);
    expect(moodOf(happiness, 0)).toBe(0);
  });

  it('costs an hour in a line more than the same hour spent walking', () => {
    const guests = guestsOf();
    const needs = needsAt(guests, ARRIVAL_MOOD);
    const queueing = createHappiness(guests.count);
    const walking = createHappiness(guests.count);
    ageHappiness(queueing, needs, guests, (person) => person === 0, HOUR);
    ageHappiness(walking, needs, guests, NO_QUEUE, HOUR);

    expect(moodOf(queueing, 0)).toBeLessThan(moodOf(walking, 0));
    expect(moodOf(walking, 0) - moodOf(queueing, 0)).toBeCloseTo(QUEUE_COST_PER_HOUR);
    expect(moodOf(queueing, 1)).toBeCloseTo(moodOf(walking, 1));
  });

  it('never lets a mood leave 0..1, however long it runs or how hard it is pushed', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, 1), guests, ALL_QUEUED, 100 * HOUR);
    expect(moodOf(happiness, 0)).toBe(0);
    ageHappiness(happiness, needsAt(guests, 1), guests, NO_QUEUE, 100 * HOUR);
    expect(moodOf(happiness, 0)).toBe(1);
    for (const level of Array.from(happiness.level)) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
    ageHappiness(happiness, needsAt(guests, 0), guests, NO_QUEUE, 0);
    expect(moodOf(happiness, 0)).toBe(1);
  });

  it('leaves a body nobody is in alone, and counts nobody who is not there', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    guests.present[0] = 0;
    happiness.level[0] = 0.123;

    ageHappiness(happiness, needsAt(guests, 0), guests, NO_QUEUE, 10 * HOUR);
    expect(moodOf(happiness, 0), 'a body waiting to be filled is not aged').toBeCloseTo(0.123);

    const mean = meanHappiness(happiness, guests)!;
    expect(mean).toBeCloseTo(moodOf(happiness, 1));
    for (let person = 0; person < guests.count; person++) guests.present[person] = 0;
    expect(meanHappiness(happiness, guests), 'an empty plot has no mean').toBeNull();
  });
});
