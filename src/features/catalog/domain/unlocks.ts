import type { GameMode } from '../../sim/domain/ledger';
import type { Prestige } from '../../sim/domain/prestige';
import { OBJECT_TYPES } from './objectTypes';

const OWN_STARS: ReadonlyMap<string, number> = new Map(
  OBJECT_TYPES.flatMap((type) =>
    type.model.stars === undefined ? [] : [[type.id, type.model.stars] as const],
  ),
);

export function starsNeededFor(id: string): number | null {
  const type = OBJECT_TYPES.find((each) => each.id === id);
  if (!type) return null;
  return OWN_STARS.get(id) ?? OWN_STARS.get(type.family) ?? null;
}

// No prestige is a resort that keeps no reputation, as the headless sim and the benches run one.
export function isUnlocked(id: string, prestige: Prestige | null, mode: GameMode): boolean {
  if (prestige === null || mode === 'sandbox') return true;
  const needed = starsNeededFor(id);
  return needed === null || prestige.unlocked >= needed;
}

export function familiesUnlockedAt(tier: number): readonly string[] {
  return OBJECT_TYPES.filter(
    (type) => type.style === 0 && !type.model.groundDecides && starsNeededFor(type.id) === tier,
  ).map((type) => type.id);
}
