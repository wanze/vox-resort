// Advanced in whole fixed ticks, never frame deltas, so a bench run replays the
// same simulation on any machine.

const TICK_SIM_SECONDS = 60;

const SIM_SECONDS_PER_DAY = 86_400;

export const TICKS_PER_DAY = SIM_SECONDS_PER_DAY / TICK_SIM_SECONDS;

// A backgrounded tab reports its whole absence as one frame; without a ceiling
// the resort would run a week of simulation in it.
export const MAX_TICKS_PER_ADVANCE = 12;

// Frame deltas are rarely exact in binary, and a day of them summed lands a hair
// under the last tick as often as on it.
const CARRY_EPSILON = 1e-6;

export type SimSpeed = 'paused' | 'slow' | 'normal' | 'fast' | 'rush';

export const SIM_SPEEDS: readonly SimSpeed[] = ['paused', 'slow', 'normal', 'fast', 'rush'];

export const SPEED_DAY_SECONDS: { readonly [speed in SimSpeed]: number } = {
  paused: Infinity,
  slow: 900,
  normal: 300,
  fast: 120,
  rush: 30,
};

export const SPEED_LABELS: { readonly [speed in SimSpeed]: string } = {
  paused: 'Pause',
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
  rush: 'Rush',
};

export interface SimClock {
  // Whole simulated minutes since the resort opened.
  readonly ticks: number;
  readonly speed: SimSpeed;
  readonly carry: number;
}

function tickOfDay(time: number): number {
  const clamped = Math.min(1, Math.max(0, time));
  return Math.min(TICKS_PER_DAY - 1, Math.round(clamped * TICKS_PER_DAY));
}

export function createSimClock(day: number, time: number): SimClock {
  return { ticks: day * TICKS_PER_DAY + tickOfDay(time), speed: 'paused', carry: 0 };
}

export function dayOf(clock: SimClock): number {
  return Math.floor(clock.ticks / TICKS_PER_DAY);
}

export function timeOf(clock: SimClock): number {
  return (clock.ticks % TICKS_PER_DAY) / TICKS_PER_DAY;
}

export function hourOf(clock: SimClock): number {
  return Math.floor((clock.ticks % TICKS_PER_DAY) / 60);
}

export function clockLabel(clock: SimClock): string {
  const hour = String(hourOf(clock)).padStart(2, '0');
  const minute = String((clock.ticks % TICKS_PER_DAY) % 60).padStart(2, '0');
  return `Day ${dayOf(clock)}  ${hour}:${minute}`;
}

export function advanceClock(
  clock: SimClock,
  realSeconds: number,
): { readonly clock: SimClock; readonly ticks: number } {
  // `!(> 0)` rather than `<= 0`, so a NaN delta is refused along with a negative one.
  if (clock.speed === 'paused' || !(realSeconds > 0)) return { clock, ticks: 0 };

  const simSeconds = realSeconds * (SIM_SECONDS_PER_DAY / SPEED_DAY_SECONDS[clock.speed]);
  const pending = clock.carry + simSeconds;
  const whole = Math.floor(pending / TICK_SIM_SECONDS + CARRY_EPSILON);

  if (whole > MAX_TICKS_PER_ADVANCE) {
    return {
      clock: { ...clock, ticks: clock.ticks + MAX_TICKS_PER_ADVANCE, carry: 0 },
      ticks: MAX_TICKS_PER_ADVANCE,
    };
  }

  const carry = Math.max(0, pending - whole * TICK_SIM_SECONDS);
  return { clock: { ...clock, ticks: clock.ticks + whole, carry }, ticks: whole };
}

export function withTime(clock: SimClock, time: number): SimClock {
  return { ...clock, ticks: dayOf(clock) * TICKS_PER_DAY + tickOfDay(time), carry: 0 };
}

export function withSpeed(clock: SimClock, speed: SimSpeed): SimClock {
  return { ...clock, speed };
}
