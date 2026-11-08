import { objectTypeById } from '../../catalog/domain/objectTypes';
import { familiesUnlockedAt } from '../../catalog/domain/unlocks';
import { nextTier, starsLabel, type Prestige } from '../../sim/domain/prestige';

export const unlockedLabels = (tier: number): readonly string[] =>
  familiesUnlockedAt(tier).map((id) => objectTypeById(id).label);

// Null once every tier is reached: there is nothing left to aim for.
export function prestigeGoal(prestige: Prestige): string | null {
  const next = nextTier(prestige);
  if (!next) return null;
  const labels = unlockedLabels(next.tier);
  const unlocks = labels.length > 0 ? `: unlocks ${labels.join(', ')}` : '';
  return `${starsLabel(next.tier)} for ${next.days} of ${next.of} days${unlocks}`;
}

export function reachedWords(reached: readonly number[]): string | null {
  const top = reached.at(-1);
  if (top === undefined) return null;
  const labels = reached.flatMap(unlockedLabels);
  const opened = labels.length > 0 ? `: ${labels.join(', ')} can now be built` : '';
  return `Reached a ${starsLabel(top)} reputation${opened}.`;
}
