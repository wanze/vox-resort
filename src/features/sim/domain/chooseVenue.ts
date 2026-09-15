/**
 * Where a guest would go next, given what they want and where they are.
 *
 * One decision, taken when a guest has arrived somewhere and is free to choose
 * again: the loudest need, scored against every venue that serves it, best
 * wins. Not a plan for the afternoon - a guest who is hungry and bored goes to
 * eat and then decides afresh, which is what keeps this O(venues), allocation
 * free per candidate, and the same on two runs of the same plot.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { archetypeOf } from './archetypes';
import { strongestNeed, type Needs } from './needs';
import { reliefAt, type Venue } from './venues';

export interface VenueChoice {
  /** Index into the `venues` that were offered. */
  readonly venue: number;
  /** The need it was chosen to see to. */
  readonly need: GuestNeed;
}

export interface ChoiceOptions {
  readonly needs: Needs;
  readonly guests: Guests;
  readonly person: number;
  readonly venues: readonly Venue[];
  /** Where the person is now, in world voxels. */
  readonly x: number;
  readonly z: number;
}

/**
 * How good a venue is for a need, from where the guest is standing:
 *
 * ```
 * score = relief / (1 + distance / reach)
 * ```
 *
 * At the archetype's own reach the score is halved, at twice it a third, and it
 * never reaches zero - so a family will cross the plot for the only restrooms
 * standing, and will not for the second-nearest ice cream. That is the shape
 * the archetype table tunes: `reach` is where walking starts to cost more than
 * the visit is worth, and nothing else in the expression is a dial.
 *
 * The distance is a **straight line**, not a walk, and deliberately enters
 * through this one expression: plan 017 builds flow fields that know the real
 * walking distance to every venue from every node, and replacing the line with
 * that number is meant to be this term and nothing else.
 */
function scoreFor(relief: number, distance: number, reach: number): number {
  return relief / (1 + distance / reach);
}

/**
 * Where this person would go, or null when they want nothing or nowhere serves
 * what they want.
 *
 * Three things it deliberately does not do:
 *
 * - It considers only the single strongest need. Somebody both hungry and bored
 *   goes to eat, then re-decides, rather than planning a route round the resort.
 * - The distance is straight-line; see {@link scoreFor}. Plan 017 replaces it.
 * - Queue length is not in the score, because nothing queues yet. Plan 018 adds
 *   capacity pressure as a second term of the same expression.
 *
 * Ties break towards the lower venue index, so the answer does not depend on
 * iteration luck and a rebuilt plot chooses the same way.
 */
export function chooseVenue(options: ChoiceOptions): VenueChoice | null {
  const { needs, guests, person, venues, x, z } = options;
  const wanted = strongestNeed(needs, guests, person);
  if (wanted === null) return null;
  const { reach } = archetypeOf(guests, person);

  let best: VenueChoice | null = null;
  let bestScore = 0;
  for (let index = 0; index < venues.length; index++) {
    const venue = venues[index]!;
    const relief = reliefAt(venue, wanted.need);
    // A place that does nothing for the need - or makes it worse - is not a
    // candidate at all, rather than a bad one.
    if (relief <= 0) continue;
    const score = scoreFor(relief, Math.hypot(venue.x - x, venue.z - z), reach);
    if (score > bestScore) {
      bestScore = score;
      best = { venue: index, need: wanted.need };
    }
  }
  return best;
}
