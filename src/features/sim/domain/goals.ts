import { GUEST_NEEDS } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { partyOf } from '../../guests/domain/guests';
import type { VenueChoice } from './chooseVenue';
import type { RouterSnapshot } from './routerSnapshot';

export const NO_GOAL = -1;

export interface Goals {
  readonly count: number;
  // An index into the router's venue list, not a key: the list is rebuilt on
  // every edit, which clears all goals anyway.
  readonly venue: Int32Array;
  readonly need: Int8Array;
}

export function createGoals(count: number): Goals {
  return {
    count,
    venue: new Int32Array(count).fill(NO_GOAL),
    need: new Int8Array(count),
  };
}

// Parties stay together: whoever decides first sets the goal for everyone.
export function setPartyGoal(
  goals: Goals,
  guests: Guests,
  person: number,
  choice: VenueChoice,
): void {
  if (person < 0 || person >= goals.count) return;
  const need = GUEST_NEEDS.indexOf(choice.need);
  for (const member of partyOf(guests, person)) {
    if (member >= goals.count) continue;
    goals.venue[member] = choice.venue;
    goals.need[member] = need;
  }
}

// For an errand no need explains, such as checking in.
export function setPartyVenue(goals: Goals, guests: Guests, person: number, venue: number): void {
  if (person < 0 || person >= goals.count) return;
  for (const member of partyOf(guests, person)) {
    if (member >= goals.count) continue;
    goals.venue[member] = venue;
  }
}

export function clearPartyGoal(goals: Goals, guests: Guests, person: number): void {
  if (person < 0 || person >= goals.count) return;
  for (const member of partyOf(guests, person)) {
    if (member >= goals.count) continue;
    goals.venue[member] = NO_GOAL;
  }
}

export function clearAllGoals(goals: Goals): void {
  goals.venue.fill(NO_GOAL);
}

// `need` is saved too: it is never cleared, so it still says why a goal was set.
export function snapshotGoals(goals: Goals): RouterSnapshot['goals'] {
  return { venue: goals.venue.slice(), need: goals.need.slice() };
}

export function restoreGoals(goals: Goals, snapshot: RouterSnapshot['goals']): void {
  goals.venue.set(snapshot.venue);
  goals.need.set(snapshot.need);
}
