import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import { isMet, offeringOf, type Requirement } from '../../bookings/domain/requirements';
import type { GameMode } from '../../sim/domain/ledger';
import type { Prestige } from '../../sim/domain/prestige';
import { ORIGINAL_TYPES, type ObjectTypeDefinition } from './objectTypes';
import { buildCostOf } from './prices';
import { isUnlocked } from './unlocks';

// Two, so a line can say "this or that" without turning into the build menu.
const NAMED = 2;

function remediesWhere(
  serves: (type: ObjectTypeDefinition) => boolean,
  prestige: Prestige | null,
  mode: GameMode,
): readonly string[] {
  return ORIGINAL_TYPES.filter((type) => serves(type) && isUnlocked(type.id, prestige, mode))
    .toSorted((a, b) => buildCostOf(a.id) - buildCostOf(b.id))
    .slice(0, NAMED)
    .map((type) => type.label);
}

export const remediesFor = (
  need: GuestNeed,
  prestige: Prestige | null,
  mode: GameMode,
): readonly string[] =>
  remediesWhere(
    (type) =>
      type.venue?.satisfies?.some((relief) => relief.need === need && relief.amount > 0) === true,
    prestige,
    mode,
  );

// A group's wish, asked of one building at a time; the stars are earned, never built.
export function requirementRemedies(
  requirement: Requirement,
  prestige: Prestige | null,
  mode: GameMode,
): readonly string[] {
  if (requirement.kind === 'stars') return [];
  return remediesWhere(
    ({ venue }) => venue !== null && isMet(requirement, { ...offeringOf([venue]), stars: 0 }),
    prestige,
    mode,
  );
}
