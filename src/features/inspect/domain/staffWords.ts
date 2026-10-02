import type { StaffRole } from '../../sim/domain/staff';
import type { StaffTaskKind } from '../../sim/domain/staffRouter';

const ROLE_TITLES: { readonly [role in StaffRole]: string } = {
  cleaner: 'Cleaner',
  lifeguard: 'Lifeguard',
  animator: 'Animator',
  mechanic: 'Mechanic',
};

export const roleTitle = (role: StaffRole): string => ROLE_TITLES[role];

// Counted from one within the role, so the seventh cleaner is Cleaner 7 whoever is hired beside.
export function staffName(roles: readonly StaffRole[], worker: number): string {
  const role = roles[worker]!;
  let nth = 0;
  for (let each = 0; each <= worker; each++) if (roles[each] === role) nth++;
  return `${ROLE_TITLES[role]} ${nth}`;
}

export interface TaskFacts {
  readonly kind: StaffTaskKind;
  readonly working: boolean;
  readonly role: StaffRole;
  // Labels of the venue and the lodging the task names, or null.
  readonly venue: string | null;
  readonly lodging: string | null;
  // Sent by an order, which the player wants to see being followed.
  readonly ordered?: boolean;
}

const AT_A_VENUE: { readonly [role in StaffRole]: (label: string) => string } = {
  cleaner: (label) => `Cleaning the ${label}`,
  lifeguard: (label) => `Watching the ${label}`,
  animator: (label) => `Putting on a show at the ${label}`,
  mechanic: (label) => `Mending the ${label}`,
};

const toThe = (label: string | null): string => (label ? `On the way to the ${label}` : 'Walking');

const sentTo = (label: string | null): string => `Sent to the ${label ?? 'job'}`;

function venueWords(facts: TaskFacts): string {
  if (!facts.working) return facts.ordered ? sentTo(facts.venue) : toThe(facts.venue);
  return facts.venue ? AT_A_VENUE[facts.role](facts.venue) : 'At work';
}

export function taskWords(facts: TaskFacts): string {
  const { kind, working } = facts;
  if (kind === 'off') return 'Off duty';
  if (kind === 'home') return 'Going home';
  if (kind === 'idle') return 'Waiting for work';
  if (kind === 'venue') return venueWords(facts);
  if (kind === 'room') {
    return working ? `Making up a room at the ${facts.lodging ?? 'lodging'}` : toThe(facts.lodging);
  }
  if (kind === 'sweep') return working ? 'Sweeping a path' : sweepWalk(facts);
  if (kind === 'restock') return working ? 'Restocking at the depot' : 'Fetching supplies';
  return working ? 'Watching the beach' : 'On the way to the tower';
}

const sweepWalk = (facts: TaskFacts): string =>
  facts.ordered ? 'Sent to sweep a path' : 'On the way to sweep a path';

// A tooltip's second half: "Cleaner 7, sweeping a path".
export const pinTitle = (name: string, words: string): string =>
  `${name}, ${words.charAt(0).toLowerCase()}${words.slice(1)}`;
