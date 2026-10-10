import { SPEED_DAY_SECONDS, type SimSpeed } from './simClock';
import { isStaffNight } from './staffNight';

// Every speed's quiet night runs as a day of this many seconds would: six hours in about four
// seconds, about 1.5 ticks a frame at 60 fps, so the stars wheel past rather than jump.
export const FAST_NIGHT_DAY_SECONDS = 16;

// One guest in twenty on the way home is no reason to sit through the night: their walk falls
// behind the clock, but they reach bed before they wake (sim:report SIM_FAST_NIGHTS=1).
const AWAKE_SHARE = 0.05;
const AWAKE_FEW = 2;

export interface NightFacts {
  readonly tickOfDay: number;
  readonly staffOnShift: number;
  // Present guests with a bed who are not in it.
  readonly awake: number;
  readonly present: number;
  // An event running, or announced for the coming hour.
  readonly eventOn: boolean;
  // A venue keeping late hours still open.
  readonly lateOpen: boolean;
}

// Ends with the night itself at STAFF_BACK_AT, so dawn and the early risers run at the speed the
// player chose.
export function isQuietNight(facts: NightFacts): boolean {
  if (!isStaffNight(facts.tickOfDay)) return false;
  if (facts.staffOnShift > 0 || facts.eventOn || facts.lateOpen) return false;
  return facts.awake <= Math.max(AWAKE_FEW, AWAKE_SHARE * facts.present);
}

export interface NightGate {
  readonly on: boolean;
  readonly speed: SimSpeed;
  readonly between: boolean;
  readonly welcome: boolean;
  readonly following: boolean;
  readonly photo: boolean;
  readonly building: boolean;
  readonly inspecting: boolean;
}

// Asked before the quiet is, which counts the guests. Following, photo mode, a build tool and the
// inspector are the player looking at something that moves with the clock, so it keeps the speed
// they chose; a break and the welcome screen have a clock of their own.
export function mayRunFast(gate: NightGate): boolean {
  if (!gate.on || gate.speed === 'paused' || gate.between || gate.welcome) return false;
  return !(gate.following || gate.photo || gate.building || gate.inspecting);
}

// A factor on the frame's pace, as the fireworks' and turbo's are; 1 when the night is not quiet.
export function fastNightPace(speed: SimSpeed, quiet: boolean): number {
  if (!quiet || speed === 'paused') return 1;
  return Math.max(1, SPEED_DAY_SECONDS[speed] / FAST_NIGHT_DAY_SECONDS);
}
