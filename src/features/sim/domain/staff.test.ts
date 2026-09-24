import { describe, expect, it } from 'vitest';
import { onDuty, rosterFor, shiftChange, STAFF_CAPS, STAFF_ROLES, staffPool } from './staff';

describe('staffPool', () => {
  it('holds every role up to its cap, in role order', () => {
    const pool = staffPool();
    const expected = STAFF_ROLES.flatMap((role) =>
      Array.from({ length: STAFF_CAPS[role] }, () => role),
    );
    expect(pool.role).toEqual(expected);
    expect(pool.count).toBe(expected.length);
  });

  it('draws every one of them with a model the art declares', () => {
    const pool = staffPool();
    expect(pool.variant).toHaveLength(pool.count);
    for (let worker = 0; worker < pool.count; worker++) {
      expect(pool.variant[worker]).toBe(STAFF_ROLES.indexOf(pool.role[worker]!));
    }
  });
});

describe('rosterFor', () => {
  it('puts nobody on a plot with nothing to clean', () => {
    expect(rosterFor({ venues: 0 }).cleaner).toBe(0);
  });

  it('keeps the reference plot the cleaners it always had', () => {
    expect(rosterFor({ venues: 91 }).cleaner).toBe(15);
  });

  it('follows the venue count, and never leaves a plot with venues unstaffed', () => {
    const counts = [1, 3, 6, 12, 30, 60].map((venues) => rosterFor({ venues }).cleaner);
    expect(counts).toEqual([...counts].toSorted((a, b) => a - b));
    expect(rosterFor({ venues: 1 }).cleaner).toBe(1);
    expect(rosterFor({ venues: 6 }).cleaner).toBe(1);
    expect(rosterFor({ venues: 30 }).cleaner).toBeGreaterThan(rosterFor({ venues: 6 }).cleaner);
  });

  it('caps every role so a tiled bench plot does not put a town on screen', () => {
    expect(rosterFor({ venues: 5000 }).cleaner).toBe(STAFF_CAPS.cleaner);
    expect(rosterFor({ venues: 50_000 }).cleaner).toBe(STAFF_CAPS.cleaner);
  });
});

describe('onDuty', () => {
  it('puts the first bodies of each role on duty and nobody else', () => {
    const pool = staffPool();
    const duty = onDuty(pool, { cleaner: 3 });
    expect(Array.from(duty.slice(0, 4))).toEqual([1, 1, 1, 0]);
    expect(duty.reduce((sum, each) => sum + each, 0)).toBe(3);
  });

  it('puts nobody on duty for an empty roster', () => {
    expect(onDuty(staffPool(), { cleaner: 0 }).every((each) => each === 0)).toBe(true);
  });
});

describe('shiftChange', () => {
  it('starts whoever is on duty and away, and sends home whoever is off duty and here', () => {
    const duty = Uint8Array.from([1, 1, 0, 0]);
    const offPlot = Uint8Array.from([0, 1, 0, 1]);
    expect(shiftChange(duty, offPlot)).toEqual({ starting: [1], leaving: [2] });
  });

  it('changes nothing when the roster already stands', () => {
    expect(shiftChange(Uint8Array.from([1, 0]), Uint8Array.from([0, 1]))).toEqual({
      starting: [],
      leaving: [],
    });
  });
});
