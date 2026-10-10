import type { StaffRole } from './staff';
import { TICKS_PER_DAY } from './simClock';

// Two hours before the first guest wakes (07:00), so the night's rooms and litter are seen to
// before anybody sees them, and the early risers have somebody about at dawn.
export const STAFF_BACK_AT = 5 * 60;

// The last party's bedtime is 21:30 (night.ts), so before ten the resort is still awake however
// quiet it looks.
export const EVENING_ENDS_FROM = 22 * 60;

export interface Evening {
  readonly tickOfDay: number;
  // An event running, or announced for the coming hour.
  readonly eventOn: boolean;
  // A venue keeping late hours, the night club and its DJ, still open.
  readonly lateOpen: boolean;
  // Guests inside open bathing water.
  readonly swimmers: number;
}

export function isStaffNight(tickOfDay: number): boolean {
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return tick >= EVENING_ENDS_FROM || tick < STAFF_BACK_AT;
}

// One evening for the whole crew rather than a clock-off hour: the last show, the last DJ set or
// the club's last orders is when the guests stop needing anybody, and a lifeguard is only needed
// while somebody is in the water.
export function offForTheNight(role: StaffRole, evening: Evening): boolean {
  if (!isStaffNight(evening.tickOfDay)) return false;
  if (role === 'lifeguard') return evening.swimmers === 0;
  return !evening.eventOn && !evening.lateOpen;
}

// A cleaner or a mechanic finishes the spell in hand; a show or a watch has no natural end, and
// the evening being over is what ends it.
export const finishesFirst = (role: StaffRole): boolean =>
  role === 'cleaner' || role === 'mechanic';

export function onShiftOf(duty: Uint8Array, off: Uint8Array): Uint8Array {
  return duty.map((each, worker) => (each === 1 && off[worker] !== 1 ? 1 : 0));
}
