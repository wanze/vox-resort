import { describe, expect, it } from 'vitest';
import {
  createPrestige,
  nextTier,
  PRESTIGE_TIERS,
  prestigeAfterDay,
  restorePrestige,
  snapshotPrestige,
  STREAK_DAYS,
  type Prestige,
} from './prestige';

function closeDays(start: Prestige, stars: readonly number[], firstDay = 0) {
  let prestige = start;
  const newly: number[][] = [];
  stars.forEach((each, at) => {
    const after = prestigeAfterDay(prestige, each, firstDay + at);
    prestige = after.prestige;
    newly.push([...after.newly]);
  });
  return { prestige, newly };
}

const week = (stars: number): number[] => Array.from({ length: STREAK_DAYS }, () => stars);

describe('prestigeAfterDay', () => {
  it('starts with nothing reached', () => {
    expect(createPrestige().unlocked).toBe(0);
    expect(nextTier(createPrestige())).toEqual({ tier: 3.5, days: 0, of: STREAK_DAYS });
  });

  it('reaches a tier after a full streak, not before', () => {
    const almost = closeDays(createPrestige(), week(3.6).slice(1));
    expect(almost.prestige.unlocked).toBe(0);
    expect(nextTier(almost.prestige)).toEqual({ tier: 3.5, days: STREAK_DAYS - 1, of: 7 });
    const { prestige, newly } = closeDays(almost.prestige, [3.5], 40);
    expect(prestige.unlocked).toBe(3.5);
    expect(newly).toEqual([[3.5]]);
    expect(prestige.unlockedOn[0]).toBe(40);
    expect(nextTier(prestige)?.tier).toBe(4);
  });

  it('resets the streak on a day below the tier', () => {
    const { prestige } = closeDays(createPrestige(), [...week(4).slice(1), 3.4, 4]);
    expect(prestige.unlocked).toBe(0);
    expect(prestige.streaks[0]).toBe(1);
  });

  it('reaches several tiers in one week', () => {
    const { prestige, newly } = closeDays(createPrestige(), week(4.6));
    expect(prestige.unlocked).toBe(4.5);
    expect(newly.at(-1)).toEqual([3.5, 4, 4.5]);
    expect(newly.slice(0, -1).flat()).toEqual([]);
    expect(nextTier(prestige)).toEqual({ tier: 4.8, days: 0, of: 7 });
  });

  it('never falls once a tier is reached', () => {
    const reached = closeDays(createPrestige(), week(4)).prestige;
    const { prestige, newly } = closeDays(reached, [...week(1), ...week(2)], 10);
    expect(prestige.unlocked).toBe(4);
    expect(prestige.unlockedOn.slice(0, 2)).toEqual([6, 6]);
    expect(newly.flat()).toEqual([]);
  });

  it('tells no tier once the top is reached', () => {
    const { prestige } = closeDays(createPrestige(), week(5));
    expect(prestige.unlocked).toBe(PRESTIGE_TIERS.at(-1));
    expect(nextTier(prestige)).toBeNull();
  });
});

describe('restorePrestige', () => {
  it('round-trips a snapshot', () => {
    const { prestige } = closeDays(createPrestige(), [...week(4), 4.6, 4.6]);
    expect(restorePrestige(snapshotPrestige(prestige))).toEqual(prestige);
  });

  it('keeps reached tiers by value when the tiers changed', () => {
    const restored = restorePrestige({
      tiers: [4, 3.5, 4.2],
      streaks: [7, 7, 3],
      unlockedOn: [5, 5, null],
    });
    expect(restored.unlocked).toBe(4);
    expect(restored.streaks).toEqual([7, 7, 0, 0]);
    expect(restored.unlockedOn).toEqual([5, 5, null, null]);
  });
});
