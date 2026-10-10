import { describe, expect, it } from 'vitest';
import { bedtimeOf, EARLY_WAKE_FROM, isBedtime, isEarlyRiser, occupiedShare } from './night';

const HOUR = 60;
const PARTIES = Array.from({ length: 50 }, (_, party) => party);

const wraps = (party: number): boolean => bedtimeOf(party).sleepAt > bedtimeOf(party).wakeAt;

describe('bedtimeOf', () => {
  it('puts every bedtime between seven and half past nine, and every waking between seven and nine', () => {
    for (const party of PARTIES.filter((each) => !isEarlyRiser(each))) {
      const { sleepAt, wakeAt } = bedtimeOf(party);
      expect(sleepAt, `party ${party}`).toBeGreaterThanOrEqual(19 * HOUR);
      expect(sleepAt, `party ${party}`).toBeLessThan(21.5 * HOUR);
      expect(wakeAt, `party ${party}`).toBeGreaterThanOrEqual(7 * HOUR);
      expect(wakeAt, `party ${party}`).toBeLessThan(9 * HOUR);
    }
  });

  it('wakes an early riser between five and half past, an hour before the sun', () => {
    const early = PARTIES.filter(isEarlyRiser);
    expect(early.length).toBeGreaterThan(0);
    for (const party of early) {
      const { sleepAt, wakeAt } = bedtimeOf(party);
      expect(sleepAt, `party ${party}`).toBeGreaterThanOrEqual(19 * HOUR);
      expect(wakeAt, `party ${party}`).toBeGreaterThanOrEqual(EARLY_WAKE_FROM);
      expect(wakeAt, `party ${party}`).toBeLessThan(5.5 * HOUR);
    }
  });

  it('gives the same party the same night every time it is asked', () => {
    for (const party of PARTIES) expect(bedtimeOf(party)).toEqual(bedtimeOf(party));
  });

  it('spreads the parties out rather than sending them all to bed at once', () => {
    const distinct = new Set(PARTIES.map((party) => bedtimeOf(party).sleepAt));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    expect(PARTIES.every(wraps)).toBe(true);
  });
});

describe('isEarlyRiser', () => {
  it('picks about one party in ten, the same ones every time', () => {
    const parties = Array.from({ length: 2000 }, (_, party) => party);
    const share = parties.filter(isEarlyRiser).length / parties.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.12);
    expect(parties.filter(isEarlyRiser)).toEqual(parties.filter(isEarlyRiser));
  });
});

describe('isBedtime', () => {
  it('sleeps through the night and is up for the day, across midnight', () => {
    for (const party of PARTIES.slice(0, 5)) {
      const { sleepAt, wakeAt } = bedtimeOf(party);
      expect(isBedtime(party, sleepAt - 1)).toBe(false);
      expect(isBedtime(party, sleepAt)).toBe(true);
      expect(isBedtime(party, sleepAt + 1)).toBe(true);
      expect(isBedtime(party, wakeAt - 1)).toBe(true);
      expect(isBedtime(party, wakeAt)).toBe(false);
      expect(isBedtime(party, wakeAt + 1)).toBe(false);
      expect(isBedtime(party, 12 * HOUR)).toBe(false);
      expect(isBedtime(party, 3 * HOUR)).toBe(true);
    }
  });

  it('is true at tick 0 for a party who went to bed before midnight', () => {
    expect(isBedtime(PARTIES[0]!, 0)).toBe(true);
  });

  it('wraps a tick from outside the day onto it', () => {
    const { sleepAt } = bedtimeOf(PARTIES[0]!);
    expect(isBedtime(PARTIES[0]!, sleepAt + 24 * HOUR)).toBe(true);
    expect(isBedtime(PARTIES[0]!, sleepAt - 24 * HOUR)).toBe(true);
  });

  it('keeps a party up late out of bed, and sends it once that ends', () => {
    const party = 3;
    const late = bedtimeOf(party).sleepAt + 10;
    expect(isBedtime(party, late)).toBe(true);
    expect(isBedtime(party, late, true)).toBe(false);
    expect(isBedtime(party, late, false)).toBe(true);
  });
});

describe('occupiedShare', () => {
  it('is zero on a plot with no beds at all', () => {
    expect(occupiedShare(0, 0)).toBe(0);
    expect(occupiedShare(0, 5)).toBe(0);
  });

  it('is the share of beds slept in', () => {
    expect(occupiedShare(40, 10)).toBe(0.25);
    expect(occupiedShare(682, 682)).toBe(1);
  });

  it('never lights more than every room', () => {
    expect(occupiedShare(10, 12)).toBe(1);
  });

  it('treats a negative count as nobody', () => {
    expect(occupiedShare(-4, 2)).toBe(0);
    expect(occupiedShare(10, -3)).toBe(0);
  });
});
