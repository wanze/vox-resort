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
import { MAX_QUEUE_SHOWN } from './queueLane';
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
  /**
   * How far this person would actually have to walk to each venue, in voxels, or
   * `Infinity` where it cannot be walked to at all. Omit it and the straight-line
   * distance is used, which is what a test fixture wants and what plan 016 had.
   */
  readonly walkingDistance?: (venue: number) => number;
  /**
   * How many are already waiting at each venue. A long line is a real cost and
   * a guest weighs it exactly as they weigh the walk: worth it for the good
   * place, not worth it for the near one. Omit it and nothing queues, which is
   * what a fixture wants and what plan 016 had.
   */
  readonly queueLength?: (venue: number) => number;
  /**
   * How long a line each venue can hold: its own queue lane, which is shorter
   * than {@link MAX_QUEUE_SHOWN} wherever the paving in front of the door runs
   * out. Omit it and every venue holds the ceiling, which is what plan 018 had.
   */
  readonly queueLimit?: (venue: number) => number;
}

/**
 * How good a venue is for a need, from where the guest is standing:
 *
 * ```
 * score = relief / (1 + distance / reach) / (1 + queue / capacity)
 * ```
 *
 * At the archetype's own reach the score is halved, at twice it a third, and it
 * never reaches zero - so a family will cross the plot for the only restrooms
 * standing, and will not for the second-nearest ice cream. That is the shape
 * the archetype table tunes: `reach` is where walking starts to cost more than
 * the visit is worth, and nothing else in the expression is a dial.
 *
 * The queue term is the same shape again, and measured against the venue's own
 * capacity rather than against a flat number of people: a line of eight outside
 * a beach club for twenty-five is a few minutes, and outside a beach shower for
 * one it is an afternoon. So a big place absorbs a queue that would send a guest
 * straight past a small one.
 *
 * The distance enters through this one expression and nothing else, which is
 * what let plan 017 hand in the real walking distance without touching anything
 * around it: `ChoiceOptions.walkingDistance` replaces the straight line where
 * the caller has a flow field that knows it, and the line stands where it has
 * not. An unreachable venue arrives here as `Infinity` and scores zero, which is
 * the same thing as not being a candidate.
 */
function scoreFor(
  relief: number,
  distance: number,
  reach: number,
  queue: number,
  capacity: number,
): number {
  return relief / (1 + distance / reach) / (1 + queue / Math.max(1, capacity));
}

/** Every venue's line holding the ceiling, where the caller has no lanes to say otherwise. */
const atCeiling = (): number => MAX_QUEUE_SHOWN;

/**
 * Where this person would go, or null when they want nothing or nowhere serves
 * what they want.
 *
 * Three things it deliberately does not do:
 *
 * - It considers only the single strongest need. Somebody both hungry and bored
 *   goes to eat, then re-decides, rather than planning a route round the resort.
 * - It does not build a flow field to find out how far anything is. The router
 *   hands in {@link ChoiceOptions.walkingDistance} for the venues it has already
 *   swept and leaves the rest on the straight line; see {@link scoreFor}.
 * - It does not count the queue for itself. The router hands in
 *   {@link ChoiceOptions.queueLength}, which is the only thing that knows who
 *   is standing where; see `occupancy.ts`.
 *
 * Ties break towards the lower venue index, so the answer does not depend on
 * iteration luck and a rebuilt plot chooses the same way.
 */
export function chooseVenue(options: ChoiceOptions): VenueChoice | null {
  const { needs, guests, person, venues, x, z, walkingDistance, queueLength } = options;
  const queueLimit = options.queueLimit ?? atCeiling;
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
    const distance = walkingDistance
      ? walkingDistance(index)
      : Math.hypot(venue.x - x, venue.z - z);
    // Somewhere that cannot be walked to is not somewhere to go, however good it
    // would be: `Infinity` is how the router says a venue has no path to it.
    if (!Number.isFinite(distance)) continue;
    const queued = queueLength ? queueLength(index) : 0;
    // The same threshold the router turns somebody away at - the venue's own
    // lane, or the ceiling `arriveAt` counts to - rather than one written out
    // twice: a guest who would be refused at the door is not a candidate here,
    // or they would cross the plot to be sent straight back.
    if (queued >= queueLimit(index)) continue;
    const score = scoreFor(relief, distance, reach, queued, venue.capacity);
    if (score > bestScore) {
      bestScore = score;
      best = { venue: index, need: wanted.need };
    }
  }
  return best;
}
