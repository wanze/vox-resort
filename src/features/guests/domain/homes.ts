// Greedy, biggest parties into the biggest lodgings, so a family of five does not find every bungalow holding one person.

import type { Party } from './parties';

export interface Home {
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly beds: number;
}

export const NO_HOME = -1;

export function assignHomes(
  parties: readonly Party[],
  homes: readonly Home[],
): {
  readonly byParty: Int32Array;
  readonly freeBeds: Int32Array;
} {
  const byParty = new Int32Array(parties.length).fill(NO_HOME);
  const freeBeds = Int32Array.from(homes, (home) => home.beds);

  // Ties break by party index, which keeps the result deterministic without a generator.
  const order = parties
    .map((_, index) => index)
    .toSorted((a, b) => parties[b]!.members.length - parties[a]!.members.length || a - b);

  for (const index of order) {
    const size = parties[index]!.members.length;
    const home = homeWithRoom(freeBeds, size);
    if (home === NO_HOME) continue;
    byParty[index] = home;
    freeBeds[home] = freeBeds[home]! - size;
  }

  return { byParty, freeBeds };
}

// Shared with the opening assignment so a late arrival is housed by the same greedy rule.
export function homeWithRoom(freeBeds: Int32Array, size: number): number {
  for (let home = 0; home < freeBeds.length; home++) {
    if (freeBeds[home]! >= size) return home;
  }
  return NO_HOME;
}
