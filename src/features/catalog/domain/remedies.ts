import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { GameMode } from '../../sim/domain/ledger';
import type { Prestige } from '../../sim/domain/prestige';
import { ORIGINAL_TYPES } from './objectTypes';
import { buildCostOf } from './prices';
import { isUnlocked } from './unlocks';

// Two, so a line can say "this or that" without turning into the build menu.
const NAMED = 2;

export function remediesFor(
  need: GuestNeed,
  prestige: Prestige | null,
  mode: GameMode,
): readonly string[] {
  return ORIGINAL_TYPES.filter(
    (type) =>
      type.venue?.satisfies?.some((relief) => relief.need === need && relief.amount > 0) === true &&
      isUnlocked(type.id, prestige, mode),
  )
    .toSorted((a, b) => buildCostOf(a.id) - buildCostOf(b.id))
    .slice(0, NAMED)
    .map((type) => type.label);
}
