export type StaffRole = 'cleaner';

// Declared here rather than derived from the art so the domain stays pure;
// `showcase.ts` asserts it matches `STAFF_SOURCES`.
export const STAFF_ROLES: readonly StaffRole[] = ['cleaner'];

// Bodies per role, meshed once per resort; the roster decides how many are on duty. Capped
// because a ninefold benchmark plot would otherwise make staff the most expensive thing drawn.
export const STAFF_CAPS: { readonly [role in StaffRole]: number } = { cleaner: 40 };

// Staff are not guests: in the guest registry they would skew every HUD count.
export interface Staff {
  readonly count: number;
  readonly role: readonly StaffRole[];
  readonly variant: Int32Array;
}

export type Roster = { readonly [role in StaffRole]: number };

export interface Workplaces {
  readonly venues: number;
}

// A cleaner keeps up with two or three venues, so one per six falls behind where
// a venue is hammered. That gap is the mechanic.
const CLEANERS_PER_VENUE = 1 / 6;

// Roles in STAFF_ROLES order, so a body's index says its role for the life of the resort.
export function staffPool(): Staff {
  const role: StaffRole[] = STAFF_ROLES.flatMap((each) =>
    Array.from({ length: STAFF_CAPS[each] }, () => each),
  );
  const variant = Int32Array.from(role, (each) => STAFF_ROLES.indexOf(each));
  return { count: role.length, role, variant };
}

// At least one wherever anything stands, or a small plot degrades with no visible reason.
export function rosterFor(places: Workplaces): Roster {
  const venues = Math.max(0, places.venues);
  const cleaners = venues > 0 ? Math.max(1, Math.round(venues * CLEANERS_PER_VENUE)) : 0;
  return { cleaner: Math.min(STAFF_CAPS.cleaner, cleaners) };
}

export function onDuty(staff: Staff, roster: Roster): Uint8Array {
  const duty = new Uint8Array(staff.count);
  const seen = new Map<StaffRole, number>();
  for (let worker = 0; worker < staff.count; worker++) {
    const role = staff.role[worker]!;
    const nth = seen.get(role) ?? 0;
    seen.set(role, nth + 1);
    if (nth < roster[role]) duty[worker] = 1;
  }
  return duty;
}

// Read against the crowd's off-plot column, so a body the graph could not take yet is still
// owed its shift at the next edit.
export function shiftChange(
  duty: Uint8Array,
  offPlot: Uint8Array,
): { readonly starting: readonly number[]; readonly leaving: readonly number[] } {
  const starting: number[] = [];
  const leaving: number[] = [];
  for (let worker = 0; worker < duty.length; worker++) {
    const away = offPlot[worker] === 1;
    if (duty[worker] === 1 && away) starting.push(worker);
    else if (duty[worker] === 0 && !away) leaving.push(worker);
  }
  return { starting, leaving };
}
