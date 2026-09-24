import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import type { Showcase } from './showcase';

export interface ResortControls {
  readonly params: ResortParams | null;
  readonly building: boolean;
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
      // Optimistic; the showcase's own clamped answer replaces it once the work is done.
      setParams(next);
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
