import { describe, expect, it } from 'vitest';
import { GUEST_NEEDS } from '../../../../voxel-gen/voxelgen.ts';
import { createGuests, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import {
  ageHappiness,
  ARRIVAL_MOOD,
  CONTENT_LEVEL,
  contentmentOf,
  createHappiness,
  DRIFT_PER_HOUR,
  HURT_FLOOR,
  meanHappiness,
  QUEUE_COST_PER_HOUR,
  remember,
  restoreHappiness,
  snapshotHappiness,
  STAY_MEMORY_HOURS,
  SURROUNDINGS_SHARE,
  welcome,
  type Happiness,
} from './happiness';
import { createNeeds, type Needs } from './needs';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 60 }];

const guestsOf = (count = 40): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

const needsAt = (guests: Guests, level: number): Needs => {
  const needs = createNeeds(guests, 7);
  for (const need of GUEST_NEEDS) needs.level[need].fill(level);
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

describe('ageHappiness with surroundings', () => {
  it('changes nothing at all when the surroundings are left out', () => {
    const guests = guestsOf();
    const needs = needsAt(guests, 0.4);
    const omitted = createHappiness(guests.count);
    const neutral = createHappiness(guests.count);
    for (let step = 0; step < 5; step++) {
      ageHappiness(omitted, needs, guests, (person) => person % 3 === 0, 7);
      ageHappiness(
        neutral,
        needs,
        guests,
        (person) => person % 3 === 0,
        7,
        () => 0,
      );
    }
    expect(Array.from(omitted.level)).toEqual(Array.from(neutral.level));
  });

  it('settles a guest with every need met in fine surroundings at 1, never past it', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, 1), guests, NO_QUEUE, 100 * HOUR, () => 1);
    expect(moodOf(happiness, 0)).toBe(1);
  });

  it('settles a guest in the worst surroundings the share below their contentment', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, 0.4), guests, NO_QUEUE, 100 * HOUR, () => -1);
    expect(moodOf(happiness, 0)).toBeCloseTo(0.4 / CONTENT_LEVEL - SURROUNDINGS_SHARE);
  });
});

describe('a hurt guest', () => {
  it('is exactly as content as before health existed while nobody is hurt', () => {
    const guests = guestsOf();
    const needs = createNeeds(guests, 7);
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needs, guests, NO_QUEUE, HOUR * 30);
    for (let person = 0; person < guests.count; person++) {
      if (guests.present[person] !== 1) continue;
      let shortfall = 0;
      for (const need of GUEST_NEEDS) {
        shortfall += (1 - Math.min(1, needs.level[need][person]! / CONTENT_LEVEL)) ** 2;
      }
      const wants = 1 - Math.sqrt(shortfall / GUEST_NEEDS.length);
      expect(moodOf(happiness, person)).toBeCloseTo(wants, 6);
    }
  });

  it('is at best half as content as their wants say at the worst', () => {
    const guests = guestsOf();
    const needs = needsAt(guests, 0.4);
    needs.level.health.fill(0);
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needs, guests, NO_QUEUE, HOUR * 30);
    const present = [...guests.present.keys()].find((person) => guests.present[person] === 1)!;
    expect(moodOf(happiness, present)).toBeCloseTo((0.4 / CONTENT_LEVEL) * HURT_FLOOR);
    expect(HURT_FLOOR).toBe(0.5);
  });
});

describe('how content the needs make a guest', () => {
  const guests = guestsOf();
  const person = 0;
  const levels = (each: Partial<Record<(typeof GUEST_NEEDS)[number], number>>, rest = 1) => {
    const needs = needsAt(guests, rest);
    for (const [need, level] of Object.entries(each)) needs.level[need as 'fun'][person] = level;
    return needs;
  };

  it('counts a need half full as met, so a guest served well enough is fully content', () => {
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, CONTENT_LEVEL), guests, NO_QUEUE, 30 * HOUR);
    expect(moodOf(happiness, 0)).toBe(1);
  });

  it('costs more for one need run dry than for every need a little low', () => {
    const oneDry = contentmentOf(levels({ hunger: 0 }), person);
    const allLow = contentmentOf(needsAt(guests, CONTENT_LEVEL * 0.6), person);
    expect(oneDry).toBeLessThan(allLow);
    expect(oneDry).toBeCloseTo(1 - Math.sqrt(1 / GUEST_NEEDS.length));
  });

  it('drops further with every need that runs dry', () => {
    const one = contentmentOf(levels({ hunger: 0 }), person);
    const two = contentmentOf(levels({ hunger: 0, thirst: 0 }), person);
    const all = contentmentOf(needsAt(guests, 0), person);
    expect(two).toBeLessThan(one);
    expect(all).toBe(0);
  });
});

describe('the mood of a stay', () => {
  it('follows the mood slowly, so one bad hour barely moves it', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, 0), guests, NO_QUEUE, HOUR);
    const hour = happiness.stay[0]!;
    expect(hour).toBeLessThan(ARRIVAL_MOOD);
    expect(hour).toBeGreaterThan(moodOf(happiness, 0));
    ageHappiness(happiness, needsAt(guests, 0), guests, NO_QUEUE, 4 * STAY_MEMORY_HOURS * HOUR);
    expect(happiness.stay[0]!).toBeLessThan(0.05);
  });

  it('starts afresh for the next guest in the same body', () => {
    const guests = guestsOf();
    const happiness = createHappiness(guests.count);
    ageHappiness(happiness, needsAt(guests, 0), guests, NO_QUEUE, 30 * HOUR);
    welcome(happiness, 0);
    expect(moodOf(happiness, 0)).toBeCloseTo(ARRIVAL_MOOD);
    expect(happiness.stay[0]!).toBeCloseTo(ARRIVAL_MOOD);
  });

  it('settles a lifted guest higher, and the stay follows', () => {
    const guests = guestsOf();
    const plain = createHappiness(guests.count);
    const lifted = createHappiness(guests.count);
    ageHappiness(plain, needsAt(guests, 0.4), guests, NO_QUEUE, 100 * HOUR);
    ageHappiness(lifted, needsAt(guests, 0.4), guests, NO_QUEUE, 100 * HOUR, undefined, () => 0.1);
    expect(moodOf(lifted, 0)).toBeCloseTo(moodOf(plain, 0) + 0.1);
    expect(lifted.stay[0]!).toBeGreaterThan(plain.stay[0]! + 0.05);
  });
});

describe('remember', () => {
  it('adds to the stay and nothing else, up to full', () => {
    const happiness = createHappiness(3);
    remember(happiness, 1, 0.08);
    expect(happiness.stay[1]).toBeCloseTo(ARRIVAL_MOOD + 0.08);
    expect(happiness.level[1]).toBeCloseTo(ARRIVAL_MOOD);
    expect(happiness.stay[0]).toBeCloseTo(ARRIVAL_MOOD);
    remember(happiness, 1, 5);
    expect(happiness.stay[1]).toBe(1);
    remember(happiness, 7, 0.1);
    remember(happiness, -1, 0.1);
    expect([...happiness.stay].filter((each) => each !== 1)).toHaveLength(2);
  });
});

describe('a guest who expects more', () => {
  it('settles lower on the same needs', () => {
    const guests = guestsOf();
    const easy = createHappiness(guests.count);
    const hard = createHappiness(guests.count);
    welcome(hard, 0, 1);
    ageHappiness(easy, needsAt(guests, 0.6), guests, NO_QUEUE, 30 * HOUR);
    ageHappiness(hard, needsAt(guests, 0.6), guests, NO_QUEUE, 30 * HOUR);
    expect(moodOf(easy, 0)).toBe(1);
    expect(moodOf(hard, 0)).toBeLessThan(moodOf(easy, 0));
    expect(moodOf(hard, 1)).toBe(1);
  });

  it('is measured exactly as before at no expectation', () => {
    const needs = needsAt(guestsOf(), 0.3);
    needs.level.hunger[0] = 0;
    expect(contentmentOf(needs, 0, 0)).toBe(contentmentOf(needs, 0));
    let shortfall = 0;
    for (const need of GUEST_NEEDS) {
      shortfall += (1 - Math.min(1, needs.level[need][0]! / CONTENT_LEVEL)) ** 2;
    }
    const wants = 1 - Math.sqrt(shortfall / GUEST_NEEDS.length);
    const health = needs.level.health[0]!;
    expect(contentmentOf(needs, 0)).toBe(wants * (HURT_FLOOR + (1 - HURT_FLOOR) * health));
  });

  it('minds an hour in a line twice as much at the most', () => {
    const guests = guestsOf();
    const needs = needsAt(guests, ARRIVAL_MOOD);
    const easy = createHappiness(guests.count);
    const hard = createHappiness(guests.count);
    welcome(hard, 0, 1);
    ageHappiness(easy, needs, guests, ALL_QUEUED, HOUR / 4);
    ageHappiness(hard, needs, guests, ALL_QUEUED, HOUR / 4);
    const settled = ARRIVAL_MOOD + DRIFT_PER_HOUR / 4;
    expect(settled - moodOf(hard, 0)).toBeCloseTo(2 * (settled - moodOf(easy, 0)));
  });

  it('is set at check-in, and easy-going unless told otherwise', () => {
    const happiness = createHappiness(3);
    welcome(happiness, 1, 0.4);
    expect(happiness.expects[1]).toBeCloseTo(0.4);
    welcome(happiness, 1);
    expect(happiness.expects[1]).toBe(0);
  });

  it('restores easy-going from a snapshot without it, and pads a shorter one', () => {
    const happiness = createHappiness(4);
    happiness.expects.fill(0.5);
    const { expects: _expects, ...before } = snapshotHappiness(happiness);
    restoreHappiness(happiness, before);
    expect([...happiness.expects]).toEqual([0, 0, 0, 0]);

    const saved = snapshotHappiness(createHappiness(4));
    happiness.expects.fill(0.5);
    restoreHappiness(happiness, { ...saved, expects: new Float32Array([0.25, 0.75]) });
    expect([...happiness.expects]).toEqual([0.25, 0.75, 0, 0]);
  });
});
