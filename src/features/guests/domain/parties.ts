import { familyName } from './names';

export type PartyKind = 'family' | 'couple' | 'friends' | 'solo';

export interface Party {
  readonly kind: PartyKind;
  readonly family: string;
  readonly members: readonly number[];
}

export interface PartyOptions {
  readonly count: number;
  readonly random: () => number;
}

interface PartyShapeWeights {
  readonly kind: PartyKind;
  readonly share: number;
  readonly adults: { readonly min: number; readonly max: number };
  readonly children: { readonly min: number; readonly max: number };
}

export const PARTY_MIX: readonly PartyShapeWeights[] = [
  { kind: 'family', share: 0.4, adults: { min: 2, max: 2 }, children: { min: 1, max: 3 } },
  { kind: 'couple', share: 0.3, adults: { min: 2, max: 2 }, children: { min: 0, max: 0 } },
  { kind: 'friends', share: 0.18, adults: { min: 3, max: 4 }, children: { min: 0, max: 0 } },
  { kind: 'solo', share: 0.12, adults: { min: 1, max: 1 }, children: { min: 0, max: 0 } },
];

const between = (random: () => number, range: { min: number; max: number }): number =>
  range.min + Math.min(range.max - range.min, Math.floor(random() * (range.max - range.min + 1)));

export interface PartyShape {
  readonly kind: PartyKind;
  readonly family: string;
  readonly adults: number;
  readonly children: number;
}

// The draw order (kind, adults, children, surname) is load-bearing: changing it reshuffles every
// seeded scene a benchmark compares against.
export function partyShapeFor(random: () => number): PartyShape {
  const shape = kindFor(random);
  return {
    kind: shape.kind,
    adults: between(random, shape.adults),
    children: between(random, shape.children),
    family: familyName(random),
  };
}

function kindFor(random: () => number): PartyShapeWeights {
  let roll = random();
  for (const shape of PARTY_MIX) {
    if (roll < shape.share) return shape;
    roll -= shape.share;
  }
  // Only reachable through floating-point slack in the shares' sum.
  return PARTY_MIX[PARTY_MIX.length - 1]!;
}

export function partiesFor(options: PartyOptions): {
  readonly parties: readonly Party[];
  readonly party: Int32Array;
  readonly child: Uint8Array;
} {
  const count = Math.max(0, Math.floor(options.count));
  const { random } = options;
  const parties: Party[] = [];
  const party = new Int32Array(count);
  const child = new Uint8Array(count);

  let next = 0;
  while (next < count) {
    const { kind, adults, children, family } = partyShapeFor(random);
    // Trimmed from the back: members are adults first, so a party cut short is never a lone child.
    const size = Math.min(adults + children, count - next);
    const members: number[] = [];
    for (let m = 0; m < size; m++) {
      const person = next + m;
      members.push(person);
      party[person] = parties.length;
      child[person] = m >= adults ? 1 : 0;
    }
    parties.push({ kind, family, members });
    next += size;
  }

  return { parties, party, child };
}
