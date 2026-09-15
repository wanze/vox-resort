/**
 * How each kind of party behaves: the table that makes where you build things
 * matter.
 *
 * A family with small children gets hungry quickly and will not cross the
 * resort for a sandwich; a group of friends will walk anywhere for something to
 * do. Put the bakery at the far gate and the families stop going, which is the
 * whole point of the genre and is not a property of any one decision - it falls
 * out of these numbers.
 *
 * ## One literal, with the reasoning beside it
 *
 * This is the tuning surface. Anybody who says the resort feels wrong should be
 * pointed here first and at `chooseVenue.ts` second, so the numbers stay in one
 * place with their argument next to them rather than spread through the code
 * that reads them.
 *
 * ## Keyed on the four party kinds and no others
 *
 * `PartyKind` is what a guest already has. Inventing an archetype that is not
 * one of them would mean a second classification to assign and keep in step,
 * and adding a party kind reshuffles a seeded draw - it is a plan of its own.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import type { PartyKind } from '../../guests/domain/parties';

export interface Archetype {
  /** Need level lost per simulated hour, per need. 0..1 scale; see `needs.ts`. */
  readonly decayPerHour: { readonly [need in GuestNeed]: number };
  /**
   * How hard each need pulls this party towards somewhere that serves it. A
   * multiplier on urgency, so a family's hunger outweighs its fun at the same
   * level.
   */
  readonly weight: { readonly [need in GuestNeed]: number };
  /**
   * How far this party will walk before distance outweighs the relief, in
   * voxels. See `chooseVenue.ts`: a large number is somebody who will cross the
   * resort for the right thing.
   */
  readonly reach: number;
}

/**
 * The rates are per simulated hour and none of them is above 0.2, so the
 * slowest need takes most of a day to run out and the fastest around five
 * hours. Anything quicker and a guest would be hungry again before they had
 * walked back from lunch; anything slower and a day would pass with nobody
 * wanting anything.
 *
 * The reaches are in voxels, and the reference plot is 112 by 100 tiles of 16.
 * A family's 320 is twenty tiles, about a sixth of the plot's width: near
 * enough to be a neighbourhood. Friends' 900 is over half of it, which is a
 * group that will walk to the far gate for a game.
 */
export const ARCHETYPES: { readonly [kind in PartyKind]: Archetype } = {
  /**
   * Children eat often, get grubby, and tire faster than they admit - and they
   * will not be walked across a resort, which is the smallest reach in the
   * table and the reason a bakery in the wrong corner goes quiet.
   */
  family: {
    decayPerHour: { hunger: 0.2, thirst: 0.16, energy: 0.14, fun: 0.12, hygiene: 0.18 },
    weight: { hunger: 1.4, thirst: 1.1, energy: 1, fun: 0.9, hygiene: 1.2 },
    reach: 320,
  },
  /** The middle of everything: no need runs away with them and they will walk. */
  couple: {
    decayPerHour: { hunger: 0.13, thirst: 0.13, energy: 0.1, fun: 0.12, hygiene: 0.1 },
    weight: { hunger: 1.1, thirst: 1.1, energy: 1, fun: 1.1, hygiene: 0.9 },
    reach: 620,
  },
  /**
   * Bored fastest and thirsty close behind, and they will go wherever the good
   * thing is - the largest reach, so a court at the edge of the plot still
   * fills up.
   */
  friends: {
    decayPerHour: { hunger: 0.11, thirst: 0.18, energy: 0.08, fun: 0.2, hygiene: 0.08 },
    weight: { hunger: 1, thirst: 1.2, energy: 0.8, fun: 1.5, hygiene: 0.7 },
    reach: 900,
  },
  /**
   * Keeps their own hours, so energy goes slowest of anybody's, and is out to
   * do something rather than to sit, so fun goes fast. Walks a fair way, having
   * nobody to carry.
   */
  solo: {
    decayPerHour: { hunger: 0.12, thirst: 0.12, energy: 0.06, fun: 0.17, hygiene: 0.09 },
    weight: { hunger: 1.1, thirst: 1, energy: 0.8, fun: 1.3, hygiene: 0.9 },
    reach: 700,
  },
};

/** The archetype a person's party is played by. */
export function archetypeOf(guests: Guests, person: number): Archetype {
  return ARCHETYPES[guests.parties[guests.party[person]!]!.kind];
}
