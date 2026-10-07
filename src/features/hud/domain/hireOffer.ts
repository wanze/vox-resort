import type { Advice, AdviceKind } from '../../sim/domain/advice';
import {
  isStaffRole,
  shortOf,
  type Hiring,
  type Roster,
  type StaffRole,
} from '../../sim/domain/staff';

export interface StaffNumbers {
  readonly roster: Roster;
  readonly recommended: Roster;
  readonly hiring: Hiring;
}

// The hand-set count a click hires to. One is a single body for one place's problem, where
// short-staffed advice tops the role up to the whole plot's need.
export interface HireOffer {
  readonly role: StaffRole;
  readonly count: number;
  readonly one: boolean;
}

const WORKED_BY: { readonly [kind in AdviceKind]?: StaffRole } = {
  unwatched: 'lifeguard',
  broken: 'mechanic',
  dirty: 'cleaner',
  unmade: 'cleaner',
};

// Only a hand-set role short of the plot: on Auto the roster already follows the plot, and past
// the recommendation another body is not what the place is missing.
export function hireOffer(advice: Advice, staff: StaffNumbers | null): HireOffer | null {
  const role = advice.kind === 'short-staffed' ? advice.subject : WORKED_BY[advice.kind];
  if (!staff || role === undefined || !isStaffRole(role)) return null;
  if (!shortOf(staff.hiring, staff.recommended).some((each) => each.role === role)) return null;
  return advice.kind === 'short-staffed'
    ? { role, count: staff.recommended[role], one: false }
    : { role, count: staff.roster[role] + 1, one: true };
}
