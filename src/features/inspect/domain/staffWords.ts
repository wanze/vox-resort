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
  // The venue goes by a name of its own, which reads without "the".
  readonly named?: boolean;
  // Sent by an order, which the player wants to see being followed.
  readonly ordered?: boolean;
}

// Each takes the place as it is referred to: "the Bar", or "The Anchor".
const AT_A_VENUE: { readonly [role in StaffRole]: (place: string) => string } = {
  cleaner: (place) => `Cleaning ${place}`,
  lifeguard: (place) => `Watching ${place}`,
  animator: (place) => `Putting on a show at ${place}`,
  mechanic: (place) => `Mending ${place}`,
};

const theOf = (label: string | null): string | null => (label ? `the ${label}` : null);

const toThe = (place: string | null): string => (place ? `On the way to ${place}` : 'Walking');

const sentTo = (place: string | null): string => `Sent to ${place ?? 'the job'}`;

function venueWords(facts: TaskFacts): string {
  const place = facts.named ? facts.venue : theOf(facts.venue);
  if (!facts.working) return facts.ordered ? sentTo(place) : toThe(place);
  return place ? AT_A_VENUE[facts.role](place) : 'At work';
}

export function taskWords(facts: TaskFacts): string {
  const { kind, working } = facts;
  if (kind === 'off') return 'Off duty';
  if (kind === 'home') return 'Going home';
  if (kind === 'idle') return 'Waiting for work';
  if (kind === 'venue') return venueWords(facts);
  if (kind === 'room') {
    return working
      ? `Making up a room at the ${facts.lodging ?? 'lodging'}`
      : toThe(theOf(facts.lodging));
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
