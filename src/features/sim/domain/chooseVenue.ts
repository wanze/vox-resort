/**
 * Where a guest would go next, given what they want and where they are.
 *
 * One decision, taken when a guest has arrived somewhere and is free to choose
 * again: every venue scored on what a visit to it would actually be worth to
 * them, best wins. Not a plan for the afternoon - a guest goes somewhere and
 * then decides afresh, which is what keeps this O(venues), allocation free per
 * candidate, and the same on two runs of the same plot.
 *
 * ## The loudest need decides *whether*, not *where*
 *
 * `strongestNeed` is the content gate and nothing more: somebody it calls
 * content chooses nothing, which is what stops the resort being a crowd that can
 * never sit still. What they choose is `appeal.ts`'s, over every need the venue
 * declares. See `plans/030-balance-the-choice.md` for what reading one need did.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { appealOf, dominantNeedAt } from './appeal';
import { archetypeOf } from './archetypes';
import { MAX_QUEUE_SHOWN } from './queueLane';
import { strongestNeed, type Needs } from './needs';
import type { Venue } from './venues';

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
  /**
   * How many are **inside** each venue right now, against
   * {@link ChoiceOptions.queueLength}'s how many are outside waiting to be.
   *
   * A line only starts once a venue is full, so before this the only congestion
   * a guest could see was a queue - and on a plot where the big venues never
   * fill, that is no congestion at all: a Beach Club with twenty-five people in
   * it and an empty one scored exactly the same. Omit it and nothing is
   * occupied, which is what a fixture wants and what plan 018 had.
   */
  readonly occupants?: (venue: number) => number;
  /**
   * How much this person happens to like each venue: {@link TASTE_SPREAD} wide
   * about 1, and **the same answer on two runs of the same plot**. See
   * `appeal.ts`'s `tasteFor`, which is what the router hands in. Omit it and
   * everybody has the same taste, which is what a fixture wants.
   */
  readonly affinity?: (venue: number) => number;
  /**
   * The venue this person came out of most recently, or -1.
   *
   * Discounted by {@link REVISIT} so a guest does not walk straight back into
   * the bar they have just left - which is what "one venue takes every visit"
   * looks like from inside one guest's day, since leaving it makes it the
   * nearest thing that serves them and so the best answer again.
   */
  readonly justLeft?: number;
  /**
   * How clean each venue is, 0..1. A dirty place is a worse place, weighed
   * exactly as a long line is: worth it for the only restrooms standing, not
   * worth it for the second-nearest ice cream. Omit it and everything is
   * spotless, which is what a fixture wants and what plan 018 had.
   */
  readonly cleanliness?: (venue: number) => number;
}

/**
 * How hard a busy venue is discounted, as a multiplier on how full it is.
 *
 * At 2 a venue at capacity scores a third of an empty one, and one at capacity
 * with a full line up to a fifth. That is finally larger than the gaps the art's
 * declared reliefs leave: before it, the most a **full line** could ever take
 * off a Restaurant for forty was 23%, against the 1.67x a Restaurant's hunger
 * 1.0 stood ahead of a Snack Bar's 0.6 - so the line could never decide
 * anything. The bigger the venue, the less its queue counted against it, which
 * is backwards from anything that spreads a crowd.
 *
 * It is one number for the whole plot and must stay one. A dial that needed a
 * table per venue or per need would be a modelling mistake somewhere else; the
 * differences between venues are the art's to declare, in `capacity`.
 */
const CROWDING = 2;

/**
 * How wide a spread of taste guests are given, as a fraction of the score: 0.3
 * is 0.85 to 1.15.
 *
 * Bounded from above by the gaps the layout creates - a taste wider than the
 * difference between the near bakery and the far one would *be* the decision,
 * and where a player builds a thing would stop mattering. Bounded from below by
 * its whole purpose: it must be enough that a venue a little behind on the
 * formula is still somebody's first choice, so nothing standing on the plot gets
 * no visits at all.
 */
export const TASTE_SPREAD = 0.3;

/**
 * What the place somebody has just come out of is worth to them next time they
 * decide, as a multiplier.
 *
 * **A preference and not a ban**, which is why it is a half and not a zero:
 * somebody who leaves the restrooms still grubby, or comes out of a snack bar
 * that barely dented their hunger, has to be able to turn straight round. It
 * lasts exactly one decision, because it is cleared by the next visit.
 */
const REVISIT = 0.5;

/**
 * What a filthy venue is worth against a spotless one, as a multiplier.
 *
 * **A quarter, and deliberately not nothing.** A guest desperate for the only
 * restrooms on the plot still goes to the dirty ones, which is what makes dirt
 * a cost the player pays in ones and twos rather than a switch that turns a
 * building off. A floor of zero would make one neglected venue behave exactly
 * like a demolished one, and the symptom - a queue that empties and never
 * refills - reads as the router failing rather than as the cleaners being
 * behind.
 *
 * Of a size with {@link REVISIT} on purpose. Dirt is a preference, and the
 * distance and crowding terms below it are what a guest actually decides on.
 */
const DIRT_FLOOR = 0.25;

/**
 * How good a venue is for this person, from where they are standing:
 *
 * ```
 * score = gain * taste * recency * (DIRT_FLOOR + (1 - DIRT_FLOOR) * clean)
 *         ---------------------------------------------------------------
 *         (1 + distance / reach) * (1 + CROWDING * busy / capacity)
 * ```
 *
 * At the archetype's own reach the score is halved, at twice it a third, and it
 * never reaches zero - so a family will cross the plot for the only restrooms
 * standing, and will not for the second-nearest ice cream. That is the shape
 * the archetype table tunes: `reach` is where walking starts to cost more than
 * the visit is worth, and nothing else in the expression is a dial.
 *
 * The `gain` is `appeal.ts`'s, and is the whole visit rather than one entry of
 * the art's `satisfies`: every need the venue declares, weighted by the
 * archetype, **and only as much of each relief as the guest will have room for
 * by the time they have walked there**.
 * Overshoot is not counted, because a level is clamped at 1 and a Restaurant's
 * 1.0 does no more for somebody half fed than a Snack Bar's 0.6 does. Counting
 * it in full is what made the largest declared number on the plot win every
 * decision however mildly anybody wanted anything - and so what left a Snack Bar
 * beside a Restaurant, and a Beachclub beside a Pool Bar, with no visits at all.
 *
 * The crowding term is the same shape again, and measured against the venue's
 * own capacity rather than against a flat number of people: eight people at a
 * beach club for twenty-five is a quiet afternoon, and eight at a beach shower
 * for one is a queue. So a big place absorbs a crowd that would send a guest
 * straight past a small one.
 *
 * `clean` is `upkeep.ts`'s, 1 spotless and 0 filthy, and it multiplies the worth
 * of the visit rather than dividing it: a dirty place is a slightly worse visit,
 * not a further walk. Floored at {@link DIRT_FLOOR} so the worst venue on the
 * plot is still a candidate; see there for why zero would be a bug.
 *
 * `busy` is everybody at the venue - {@link ChoiceOptions.occupants} inside and
 * {@link ChoiceOptions.queueLength} waiting - and not only the line. A line
 * forms only once a place is full, so a term that counted the line alone said
 * nothing at all about a venue that was merely getting busy, which on a plot
 * where the big venues rarely fill is every venue every day. See
 * {@link CROWDING} for what it is worth.
 *
 * The distance enters through this one expression and nothing else, which is
 * what let plan 017 hand in the real walking distance without touching anything
 * around it: `ChoiceOptions.walkingDistance` replaces the straight line where
 * the caller has a flow field that knows it, and the line stands where it has
 * not. An unreachable venue arrives here as `Infinity` and scores zero, which is
 * the same thing as not being a candidate.
 */
function scoreFor(
  desire: number,
  clean: number,
  distance: number,
  reach: number,
  busy: number,
  capacity: number,
): number {
  return (
    (desire * (DIRT_FLOOR + (1 - DIRT_FLOOR) * clean)) /
    (1 + distance / reach) /
    (1 + (CROWDING * busy) / Math.max(1, capacity))
  );
}

/** Every venue's line holding the ceiling, where the caller has no lanes to say otherwise. */
const atCeiling = (): number => MAX_QUEUE_SHOWN;

/**
 * How far this person would have to go to venue `index`, on foot where the
 * caller knows and as the crow flies where it does not.
 *
 * Its own function because {@link weigh} asks it of every candidate and
 * {@link chooseVenue} asks it again of the winner, whose walk is what
 * `dominantNeedAt` is answered against - one expression rather than two that
 * have to be kept saying the same thing.
 */
function distanceTo(options: ChoiceOptions, index: number): number {
  const venue = options.venues[index]!;
  return options.walkingDistance
    ? options.walkingDistance(index)
    : Math.hypot(venue.x - options.x, venue.z - options.z);
}

/**
 * What one venue is worth to this person from where they stand, or 0 for
 * something that is not a candidate at all.
 *
 * Split out of {@link chooseVenue}'s loop rather than written inside it because
 * `pnpm fallow:audit` fails a function over its complexity threshold, and the
 * loop is now four reasons to skip a venue and three terms to weigh it by.
 * Allocation free, as the header promises: it hands back one number.
 */
function weigh(
  options: ChoiceOptions,
  index: number,
  reach: number,
  queueLimit: (venue: number) => number,
  justLeft: number,
): number {
  const { needs, guests, person, queueLength, occupants, affinity } = options;
  const venue = options.venues[index]!;
  const distance = distanceTo(options, index);
  // Somewhere that cannot be walked to is not somewhere to go, however good it
  // would be: `Infinity` is how the router says a venue has no path to it.
  if (!Number.isFinite(distance)) return 0;
  // The distance before the worth, because the worth depends on it: how much
  // room a relief has to fill is how much room there will be once they have
  // walked there. See `appeal.ts`.
  const gain = appealOf(venue, needs, guests, person, distance);
  // A place that does nothing for this person - or leaves them worse off on
  // balance - is not a candidate at all, rather than a bad one.
  if (gain <= 0) return 0;
  const queued = queueLength ? queueLength(index) : 0;
  // The same threshold the router turns somebody away at - the venue's own lane,
  // or the ceiling `arriveAt` counts to - rather than one written out twice: a
  // guest who would be refused at the door is not a candidate here, or they
  // would cross the plot to be sent straight back.
  if (queued >= queueLimit(index)) return 0;
  // The line and the room are counted together here and kept apart above: one is
  // "would they be refused at the door" and the other is "is it nice in there",
  // and they are bounded by different things.
  const busy = (occupants ? occupants(index) : 0) + queued;
  // What the visit is worth to *this* person: what the art and the archetype
  // agree on, bent by how much they happen to like the place and halved for the
  // one they have only just come out of.
  const desire = gain * (affinity ? affinity(index) : 1) * (index === justLeft ? REVISIT : 1);
  // Everything spotless where the caller keeps no upkeep, which is what leaves
  // every fixture written before plan 022 scoring exactly as it did.
  const clean = options.cleanliness ? options.cleanliness(index) : 1;
  return scoreFor(desire, clean, distance, reach, busy, venue.capacity);
}

/**
 * Where this person would go, or null when they want nothing or nowhere serves
 * what they want.
 *
 * Three things it deliberately does not do:
 *
 * - It does not plan a route round the resort. One visit is chosen, and when it
 *   ends the guest decides again from wherever they now are.
 * - It does not build a flow field to find out how far anything is. The router
 *   hands in {@link ChoiceOptions.walkingDistance} for the venues it has already
 *   swept and leaves the rest on the straight line; see {@link scoreFor}.
 * - It does not count who is where for itself. The router hands in
 *   {@link ChoiceOptions.queueLength} and {@link ChoiceOptions.occupants},
 *   which are the only things that know; see `occupancy.ts`.
 *
 * Ties break towards the lower venue index, so the answer does not depend on
 * iteration luck and a rebuilt plot chooses the same way.
 */
export function chooseVenue(options: ChoiceOptions): VenueChoice | null {
  const { needs, guests, person, venues } = options;
  const wanted = strongestNeed(needs, guests, person);
  if (wanted === null) return null;
  const { reach } = archetypeOf(guests, person);
  const justLeft = options.justLeft ?? -1;
  const queueLimit = options.queueLimit ?? atCeiling;

  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < venues.length; index++) {
    const score = weigh(options, index, reach, queueLimit, justLeft);
    if (score <= bestScore) continue;
    bestScore = score;
    best = index;
  }
  if (best < 0) return null;
  // Once, for the winner. What the visit is *for* is a different question from
  // which visit is best, and asking it of every candidate would be four fifths
  // of the work thrown away.
  const walk = distanceTo(options, best);
  const need = dominantNeedAt(venues[best]!, needs, guests, person, walk) ?? wanted.need;
  return { venue: best, need };
}
