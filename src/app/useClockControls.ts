import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';

/**
 * The time-of-day controls, as React state.
 *
 * Only whether the cycle is running lives here. The time itself does not: it
 * moves every frame while the cycle runs, and the slider is written straight to
 * the DOM by `hudOverlay` rather than through React — see `useHudNodes`.
 */
export interface ClockControls {
  readonly cycling: boolean;
  /** Jumps to a moment of the day, which also stops the cycle. */
  setTime(time: number): void;
  setCycling(cycling: boolean): void;
}

export function useClockControls(showcase: RefObject<Showcase | null>): ClockControls {
  const [cycling, setCycling] = useState(false);

  return {
    cycling,
    setTime: useCallback(
      (time: number) => {
        setCycling(false);
        showcase.current?.setTime(time);
      },
      [showcase],
    ),
    setCycling: useCallback(
      (next: boolean) => {
        setCycling(next);
        showcase.current?.setCycling(next);
      },
      [showcase],
    ),
  };
}
