import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SimSpeed } from '../features/sim/domain/simClock';

/**
 * The clock controls, as React state.
 *
 * Only the speed lives here. The time does not: it moves every frame while the
 * resort runs, and the slider and the day readout are written straight to the
 * DOM by `hudOverlay` rather than through React — see `useHudNodes`.
 */
export interface ClockControls {
  readonly speed: SimSpeed;
  /** Jumps to a moment of the day; the resort keeps running. */
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
}

export function useClockControls(showcase: RefObject<Showcase | null>): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('paused');

  return {
    speed,
    setTime: useCallback(
      (time: number) => {
        showcase.current?.setTime(time);
      },
      [showcase],
    ),
    setSpeed: useCallback(
      (next: SimSpeed) => {
        setSpeed(next);
        showcase.current?.setSpeed(next);
      },
      [showcase],
    ),
  };
}
