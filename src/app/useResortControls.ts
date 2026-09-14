import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import type { Showcase } from './showcase';

/**
 * The generator controls, as React state.
 *
 * Kept out of `App` because it is the only part of the app with a shape of its
 * own: everything else there is one state, one setter and one line of JSX, and
 * this is a small state machine — staged parameters, work that takes seconds,
 * and a panel that says so until it is done.
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

export function useResortControls(showcase: RefObject<Showcase | null>): ResortControls {
  const [params, setParams] = useState<ResortParams | null>(null);
  const [building, setBuilding] = useState(false);

  const rebuild = useCallback(
    (next: ResortParams, run: (mounted: Showcase) => Promise<void>) => {
      const mounted = showcase.current;
      if (!mounted) return;
      setBuilding(true);
      // Optimistic, so the panel reads back what was asked for while it waits;
      // the showcase's own clamped answer replaces it once the work is done.
      setParams(next);
      // The growing and the baking happen off the main thread, so the resort on
      // screen keeps drawing — and the panel keeps saying "Building…" — until
      // the new one is ready to swap in.
      run(mounted)
        .then(() => setParams(mounted.params))
        .catch((cause: unknown) => console.error(cause))
        .finally(() => setBuilding(false));
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
