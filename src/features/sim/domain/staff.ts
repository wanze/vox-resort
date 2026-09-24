export type StaffRole = 'cleaner';

// Declared here rather than derived from the art so the domain stays pure;
// `showcase.ts` asserts it matches `STAFF_SOURCES`.
export const STAFF_ROLES: readonly StaffRole[] = ['cleaner'];

// Staff are not guests: in the guest registry they would skew every HUD count.
export interface Staff {
  readonly count: number;
  readonly role: readonly StaffRole[];
  readonly variant: Int32Array;
}

// A cleaner keeps up with two or three venues, so one per six falls behind where
// a venue is hammered. That gap is the mechanic.
const CLEANERS_PER_VENUE = 1 / 6;

// A ninefold benchmark plot would otherwise make staff the most expensive thing drawn.
const MAX_STAFF = 40;

// At least one wherever anything stands, or a small plot degrades with no visible reason.
export function staffFor(venues: number): Staff {
  const wanted = venues > 0 ? Math.max(1, Math.round(venues * CLEANERS_PER_VENUE)) : 0;
  const count = Math.min(MAX_STAFF, wanted);
  const role: StaffRole[] = Array.from({ length: count }, () => 'cleaner');
  const variant = new Int32Array(count);
  for (let worker = 0; worker < count; worker++) {
    variant[worker] = STAFF_ROLES.indexOf(role[worker]!);
  }
  return { count, role, variant };
}
