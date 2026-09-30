import { describe, expect, it } from 'vitest';
import {
  brokenFirst,
  carryBreakdowns,
  createBreakdowns,
  isBroken,
  repair,
  restoreBreakdowns,
  snapshotBreakdowns,
  wear,
} from './breakdowns';
import { breakdownsSnapshotSchema } from './resortSnapshot';

const SALT = 0x1234_5678;

// Repaired as soon as it breaks, so every visit is a fresh chance.
const breaksIn = (reliability: number | undefined, salt: number, visits: number): number[] => {
  const breakdowns = createBreakdowns(1);
  const at: number[] = [];
  for (let visit = 0; visit < visits; visit++) {
    if (!wear(breakdowns, 0, reliability, salt, visit)) continue;
    at.push(visit);
    repair(breakdowns, 0);
  }
  return at;
};

describe('wear', () => {
  it('never breaks a venue that declares no reliability', () => {
    expect(breaksIn(undefined, SALT, 10_000)).toEqual([]);
  });

  it('breaks about once in as many visits as the reliability says', () => {
    for (const salt of [SALT, 7, -99_001]) {
      const breaks = breaksIn(100, salt, 10_000);
      expect(breaks.length).toBeGreaterThan(0);
      const mean = 10_000 / breaks.length;
      expect(mean, `salt ${salt}`).toBeGreaterThan(70);
      expect(mean, `salt ${salt}`).toBeLessThan(130);
    }
  });

  it('draws the same breakdowns from the same salt, and others from another', () => {
    expect(breaksIn(50, SALT, 2000)).toEqual(breaksIn(50, SALT, 2000));
    expect(breaksIn(50, SALT, 2000)).not.toEqual(breaksIn(50, SALT + 1, 2000));
  });

  it('leaves a broken venue broken, and does not report it again', () => {
    const breakdowns = createBreakdowns(2);
    let visit = 0;
    while (!wear(breakdowns, 1, 5, SALT, 100 + visit)) visit++;
    const brokeAt = breakdowns.since[1];
    for (let more = 0; more < 200; more++) {
      expect(wear(breakdowns, 1, 5, SALT, 1000 + more)).toBe(false);
    }
    expect(isBroken(breakdowns, 1)).toBe(true);
    expect(breakdowns.since[1]).toBe(brokeAt);
    expect(isBroken(breakdowns, 0)).toBe(false);
  });
});

describe('repair', () => {
  it('puts a broken venue back in service', () => {
    const breakdowns = createBreakdowns(1);
    breakdowns.broken[0] = 1;
    breakdowns.since[0] = 40;
    repair(breakdowns, 0);
    expect(isBroken(breakdowns, 0)).toBe(false);
    repair(breakdowns, 5);
    expect(breakdowns.broken).toHaveLength(1);
  });
});

describe('isBroken', () => {
  it('calls a venue it has no entry for sound, as the beach past the list is', () => {
    const breakdowns = createBreakdowns(2);
    breakdowns.broken.fill(1);
    expect(isBroken(breakdowns, 2)).toBe(false);
    expect(isBroken(breakdowns, -1)).toBe(false);
    expect(wear(breakdowns, 2, 1, SALT, 0)).toBe(false);
  });
});

describe('brokenFirst', () => {
  it('takes the venue that has been down longest among those it may', () => {
    const breakdowns = createBreakdowns(4);
    breakdowns.broken.set([1, 1, 0, 1]);
    breakdowns.since.set([50, 10, 0, 10]);
    expect(brokenFirst(breakdowns, () => true)).toBe(1);
    expect(brokenFirst(breakdowns, (venue) => venue !== 1)).toBe(3);
    expect(brokenFirst(breakdowns, (venue) => venue === 0)).toBe(0);
    expect(brokenFirst(breakdowns, (venue) => venue === 2)).toBe(-1);
  });

  it('answers -1 when nothing is broken', () => {
    expect(brokenFirst(createBreakdowns(3), () => true)).toBe(-1);
  });
});

describe('carryBreakdowns', () => {
  it('keeps what was broken by key and starts new venues sound', () => {
    const before = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    const breakdowns = createBreakdowns(3);
    breakdowns.broken.set([0, 1, 1]);
    breakdowns.since.set([0, 30, 60]);
    breakdowns.worn.set([5, 9, 12]);
    const after = [{ key: 'c' }, { key: 'new' }, { key: 'a' }];
    const carried = carryBreakdowns(breakdowns, before, after);
    expect(Array.from(carried.broken)).toEqual([1, 0, 0]);
    expect(Array.from(carried.since)).toEqual([60, 0, 0]);
    expect(Array.from(carried.worn)).toEqual([12, 0, 5]);
  });
});

describe('breakdown snapshots', () => {
  it('restores by key onto the venues standing now', () => {
    const before = [{ key: 'a' }, { key: 'b' }];
    const breakdowns = createBreakdowns(2);
    breakdowns.broken[1] = 1;
    breakdowns.since[1] = 90;
    breakdowns.worn[1] = 33;
    const saved = snapshotBreakdowns(breakdowns, before);
    expect(breakdownsSnapshotSchema.safeParse(saved).success).toBe(true);
    const restored = restoreBreakdowns(saved, [{ key: 'b' }, { key: 'a' }]);
    expect(isBroken(restored, 0)).toBe(true);
    expect(restored.since[0]).toBe(90);
    expect(restored.worn[0]).toBe(33);
    expect(isBroken(restored, 1)).toBe(false);
  });
});
