import { SPEED_DAY_SECONDS, TICKS_PER_DAY, type SimSpeed } from '../../sim/domain/simClock';

export interface PaceAsk {
  readonly speed: SimSpeed;
  readonly ticksLeft: number;
  readonly secondsLeft: number;
}

// The share of the speed's pace at which the run's remaining ticks last as long as the show on
// screen. Never above 1: a show only ever slows the clock.
export function showPace(ask: PaceAsk): number {
  const { speed, ticksLeft, secondsLeft } = ask;
  if (speed === 'paused' || !(secondsLeft > 0) || !(ticksLeft > 0)) return 1;
  const ticksPerSecond = TICKS_PER_DAY / SPEED_DAY_SECONDS[speed];
  return Math.min(1, ticksLeft / secondsLeft / ticksPerSecond);
}
