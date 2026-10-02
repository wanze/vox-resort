import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import type { PartyKind } from '../../guests/domain/parties';

export interface Archetype {
  readonly decayPerHour: { readonly [need in GuestNeed]: number };
  readonly weight: { readonly [need in GuestNeed]: number };
  readonly reach: number;
}

// Somebody hurt wants first aid before anything, so this beats any want at its worst, which is at
// most 1.5 x 1. Health never decays: only an incident lowers it.
const HURT_WEIGHT = 3;

// At up to 0.2 an hour a guest spent the day walking to the next need, half of them always had one
// run dry, and a fully built resort rated three stars. Fun runs down quickest, or the leisure
// venues stand empty. Reaches are in voxels; the reference plot is 112 x 100 tiles of 16.
export const ARCHETYPES: { readonly [kind in PartyKind]: Archetype } = {
  family: {
    decayPerHour: {
      hunger: 0.12,
      thirst: 0.096,
      energy: 0.084,
      fun: 0.102,
      hygiene: 0.108,
      health: 0,
    },
    weight: { hunger: 1.4, thirst: 1.1, energy: 1, fun: 0.9, hygiene: 1.2, health: HURT_WEIGHT },
    reach: 320,
  },
  couple: {
    decayPerHour: {
      hunger: 0.078,
      thirst: 0.078,
      energy: 0.06,
      fun: 0.102,
      hygiene: 0.06,
      health: 0,
    },
    weight: { hunger: 1.1, thirst: 1.1, energy: 1, fun: 1.1, hygiene: 0.9, health: HURT_WEIGHT },
    reach: 620,
  },
  friends: {
    decayPerHour: {
      hunger: 0.066,
      thirst: 0.108,
      energy: 0.048,
      fun: 0.17,
      hygiene: 0.048,
      health: 0,
    },
    weight: { hunger: 1, thirst: 1.2, energy: 0.8, fun: 1.5, hygiene: 0.7, health: HURT_WEIGHT },
    reach: 900,
  },
  solo: {
    decayPerHour: {
      hunger: 0.072,
      thirst: 0.072,
      energy: 0.036,
      fun: 0.145,
      hygiene: 0.054,
      health: 0,
    },
    weight: { hunger: 1.1, thirst: 1, energy: 0.8, fun: 1.3, hygiene: 0.9, health: HURT_WEIGHT },
    reach: 700,
  },
};

export function archetypeOf(guests: Guests, person: number): Archetype {
  return ARCHETYPES[guests.parties[guests.party[person]!]!.kind];
}
