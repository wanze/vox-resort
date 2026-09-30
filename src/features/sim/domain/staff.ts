import { isBeach } from './beach';
import { cheer, type Needs } from './needs';
import type { Venue } from './venues';

export type StaffRole = 'cleaner' | 'lifeguard' | 'animator' | 'mechanic';

// Declared here rather than derived from the art so the domain stays pure;
// `showcase.ts` asserts it matches `STAFF_SOURCES`.
export const STAFF_ROLES: readonly StaffRole[] = ['cleaner', 'lifeguard', 'animator', 'mechanic'];

// Bodies per role, meshed once per resort; the roster decides how many are on duty. Capped
// because a ninefold benchmark plot would otherwise make staff the most expensive thing drawn.
export const STAFF_CAPS: { readonly [role in StaffRole]: number } = {
  cleaner: 18,
  lifeguard: 8,
  animator: 8,
  mechanic: 6,
};

// Staff are not guests: in the guest registry they would skew every HUD count.
export interface Staff {
  readonly count: number;
  readonly role: readonly StaffRole[];
  readonly variant: Int32Array;
}

export type Roster = { readonly [role in StaffRole]: number };

export interface Workplaces {
  readonly venues: number;
  readonly bathing: number;
  readonly posts: number;
  readonly stages: number;
  // Optional so a plot counted before anything could break still staffs itself.
  readonly reliable?: number;
  // Optional for the same reason: a plot counted before rooms were made up.
  readonly beds?: number;
}

// A lifeguard sits a whole day where a cleaner comes and goes, an animator is a performer, and a
// mechanic is a trade.
export const WAGES: { readonly [role in StaffRole]: number } = {
  cleaner: 80,
  lifeguard: 100,
  animator: 120,
  mechanic: 110,
};

// About what a fun venue gives over a whole visit, so a show roughly doubles a visit's fun and
// no more.
const SHOW_FUN_PER_HOUR = 0.3;

// The roster, never the pool: the pool is forty bodies on an empty plot.
export function wagesFor(roster: Roster): number {
  return STAFF_ROLES.reduce((sum, role) => sum + roster[role] * WAGES[role], 0);
}

// A cleaner keeps up with two or three venues, so one per six falls behind where
// a venue is hammered. That gap is the mechanic.
const CLEANERS_PER_VENUE = 1 / 6;

// Stays average about eight nights, so sixty beds turn over about seven a day, a couple of
// spells; the rounding means a small plot's one cleaner covers its rooms.
const BEDS_PER_CLEANER = 60;

// A show moves from stage to stage, so one animator carries three.
const STAGES_PER_ANIMATOR = 3;

// The reference plot's six unreliable venues break about three times a day between them, and a
// repair with the walk there is about two hours, so one mechanic keeps up with five.
const RELIABLE_PER_MECHANIC = 5;

// Roles in STAFF_ROLES order, so a body's index says its role for the life of the resort.
export function staffPool(): Staff {
  const role: StaffRole[] = STAFF_ROLES.flatMap((each) =>
    Array.from({ length: STAFF_CAPS[each] }, () => each),
  );
  const variant = Int32Array.from(role, (each) => STAFF_ROLES.indexOf(each));
  return { count: role.length, role, variant };
}

// At least one wherever anything stands, or a small plot degrades with no visible reason.
// One lifeguard per pool and per tower: water nobody watches is the gap a lifeguard fills.
export function rosterFor(places: Workplaces): Roster {
  const venues = Math.max(0, places.venues);
  const beds = Math.max(0, places.beds ?? 0);
  const cleaners =
    venues > 0 || beds > 0
      ? Math.max(1, Math.round(venues * CLEANERS_PER_VENUE + beds / BEDS_PER_CLEANER))
      : 0;
  const lifeguards = Math.max(0, places.bathing) + Math.max(0, places.posts);
  const animators = Math.ceil(Math.max(0, places.stages) / STAGES_PER_ANIMATOR);
  const mechanics = Math.ceil(Math.max(0, places.reliable ?? 0) / RELIABLE_PER_MECHANIC);
  return {
    cleaner: Math.min(STAFF_CAPS.cleaner, cleaners),
    lifeguard: Math.min(STAFF_CAPS.lifeguard, lifeguards),
    animator: Math.min(STAFF_CAPS.animator, animators),
    mechanic: Math.min(STAFF_CAPS.mechanic, mechanics),
  };
}

// null is Auto: the role follows rosterFor as the plot changes.
export type Hiring = { readonly [role in StaffRole]: number | null };

export const AUTO_HIRING: Hiring = {
  cleaner: null,
  lifeguard: null,
  animator: null,
  mechanic: null,
};

export interface Shortfall {
  readonly role: StaffRole;
  readonly short: number;
  readonly wanted: number;
}

const clampToCap = (role: StaffRole, count: number): number =>
  Math.min(STAFF_CAPS[role], Math.max(0, Math.round(count)));

// The pool is part of every save, so nobody is hired past the cap however the count is asked for.
export function hire(hiring: Hiring, role: StaffRole, count: number | null): Hiring {
  return { ...hiring, [role]: count === null ? null : clampToCap(role, count) };
}

export function rosterOf(hiring: Hiring, recommended: Roster): Roster {
  const roster = {} as { [role in StaffRole]: number };
  for (const role of STAFF_ROLES)
    roster[role] = clampToCap(role, hiring[role] ?? recommended[role]);
  return roster;
}

// An Auto role is the recommendation by definition, so only a hand-set one can fall behind it.
export function shortOf(hiring: Hiring, recommended: Roster): readonly Shortfall[] {
  const roster = rosterOf(hiring, recommended);
  return STAFF_ROLES.filter(
    (role) => hiring[role] !== null && roster[role] < recommended[role],
  ).map((role) => ({ role, short: recommended[role] - roster[role], wanted: recommended[role] }));
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
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

// Posts are the walk graph's: a tower inland has no seat there, so it gets no lifeguard either.
export function workplacesOf(
  venues: readonly Venue[],
  posts: readonly number[],
  lodgings?: readonly { readonly beds: number }[],
): Workplaces {
  const beds = lodgings?.reduce((sum, lodging) => sum + lodging.beds, 0);
  return {
    ...(beds === undefined ? {} : { beds }),
    venues: venues.length,
    bathing: venues.filter((venue) => venue.bathing === true).length,
    posts: posts.length,
    stages: venues.filter((venue) => venue.stage === true).length,
    reliable: venues.filter((venue) => venue.reliability !== undefined).length,
  };
}

// The beach counts only once a tower stands: with none, there is nowhere to watch it from.
export function unwatched(
  venues: readonly Venue[],
  watching: (venue: number) => boolean,
  towers: number,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [index, venue] of venues.entries()) {
    if (venue.bathing !== true || watching(index)) continue;
    if (isBeach(venue) && towers <= 0) continue;
    keys.add(venue.key);
  }
  return keys;
}

// The line outside is left out: a show is for the people in the room. The shows are listed once
// per call, so a guest costs a lookup rather than a question to the staff router.
export function cheerTheAudience(
  needs: Needs,
  present: Uint8Array,
  shows: {
    readonly performing: (venue: number) => boolean;
    readonly venueOf: (person: number) => number;
    readonly waiting: (person: number) => boolean;
    readonly venues: number;
    readonly hours: number;
  },
): void {
  const performing = Uint8Array.from({ length: shows.venues }, (_, venue) =>
    shows.performing(venue) ? 1 : 0,
  );
  if (!performing.includes(1)) return;
  const amount = SHOW_FUN_PER_HOUR * shows.hours;
  for (let person = 0; person < present.length; person++) {
    if (present[person] !== 1 || performing[shows.venueOf(person)] !== 1) continue;
    if (!shows.waiting(person)) cheer(needs, person, amount);
  }
}
