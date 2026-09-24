import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import type { PartyKind } from '../../guests/domain/parties';

export interface Archetype {
  readonly decayPerHour: { readonly [need in GuestNeed]: number };
  readonly weight: { readonly [need in GuestNeed]: number };
  readonly reach: number;
}

// Rates stay at or below 0.2 per hour: any quicker and a guest is hungry again before walking
// back from lunch. Reaches are in voxels; the reference plot is 112 x 100 tiles of 16.
export const ARCHETYPES: { readonly [kind in PartyKind]: Archetype } = {
  family: {
    decayPerHour: { hunger: 0.2, thirst: 0.16, energy: 0.14, fun: 0.12, hygiene: 0.18 },
    weight: { hunger: 1.4, thirst: 1.1, energy: 1, fun: 0.9, hygiene: 1.2 },
    reach: 320,
  },
  couple: {
    decayPerHour: { hunger: 0.13, thirst: 0.13, energy: 0.1, fun: 0.12, hygiene: 0.1 },
    weight: { hunger: 1.1, thirst: 1.1, energy: 1, fun: 1.1, hygiene: 0.9 },
    reach: 620,
  },
  friends: {
    decayPerHour: { hunger: 0.11, thirst: 0.18, energy: 0.08, fun: 0.2, hygiene: 0.08 },
    weight: { hunger: 1, thirst: 1.2, energy: 0.8, fun: 1.5, hygiene: 0.7 },
    reach: 900,
  },
  solo: {
    decayPerHour: { hunger: 0.12, thirst: 0.12, energy: 0.06, fun: 0.17, hygiene: 0.09 },
    weight: { hunger: 1.1, thirst: 1, energy: 0.8, fun: 1.3, hygiene: 0.9 },
    reach: 700,
  },
};

export function archetypeOf(guests: Guests, person: number): Archetype {
  return ARCHETYPES[guests.parties[guests.party[person]!]!.kind];
}
