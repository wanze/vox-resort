/**
 * Where everybody is trying to get to.
 *
 * Columns parallel to `Guests` and keyed by the same person index, for the
 * reason `Needs` is: identity is written once and this is rewritten whenever
 * somebody arrives somewhere and decides again. Two integers a person, so the
 * whole plot's intentions cost a few kilobytes and nothing for the collector to
 * walk.
 *
 * The venue is an **index into the router's own list** rather than a key,
 * because the list is rebuilt wholesale when the plot is edited and a goal
 * cannot survive that anyway - the nodes it was routing over are gone too. See
 * {@link clearAllGoals}, which is what a rebuild calls.
 */

import type { Guests } from '../../guests/domain/guests';
import { partyOf } from '../../guests/domain/guests';
import type { VenueChoice } from './chooseVenue';
import { NEEDS } from './needs';

/** Nobody has decided where this person is going. */
export const NO_GOAL = -1;

export interface Goals {
  readonly count: number;
  /** Index into the router's venue list, or {@link NO_GOAL}. */
  readonly venue: Int32Array;
  /** Index into `NEEDS` of what they are going for; meaningless without a venue. */
  readonly need: Int8Array;
}

export function createGoals(count: number): Goals {
  return {
    count,
    venue: new Int32Array(count).fill(NO_GOAL),
    need: new Int8Array(count),
  };
}

/**
 * Sets the whole party's goal, not just this person's.
 *
 * Holidays are taken together: a family that splits up at the first junction is
 * four people who happen to share a surname. The person who arrived somewhere
 * and decided is the one whose choice the rest take, which is a leader chosen by
 * whoever got there first rather than a fixed one - and that is enough, because
 * they are all walking to the same place either way.
 */
export function setPartyGoal(
  goals: Goals,
  guests: Guests,
  person: number,
  choice: VenueChoice,
): void {
  if (person < 0 || person >= goals.count) return;
  const need = NEEDS.indexOf(choice.need);
  for (const member of partyOf(guests, person)) {
    if (member >= goals.count) continue;
    goals.venue[member] = choice.venue;
    goals.need[member] = need;
  }
}

/** Forgets a party's goal, e.g. once it has been reached or the venue is gone. */
export function clearPartyGoal(goals: Goals, guests: Guests, person: number): void {
  if (person < 0 || person >= goals.count) return;
  for (const member of partyOf(guests, person)) {
    if (member >= goals.count) continue;
    goals.venue[member] = NO_GOAL;
  }
}

/** Drops every goal, for when the venues have been rebuilt underneath them. */
export function clearAllGoals(goals: Goals): void {
  goals.venue.fill(NO_GOAL);
}
