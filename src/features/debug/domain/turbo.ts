import { SPEED_DAY_SECONDS, type SimSpeed } from '../../sim/domain/simClock';

// A 28-day season in about a minute. At 60 fps that is MAX_TICKS_PER_ADVANCE every frame, so a
// slower frame rate stretches the day rather than letting the clock run ahead of the sim.
export const TURBO_DAY_SECONDS = 2;

// Multiplies the frame's pace: every running speed goes to the same turbo day.
export function turboPace(speed: SimSpeed, on: boolean): number {
  if (!on || speed === 'paused') return 1;
  return SPEED_DAY_SECONDS[speed] / TURBO_DAY_SECONDS;
}
