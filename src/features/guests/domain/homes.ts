/**
 * Which roof each party sleeps under.
 *
 * Beds come off the art - `bedsOf` in the catalogue, declared per model in
 * `voxel-gen/` - so a plot with three hotels on it sleeps a hundred and twenty
 * people without anything here knowing what a hotel is. See `ModelVenue`.
 *
 * ## Biggest parties first, into the biggest lodgings
 *
 * A greedy pass, and greedy is right here rather than merely cheap: the failure
 * it avoids is a family of five arriving to find every bungalow holding one
 * person each. Parties are sorted by size descending and each takes the first
 * lodging with room, which fills the hotel with the big parties and leaves the
 * bungalows to the couples.
 *
 * A party that does not fit gets no home at all, rather than being squeezed in.
 * That is a real state and the resort should be able to say so - it is the
 * "you need more beds" signal plan 020 reads and plan 021 shows the player.
 */

import type { Party } from './parties';

/** A place to sleep, as the assignment sees one. */
export interface Home {
  /** The placement's key, e.g. `"bungalow#3"`; unique on the plot. */
  readonly key: string;
  /** Catalogue id, e.g. `"bungalow"`. */
  readonly id: string;
  /** What the HUD calls it, e.g. `"Bungalow"`. */
  readonly label: string;
  readonly beds: number;
}

/** No roof: the party arrived and there was nowhere to put them. */
export const NO_HOME = -1;

export function assignHomes(
  parties: readonly Party[],
  homes: readonly Home[],
): {
  /** Index into `homes` per party, or {@link NO_HOME}. */
  readonly byParty: Int32Array;
  /** Beds still free in each home after the assignment. */
  readonly freeBeds: Int32Array;
} {
  const byParty = new Int32Array(parties.length).fill(NO_HOME);
  const freeBeds = Int32Array.from(homes, (home) => home.beds);

  // Ties in size break by party index, which makes the order total and the
  // result deterministic without a generator: this is the one module of the
  // registry that draws no random numbers, and needs none.
  const order = parties
    .map((_, index) => index)
    .toSorted((a, b) => parties[b]!.members.length - parties[a]!.members.length || a - b);

  for (const index of order) {
    const size = parties[index]!.members.length;
    for (let home = 0; home < homes.length; home++) {
      if (freeBeds[home]! < size) continue;
      byParty[index] = home;
      freeBeds[home] = freeBeds[home]! - size;
      break;
    }
  }

  return { byParty, freeBeds };
}
