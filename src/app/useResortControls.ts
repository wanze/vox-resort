import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import type { Showcase } from './showcase';

export interface ResortControls {
  readonly params: ResortParams | null;
  readonly building: boolean;
  readonly open: boolean;
  adopt(params: ResortParams): void;
  adoptOpen(open: boolean): void;
  setOpen(open: boolean): void;
  generate(params: ResortParams): void;
  clear(params: ResortParams): void;
}

export function useResortControls(showcase: RefObject<Showcase | null>): ResortControls {
  const [params, setParams] = useState<ResortParams | null>(null);
  const [building, setBuilding] = useState(false);
  const [open, adoptOpen] = useState(true);

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
    open,
    adopt: setParams,
    adoptOpen,
    // The showcase answers through onOpenChange, so the state follows what it did.
    setOpen: useCallback((next: boolean) => showcase.current?.setOpen(next), [showcase]),
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
