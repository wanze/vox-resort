// A new resort rates EMPTY_STARS, so a 3-star tier would gate nothing; 5 needs every guest
// perfectly happy, so 4.8 is the top.
export const PRESTIGE_TIERS = [3.5, 4, 4.5, 4.8] as const;

// A week, so one lucky day never unlocks a tier and nobody waits for a season's end either.
export const STREAK_DAYS = 7;

export interface Prestige {
  // The highest tier reached, 0 for none. Never falls: taking a building away would punish a
  // falling rating twice, which already costs guests.
  readonly unlocked: number;
  // Per tier, the days in a row closed at or above it; frozen once the tier is reached.
  readonly streaks: readonly number[];
  // Per tier, the calendar day it was reached on.
  readonly unlockedOn: readonly (number | null)[];
}

export function createPrestige(): Prestige {
  return {
    unlocked: 0,
    streaks: PRESTIGE_TIERS.map(() => 0),
    unlockedOn: PRESTIGE_TIERS.map(() => null),
  };
}

const highestOf = (unlockedOn: readonly (number | null)[]): number =>
  PRESTIGE_TIERS.reduce<number>((top, tier, at) => (unlockedOn[at] !== null ? tier : top), 0);

// Every tier keeps its own streak, so a 4.6-star week reaches 3.5, 4 and 4.5 at once.
export function prestigeAfterDay(
  prestige: Prestige,
  stars: number,
  day: number,
): { readonly prestige: Prestige; readonly newly: readonly number[] } {
  const newly: number[] = [];
  const streaks: number[] = [];
  const unlockedOn: (number | null)[] = [];
  PRESTIGE_TIERS.forEach((tier, at) => {
    const reachedOn = prestige.unlockedOn[at] ?? null;
    const before = prestige.streaks[at] ?? 0;
    if (reachedOn !== null) {
      streaks.push(before);
      unlockedOn.push(reachedOn);
      return;
    }
    const streak = stars >= tier ? before + 1 : 0;
    streaks.push(streak);
    if (streak >= STREAK_DAYS) newly.push(tier);
    unlockedOn.push(streak >= STREAK_DAYS ? day : null);
  });
  return { prestige: { unlocked: highestOf(unlockedOn), streaks, unlockedOn }, newly };
}

export interface NextTier {
  readonly tier: number;
  readonly days: number;
  readonly of: number;
}

export function nextTier(prestige: Prestige): NextTier | null {
  const at = PRESTIGE_TIERS.findIndex((_, index) => (prestige.unlockedOn[index] ?? null) === null);
  if (at < 0) return null;
  return { tier: PRESTIGE_TIERS[at]!, days: prestige.streaks[at] ?? 0, of: STREAK_DAYS };
}

// By tier, not by position, so a save from before a tier was added or moved keeps what it reached.
export function restorePrestige(saved: {
  readonly tiers: readonly number[];
  readonly streaks: readonly number[];
  readonly unlockedOn: readonly (number | null)[];
}): Prestige {
  const savedAt = (tier: number): number => saved.tiers.indexOf(tier);
  const streaks = PRESTIGE_TIERS.map((tier) => saved.streaks[savedAt(tier)] ?? 0);
  const unlockedOn = PRESTIGE_TIERS.map((tier) => saved.unlockedOn[savedAt(tier)] ?? null);
  return { unlocked: highestOf(unlockedOn), streaks, unlockedOn };
}

export const snapshotPrestige = (prestige: Prestige) => ({
  tiers: [...PRESTIGE_TIERS],
  streaks: [...prestige.streaks],
  unlockedOn: [...prestige.unlockedOn],
});

export const starsLabel = (tier: number): string => `${tier}★`;
