/**
 * The simulation's clock: which day it is, what time of day, and how fast that
 * is moving.
 *
 * ## One integer of state
 *
 * Everything is derived from `ticks`, the whole simulated minutes since the
 * resort opened. The day is a division, the time of day is a remainder, and the
 * hour is the remainder scaled. Three fields kept in step would be three fields
 * that could drift out of it, and this is the number a save file will hold.
 *
 * ## A fixed tick, for the reason `MAX_STEP` exists
 *
 * The simulation is advanced in whole ticks of {@link TICK_SIM_SECONDS} and
 * never in fractions of one. A need that decayed by the frame's own delta would
 * decay faster on a fast machine, and `docs/rendering.md` is explicit that a
 * bench run only compares with the one before it if the scene is in the same
 * place on the same frame - which a frame-rate-dependent simulation is not.
 * The leftover is carried, so no simulated time is lost or double-counted.
 *
 * ## Speed is real seconds per day, not a multiplier
 *
 * "Three times speed" means nothing without saying three times what. What a
 * player actually chooses is how long they are willing to watch a day take, so
 * that is what the presets say, and the multiplier is worked out from it.
 */

/** Simulated seconds one tick covers: one simulated minute. */
const TICK_SIM_SECONDS = 60;

/** Simulated seconds in a day, which is a day. */
const SIM_SECONDS_PER_DAY = 86_400;

/** Ticks in one day: 1 440, one per simulated minute. */
export const TICKS_PER_DAY = SIM_SECONDS_PER_DAY / TICK_SIM_SECONDS;

/**
 * The most ticks one call to {@link advanceClock} will run.
 *
 * Here for `MAX_STEP`'s reason in `crowd.ts`: a backgrounded tab reports the
 * whole time it was away as one frame, and without a ceiling the resort would
 * run a week of simulation in the frame the tab came back on. The clock is
 * capped with it rather than beside it, so the calendar never gets ahead of the
 * simulation that is supposed to have happened.
 */
export const MAX_TICKS_PER_ADVANCE = 12;

/**
 * How far short of a whole tick the carry may fall and still count as one.
 *
 * A frame's simulated seconds are rarely exact in binary - a sixtieth of a
 * second at `normal` is 4.8 - and a day of them summed lands a hair under the
 * last tick as often as on it. Without this the clock would lose that tick and
 * run a day behind the frames that were fed to it. It is far below anything a
 * real frame delta can express, so it never runs a tick early.
 */
const CARRY_EPSILON = 1e-6;

export type SimSpeed = 'paused' | 'slow' | 'normal' | 'fast' | 'rush';

/** Every speed, in the order the HUD offers them. */
export const SIM_SPEEDS: readonly SimSpeed[] = ['paused', 'slow', 'normal', 'fast', 'rush'];

/**
 * How long a day takes to watch, in real seconds, at each speed.
 *
 * `rush` is where the scene was before it had a simulation in it: a day in half
 * a minute, which is the day-night cycle as a thing to look at rather than a
 * thing to play. `normal` is five minutes, which is about how long a guest takes
 * to get hungry, walk somewhere, queue and eat.
 */
export const SPEED_DAY_SECONDS: { readonly [speed in SimSpeed]: number } = {
  paused: Infinity,
  slow: 900,
  normal: 300,
  fast: 120,
  rush: 30,
};

/** How each speed reads on a button. */
export const SPEED_LABELS: { readonly [speed in SimSpeed]: string } = {
  paused: 'Pause',
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
  rush: 'Rush',
};

export interface SimClock {
  /** Whole simulated minutes since the resort opened. */
  readonly ticks: number;
  readonly speed: SimSpeed;
  /**
   * Simulated seconds run since the last whole tick. Always at least zero and
   * always below {@link TICK_SIM_SECONDS}.
   */
  readonly carry: number;
}

/** The tick of a day that `time` falls on, clamped into that day. */
function tickOfDay(time: number): number {
  const clamped = Math.min(1, Math.max(0, time));
  return Math.min(TICKS_PER_DAY - 1, Math.round(clamped * TICKS_PER_DAY));
}

/** A clock opened at `day` and `time` of it, paused. */
export function createSimClock(day: number, time: number): SimClock {
  return { ticks: day * TICKS_PER_DAY + tickOfDay(time), speed: 'paused', carry: 0 };
}

/** Whole days since the resort opened. */
export function dayOf(clock: SimClock): number {
  return Math.floor(clock.ticks / TICKS_PER_DAY);
}

/** Where the sun stands, 0..1, which is what `skyStateFor` takes. */
export function timeOf(clock: SimClock): number {
  return (clock.ticks % TICKS_PER_DAY) / TICKS_PER_DAY;
}

/** The hour of the day, 0..23. */
export function hourOf(clock: SimClock): number {
  return Math.floor((clock.ticks % TICKS_PER_DAY) / 60);
}

/** `"Day 3  14:20"`, for the HUD. */
export function clockLabel(clock: SimClock): string {
  const hour = String(hourOf(clock)).padStart(2, '0');
  const minute = String((clock.ticks % TICKS_PER_DAY) % 60).padStart(2, '0');
  return `Day ${dayOf(clock)}  ${hour}:${minute}`;
}

/**
 * Moves the clock on by a frame's worth of real time.
 *
 * Hands back the ticks the caller must now run, which is a whole number and at
 * most {@link MAX_TICKS_PER_ADVANCE}, and a clock that has advanced by exactly
 * those ticks. A paused clock runs none and does not move.
 */
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
    // The ceiling doing its job: the overflow is dropped, not queued, or it
    // would only run on the next frame instead.
    return {
      clock: { ...clock, ticks: clock.ticks + MAX_TICKS_PER_ADVANCE, carry: 0 },
      ticks: MAX_TICKS_PER_ADVANCE,
    };
  }

  const carry = Math.max(0, pending - whole * TICK_SIM_SECONDS);
  return { clock: { ...clock, ticks: clock.ticks + whole, carry }, ticks: whole };
}

/** Jumps within the current day. Does not change the speed. */
export function withTime(clock: SimClock, time: number): SimClock {
  return { ...clock, ticks: dayOf(clock) * TICKS_PER_DAY + tickOfDay(time), carry: 0 };
}

export function withSpeed(clock: SimClock, speed: SimSpeed): SimClock {
  return { ...clock, speed };
}
