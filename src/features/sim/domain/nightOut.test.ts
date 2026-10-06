import { describe, expect, it } from 'vitest';
import type { PartyKind } from '../../guests/domain/parties';
import {
  goesOut,
  isPastTen,
  lateBedtimeOf,
  NIGHT_OUT_SHARE,
  nightOf,
  outUntil,
  planNightsOut,
} from './nightOut';
import { TICKS_PER_DAY } from './simClock';

const HOUR = 60;
const KINDS: readonly PartyKind[] = ['friends', 'solo', 'couple', 'family'];

describe('goesOut', () => {
  it('never takes a party with a child out', () => {
    for (let party = 0; party < 500; party++) {
      for (const kind of KINDS) expect(goesOut(party, 3, kind, 1)).toBe(false);
    }
  });

  it('sends out about its share of each kind over many nights', () => {
    for (const kind of KINDS) {
      let out = 0;
      for (let party = 0; party < 100; party++) {
        for (let day = 0; day < 100; day++) if (goesOut(party, day, kind, 0)) out++;
      }
      expect(Math.abs(out / 10_000 - NIGHT_OUT_SHARE[kind]), kind).toBeLessThan(0.03);
    }
  });

  it('gives the same party different nights on different days', () => {
    const nights = Array.from({ length: 20 }, (_, day) => goesOut(7, day, 'friends', 0));
    expect(new Set(nights).size).toBe(2);
    const bedtimes = new Set(Array.from({ length: 20 }, (_, day) => lateBedtimeOf(7, day)));
    expect(bedtimes.size).toBeGreaterThan(1);
  });

  it('gives the same answer every time it is asked', () => {
    for (let party = 0; party < 50; party++) {
      expect(goesOut(party, 9, 'couple', 0)).toBe(goesOut(party, 9, 'couple', 0));
      expect(outUntil(party, 9)).toBe(outUntil(party, 9));
    }
  });
});

describe('lateBedtimeOf', () => {
  it('sends everybody out to bed between eleven and half past one, on the night they went out', () => {
    for (let party = 0; party < 200; party++) {
      for (const day of [0, 1, 40]) {
        const bedtime = lateBedtimeOf(party, day);
        expect(bedtime >= 23 * HOUR || bedtime < 1.5 * HOUR, `${party} on ${day}`).toBe(true);
        const until = outUntil(party, day);
        expect(until).toBeGreaterThanOrEqual(day * TICKS_PER_DAY + 23 * HOUR);
        expect(until).toBeLessThan((day + 1) * TICKS_PER_DAY + 1.5 * HOUR);
        expect(until % TICKS_PER_DAY).toBe(bedtime);
      }
    }
  });
});

describe('planNightsOut', () => {
  it('marks the parties out on the night with their bedtime, the rest and every family -1', () => {
    const parties = Array.from({ length: 40 }, (_, party) => ({
      kind: party % 2 === 0 ? ('friends' as const) : ('family' as const),
      members: [party * 2, party * 2 + 1],
    }));
    const child = Uint8Array.from({ length: 80 }, (_, person) => (person % 4 === 3 ? 1 : 0));
    const into = new Int32Array(40).fill(7);
    planNightsOut(parties, child, 5, into);
    for (const [party, until] of into.entries()) {
      const out = party % 2 === 0 && goesOut(party, 5, 'friends', 0);
      expect(until, `party ${party}`).toBe(out ? outUntil(party, 5) : -1);
    }
    expect(into.some((until) => until >= 0)).toBe(true);
  });
});

describe('the night and the hour', () => {
  it('counts the small hours in the night before, from noon to noon', () => {
    expect(nightOf(3 * TICKS_PER_DAY + 12 * HOUR)).toBe(3);
    expect(nightOf(3 * TICKS_PER_DAY + 23 * HOUR)).toBe(3);
    expect(nightOf(4 * TICKS_PER_DAY + 2 * HOUR)).toBe(3);
    expect(nightOf(4 * TICKS_PER_DAY + 12 * HOUR - 1)).toBe(3);
  });

  it('is past ten from ten at night until noon', () => {
    expect(isPastTen(21 * HOUR + 59)).toBe(false);
    expect(isPastTen(22 * HOUR)).toBe(true);
    expect(isPastTen(3 * HOUR)).toBe(true);
    expect(isPastTen(12 * HOUR)).toBe(false);
  });
});
