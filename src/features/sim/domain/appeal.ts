/**
 * What one visit is worth to one person.
 *
 * `chooseVenue.ts` used to score a venue on a single number: the amount the art
 * declares for the one loudest need. Everything else the model says about
 * itself - the second need it serves, the energy it costs, and how much of the
 * relief the guest had any room for - was dropped on the floor, and the largest
 * declared amount on the plot won every decision. That is what put a Pool Bar's
 * thirst 1.0 permanently ahead of a Beachclub's 0.4 however long the bar's line
 * got, and what left a Snack Bar beside a Restaurant with no visits at all. See
 * `plans/030-balance-the-choice.md`.
 *
 * ## Only the part of the relief that fits
 *
 * A level is clamped at 1, so relief above what a guest is short of goes
 * nowhere. Crediting the declared amount in full is the single biggest reason
 * one venue took every visit: it made the biggest number win however mildly
 * anybody wanted anything. Counting only the usable part gives the shape the
 * genre wants - **at mild need the venues tie and the layout decides; at severe
 * need the art decides** - so where a thing is put starts to matter more than
 * what it is.
 *
 * ## Scored for when they get there, not for where they stand
 *
 * The room a relief has to fill is the room there will be **on arrival**, which
 * on a long walk is not the room there is now. Scored from where they stand, a
 * family half hungry values a Restaurant's 1.0 at the 0.7 they have room for,
 * which is close enough to a near Ice Cream Stand's 0.25 that the layout decides
 * - and they walk eighty simulated minutes for a 0.25 and come out hungrier than
 * they set off. Discounting the level by what the walk will decay costs one
 * multiply, uses `archetypes.ts`'s own rates and `crowdRate.ts`'s own pace, and
 * adds no dial. A venue at the door is unaffected, so the tie the section above
 * is about still happens where it should.
 *
 * ## Every need the venue declares, the negative ones included
 *
 * A Beachclub that is fun *and* a drink is worth more to somebody who is both
 * bored and thirsty than either half of it, and a Basketball Court that takes
 * 0.4 of your energy is worth less than the same fun for free. Both fall out of
 * summing `satisfies` rather than reading one entry of it.
 *
 * ## Nothing here knows what a bakery is
 *
 * Every number is the art's or `archetypes.ts`'s. There is no table in this
 * module and there must not be one.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { archetypeOf } from './archetypes';
import { WALK_VOXELS_PER_SIM_HOUR } from './crowdRate';
import { NEEDS, type Needs } from './needs';
import type { Venue } from './venues';

/**
 * How much of `amount` this person can actually use, given how met the need
 * already is.
 *
 * A guest whose hunger sits at 0.5 gains half a meal from the Restaurant's 1.0
 * and half from the Snack Bar's 0.6 - the same half, because a level is clamped
 * at 1 and the rest of the Restaurant's meal goes nowhere.
 *
 * A negative amount is a cost and is bounded the same way from below: an hour of
 * basketball takes 0.4 of your energy, or all of it if you had less than that.
 */
export function usableGain(amount: number, level: number): number {
  return amount >= 0 ? Math.min(amount, 1 - level) : -Math.min(-amount, level);
}

/**
 * How met a need will be once this person has walked `hours` to get to it.
 *
 * Clamped at 0 from below, exactly as `decayNeeds` clamps it: a need cannot get
 * worse than desperate, and an unclamped estimate would make a walk across the
 * plot look like unlimited room for relief.
 */
function levelOnArrival(level: number, decayPerHour: number, hours: number): number {
  // A need that is completely met is not anticipated. The walk deepens a need
  // somebody already has; it does not invent one, or a guest who wants nothing
  // but a sandwich would be pulled across the plot to a bar by the thirst they
  // are going to have when they get there. It also keeps a declared **cost**
  // costing full price: `usableGain` bounds a negative by the level, and a full
  // tank is exactly where an hour of basketball takes the whole 0.4.
  if (level >= 1) return 1;
  const dropped = level - decayPerHour * hours;
  return dropped < 0 ? 0 : dropped;
}

/**
 * What one visit here is worth to this person: every need the art declares,
 * weighted by the archetype, and 0 or less where it is not worth going.
 *
 * Iterates `satisfies` and not {@link NEEDS}, which is both cheaper - one or two
 * entries against five - and the right rule: a need the art does not declare
 * contributes nothing, and there is nothing to look up for it.
 */
export function appealOf(
  venue: Venue,
  needs: Needs,
  guests: Guests,
  person: number,
  /** How far they would walk to it, in voxels. Omit it and they are at the door. */
  distance = 0,
): number {
  const { weight, decayPerHour } = archetypeOf(guests, person);
  const hours = distance / WALK_VOXELS_PER_SIM_HOUR;
  let gain = 0;
  for (const relief of venue.satisfies) {
    const level = levelOnArrival(
      needs.level[relief.need][person]!,
      decayPerHour[relief.need],
      hours,
    );
    gain += weight[relief.need] * usableGain(relief.amount, level);
  }
  return gain;
}

/**
 * Which need most of that was, for the inspector's line and for `Goals.need`.
 *
 * Null where no need the venue serves is worth anything to this person, which is
 * the same answer as "there is nothing to say about why they went".
 *
 * Ties break towards the earlier entry of {@link NEEDS}, as `strongestNeed`
 * does, so the answer does not depend on the order a model happened to list its
 * reliefs in.
 */
export function dominantNeedAt(
  venue: Venue,
  needs: Needs,
  guests: Guests,
  person: number,
  /** How far they would walk to it, in voxels; see {@link appealOf}. */
  distance = 0,
): GuestNeed | null {
  const { weight, decayPerHour } = archetypeOf(guests, person);
  const hours = distance / WALK_VOXELS_PER_SIM_HOUR;
  let best: GuestNeed | null = null;
  let most = 0;
  for (const relief of venue.satisfies) {
    const level = levelOnArrival(
      needs.level[relief.need][person]!,
      decayPerHour[relief.need],
      hours,
    );
    const gain = weight[relief.need] * usableGain(relief.amount, level);
    if (gain <= 0) continue;
    const louder =
      best === null ||
      gain > most ||
      (gain === most && NEEDS.indexOf(relief.need) < NEEDS.indexOf(best));
    if (!louder) continue;
    most = gain;
    best = relief.need;
  }
  return best;
}

/**
 * A venue's own number, hashed from its key, for mixing with a person's index in
 * {@link tasteFor}.
 *
 * Off the **key** and never the index: a venue's index changes whenever anything
 * on the plot is built or bulldozed, and a taste keyed on it would reshuffle
 * everybody's preferences every time the player laid a path.
 *
 * FNV-1a, which is what `resortLayout.test.ts` already hashes a plot with.
 */
export function saltFor(key: string): number {
  let hash = 2166136261;
  for (let at = 0; at < key.length; at++) hash = Math.imul(hash ^ key.charCodeAt(at), 16777619);
  return hash | 0;
}

/**
 * How much this person happens to like this venue: `1 - spread / 2` to
 * `1 + spread / 2`, the same answer every time for the same pair.
 *
 * This is what stops a venue that is 10% behind on the formula getting literally
 * no visits: it is still the best answer for the guests who happen to like it.
 *
 * **Not a draw.** A seeded random per decision would spread a crowd just as
 * well, and it would make the benchmark's replay incomparable and the
 * inspector's line unexplainable - "why did she walk past the pool" has to have
 * an answer, and "she prefers the other one, and always has" is one.
 *
 * A finalising mix of the two integers: the multiply-shift rounds are there so
 * two people next to each other in the array, or two venues whose keys differ by
 * one character, do not get neighbouring tastes.
 */
export function tasteFor(salt: number, person: number, spread: number): number {
  let mixed = Math.imul(salt ^ (person + 0x9e3779b9), 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return 1 - spread / 2 + spread * ((mixed >>> 8) / 0x01000000);
}
