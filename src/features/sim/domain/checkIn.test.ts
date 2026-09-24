import { describe, expect, it } from 'vitest';
import {
  bedCount,
  checkOutParty,
  createGuests,
  presentCount,
  type Guests,
} from '../../guests/domain/guests';
import { NO_HOME, type Home } from '../../guests/domain/homes';
import { createRandom } from '../../layout/domain/random';
import {
  ARRIVAL_WAVES,
  arrivalsDueBy,
  CHECK_IN_TICK,
  checkInDue,
  runCheckIn,
  wavesDue,
} from './checkIn';
import { ARRIVAL_MOOD, createHappiness } from './happiness';
import { createNeeds, NEEDS, START_LEVEL } from './needs';
import { ratingFor, type Rating } from './rating';
import { TICKS_PER_DAY } from './simClock';

const HOMES: readonly Home[] = [
  { key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 },
  { key: 'villa#0', id: 'villa', label: 'Villa', beds: 8 },
  { key: 'bungalow#0', id: 'bungalow', label: 'Bungalow', beds: 4 },
];

const guestsOf = (count = 40): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

const FIVE_STARS: Rating = ratingFor({ happiness: 1, present: 10, housed: 10 });
const NO_STARS: Rating = ratingFor({ happiness: 0, present: 10, housed: 0, cleanliness: 0 });

const emptied = (guests: Guests): Guests => {
  for (let party = 0; party < guests.parties.length; party++) checkOutParty(guests, party);
  return guests;
};

const dayOf = (guests: Guests, rating: Rating, day = 4) => {
  const needs = createNeeds(guests, 7);
  const happiness = createHappiness(guests.count);
  // Zeroed first so a level read back was really written on arrival, not left over.
  for (const need of NEEDS) needs.level[need].fill(0);
  happiness.level.fill(0);
  const arrived = runCheckIn({
    guests,
    needs,
    happiness,
    rating,
    day,
    random: createRandom(31),
  });
  return { arrived, needs, happiness };
};

describe('checkInDue', () => {
  it('fires once over a run of ticks that steps across the hour', () => {
    let fired = 0;
    for (let from = 0; from < TICKS_PER_DAY; from += 12)
      fired += checkInDue(from, from + 11) ? 1 : 0;
    expect(fired).toBe(1);

    expect(checkInDue(CHECK_IN_TICK, CHECK_IN_TICK)).toBe(true);
    expect(checkInDue(CHECK_IN_TICK - 1, CHECK_IN_TICK - 1)).toBe(false);
    expect(checkInDue(CHECK_IN_TICK + 1, CHECK_IN_TICK + 1)).toBe(false);
    expect(checkInDue(CHECK_IN_TICK, CHECK_IN_TICK - 1)).toBe(false);
  });

  it('fires once a day, and cannot be stepped over by a long run', () => {
    expect(checkInDue(0, TICKS_PER_DAY - 1)).toBe(true);
    expect(checkInDue(TICKS_PER_DAY, 2 * TICKS_PER_DAY - 1)).toBe(true);
    let fired = 0;
    for (let day = 0; day < 5; day++) {
      for (let from = day * TICKS_PER_DAY; from < (day + 1) * TICKS_PER_DAY; from += 7) {
        fired += checkInDue(from, from + 6) ? 1 : 0;
      }
    }
    expect(fired).toBe(5);
  });
});

describe('wavesDue', () => {
  const DAY = 3 * TICKS_PER_DAY;

  it('finds a wave inside a run of ticks that steps across it', () => {
    expect(wavesDue(DAY + 14 * 60 - 5, DAY + 14 * 60 + 6)).toEqual([1]);
    expect(wavesDue(DAY + CHECK_IN_TICK, DAY + CHECK_IN_TICK)).toEqual([0]);
  });

  it('finds every wave in a long run, and none between them', () => {
    expect(wavesDue(DAY + 10 * 60, DAY + 18 * 60)).toEqual([0, 1, 2]);
    expect(wavesDue(DAY + 12 * 60, DAY + 13 * 60)).toEqual([]);
    expect(wavesDue(DAY + 18 * 60, DAY + TICKS_PER_DAY + 10 * 60)).toEqual([]);
  });

  it('shares out the whole day, the first wave the largest', () => {
    const shares = ARRIVAL_WAVES.map((wave) => wave.share);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
    expect(Math.max(...shares)).toBe(shares[0]);
    expect(ARRIVAL_WAVES[0]!.tick).toBe(CHECK_IN_TICK);
  });

  it('counts the arrivals due by each wave, and all of them by the last', () => {
    expect([0, 1, 2].map((wave) => arrivalsDueBy(100, wave))).toEqual([50, 80, 100]);
    expect(arrivalsDueBy(7, 2)).toBe(7);
    expect(arrivalsDueBy(0, 1)).toBe(0);
  });
});

describe('runCheckIn', () => {
  it('takes nobody at all at nothing out of five', () => {
    const guests = emptied(guestsOf());
    const { arrived } = dayOf(guests, NO_STARS);
    expect(arrived).toEqual([]);
    expect(presentCount(guests)).toBe(0);
  });

  it('stops at the beds standing free, and houses everybody it takes', () => {
    const guests = emptied(guestsOf(200));
    const beds = bedCount(guests).beds;
    for (let day = 0; day < 40; day++) {
      const { arrived } = dayOf(guests, FIVE_STARS, day);
      for (const person of arrived) {
        expect(guests.home[person], 'nobody is checked in without a bed').not.toBe(NO_HOME);
      }
      const taken = bedCount(guests).taken;
      expect(taken).toBeLessThanOrEqual(beds);
      expect(presentCount(guests)).toBe(taken);
    }
    expect(bedCount(guests).taken).toBeGreaterThan(beds / 2);
    expect(dayOf(guests, FIVE_STARS, 41).arrived.length).toBeLessThanOrEqual(2);
  });

  it('gives every arrival fresh needs and a fresh mood, in the body somebody else left', () => {
    const guests = emptied(guestsOf());
    const child = Array.from(guests.child);
    const { arrived, needs, happiness } = dayOf(guests, FIVE_STARS, 9);

    expect(arrived.length).toBeGreaterThan(0);
    for (const person of arrived) {
      expect(happiness.level[person]).toBeCloseTo(ARRIVAL_MOOD);
      for (const need of NEEDS) {
        expect(needs.level[need][person]).toBeGreaterThanOrEqual(START_LEVEL.min);
        expect(needs.level[need][person]).toBeLessThanOrEqual(START_LEVEL.max);
      }
      expect(guests.arrivedOn[person]).toBe(9);
      expect(guests.present[person]).toBe(1);
    }
    const missed = Array.from({ length: guests.count }, (_, i) => i).find(
      (i) => !arrived.includes(i),
    )!;
    expect(happiness.level[missed]).toBe(0);
    expect(Array.from(guests.child)).toEqual(child);
  });
});
