/**
 * Who came with whom.
 *
 * Guests arrive in parties and almost nobody arrives alone, which is the fact
 * that makes a resort read as a resort rather than as a crowd: a family of four
 * shares a bungalow, and later walks together and eats together. This module
 * decides only the memberships and the shape of each party; where they sleep is
 * `homes.ts` and what they do is the simulation.
 *
 * ## Children are not a coin flip
 *
 * Whether somebody is a child is decided here, by the party they are in, and it
 * then decides which model they are drawn with. A crowd that drew children at
 * random would put a seven-year-old on holiday by herself.
 */

import { familyName } from './names';

/** How a party is made up, and how often one like it turns up. */
export type PartyKind = 'family' | 'couple' | 'friends' | 'solo';

export interface Party {
  readonly kind: PartyKind;
  readonly family: string;
  /** Person indices in the party, adults first. */
  readonly members: readonly number[];
}

export interface PartyOptions {
  /** People to divide up. The last party is trimmed to fit exactly. */
  readonly count: number;
  readonly random: () => number;
}

interface PartyShapeWeights {
  readonly kind: PartyKind;
  readonly share: number;
  readonly adults: { readonly min: number; readonly max: number };
  readonly children: { readonly min: number; readonly max: number };
}

/**
 * The mix of parties a beach resort gets, by share of *parties* rather than of
 * people.
 *
 * Families are the largest share and the largest parties, so they are well over
 * half the people on the plot, which is what a Mediterranean resort in summer
 * looks like. Couples are the next most common; groups of friends rarer, and
 * people on their own rarest of all - enough of them that a solo guest exists,
 * few enough that the resort does not read as a hostel. The shares sum to 1.
 */
export const PARTY_MIX: readonly PartyShapeWeights[] = [
  { kind: 'family', share: 0.4, adults: { min: 2, max: 2 }, children: { min: 1, max: 3 } },
  { kind: 'couple', share: 0.3, adults: { min: 2, max: 2 }, children: { min: 0, max: 0 } },
  { kind: 'friends', share: 0.18, adults: { min: 3, max: 4 }, children: { min: 0, max: 0 } },
  { kind: 'solo', share: 0.12, adults: { min: 1, max: 1 }, children: { min: 0, max: 0 } },
];

const between = (random: () => number, range: { min: number; max: number }): number =>
  range.min + Math.min(range.max - range.min, Math.floor(random() * (range.max - range.min + 1)));

/** What one party is: its kind, its surname, and how many of each it holds. */
export interface PartyShape {
  readonly kind: PartyKind;
  readonly family: string;
  readonly adults: number;
  readonly children: number;
}

/**
 * One party drawn from the mix, before anybody is put in it.
 *
 * Lifted out of {@link partiesFor} so a party checking in on day six is drawn
 * exactly as the parties who opened the plot were - one rule and not two. See
 * `guests.ts`'s `checkInParty`.
 *
 * **The draw order is load-bearing**: kind, adults, children, surname. Changing
 * it reshuffles every number after it, and so the scene a benchmark compares
 * against.
 */
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

/**
 * Divides `count` people into parties, adults and children assigned.
 *
 * Hands back the parties and, per person index, which party they are in and
 * whether they are a child - the two columns everything downstream reads.
 */
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
    // The last party is trimmed to the people left rather than overshooting, and
    // it is trimmed from the back: members are adults first, so a family cut to
    // one person is one adult, never a child on holiday alone.
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
