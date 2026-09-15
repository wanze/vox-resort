import { describe, expect, it } from 'vitest';
import { bedtimeOf, isBedtime, occupiedShare } from './night';

const HOUR = 60;
const PARTIES = Array.from({ length: 50 }, (_, party) => party);

/** Whether a party's window runs over midnight. */
const wraps = (party: number): boolean => bedtimeOf(party).sleepAt > bedtimeOf(party).wakeAt;

describe('bedtimeOf', () => {
  it('puts every bedtime between seven and half past nine, and every waking between seven and nine', () => {
    for (const party of PARTIES) {
      const { sleepAt, wakeAt } = bedtimeOf(party);
      expect(sleepAt, `party ${party}`).toBeGreaterThanOrEqual(19 * HOUR);
      expect(sleepAt, `party ${party}`).toBeLessThan(21.5 * HOUR);
      expect(wakeAt, `party ${party}`).toBeGreaterThanOrEqual(7 * HOUR);
      expect(wakeAt, `party ${party}`).toBeLessThan(9 * HOUR);
    }
  });

  it('gives the same party the same night every time it is asked', () => {
    for (const party of PARTIES) expect(bedtimeOf(party)).toEqual(bedtimeOf(party));
  });

  it('spreads the parties out rather than sending them all to bed at once', () => {
    const distinct = new Set(PARTIES.map((party) => bedtimeOf(party).sleepAt));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    // Every bedtime is in the evening now, so every night runs over midnight.
    expect(PARTIES.every(wraps)).toBe(true);
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
