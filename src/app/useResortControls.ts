import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import type { Showcase } from './showcase';

/**
 * The generator controls, as React state.
 *
 * Kept out of `App` because it is the only part of the app with a shape of its
 * own: everything else there is one state, one setter and one line of JSX, and
 * this is a small state machine — staged parameters, work that blocks the main
 * thread, and a panel that has to be disabled before the thread goes away.
 */
export interface ResortControls {
  /** What the resort on screen was grown from, or null before one exists. */
  readonly params: ResortParams | null;
  /** True while a plot is being laid out and baked. */
  readonly building: boolean;
  /** Records what the mounted showcase started from. */
  adopt(params: ResortParams): void;
  generate(params: ResortParams): void;
  clear(params: ResortParams): void;
}

/**
 * Runs something heavy after the browser has painted what is on screen now.
 *
 * Laying a plot out and baking its lamps is most of a second on the main thread,
 * and React cannot paint while it runs — so a "Building…" state set beside the
 * call would only ever appear after the work it announced had finished. Two
 * frames of grace is what puts it on screen before the thread goes away.
 */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run));
}

export function useResortControls(showcase: RefObject<Showcase | null>): ResortControls {
  const [params, setParams] = useState<ResortParams | null>(null);
  const [building, setBuilding] = useState(false);

  const rebuild = useCallback(
    (next: ResortParams, run: (mounted: Showcase) => void) => {
      const mounted = showcase.current;
      if (!mounted) return;
      setBuilding(true);
      // Optimistic, so the panel reads back what was asked for while it waits;
      // the showcase's own clamped answer replaces it once the work is done.
      setParams(next);
      afterPaint(() => {
        try {
          run(mounted);
          setParams(mounted.params);
        } finally {
          setBuilding(false);
        }
      });
    },
    [showcase],
  );

  return {
    params,
    building,
    adopt: setParams,
    generate: useCallback(
      (next: ResortParams) => rebuild(next, (mounted) => mounted.generate(next)),
      [rebuild],
    ),
    clear: useCallback(
      (next: ResortParams) => rebuild(next, (mounted) => mounted.clear(next)),
      [rebuild],
    ),
  };
}
