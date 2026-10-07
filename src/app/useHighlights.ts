import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  keptPicks,
  toggledPick,
  type HighlightPick,
  type HighlightType,
} from '../features/highlights/domain/highlights';
import type { Showcase } from './showcase';

export interface HighlightControls {
  readonly types: readonly HighlightType[];
  readonly picks: readonly HighlightPick[];
  // Stable, so the mount effect can hold it.
  readonly adopt: (types: readonly HighlightType[]) => void;
  readonly toggle: (family: string) => void;
  readonly clear: () => void;
}

export function useHighlights(
  showcase: RefObject<Showcase | null>,
  sceneUp: boolean,
): HighlightControls {
  const [types, setTypes] = useState<readonly HighlightType[]>([]);
  const [picks, setPicks] = useState<readonly HighlightPick[]>([]);
  useEffect(() => {
    if (sceneUp) showcase.current?.setHighlights(picks);
  }, [showcase, sceneUp, picks]);
  return {
    types,
    picks,
    adopt: useCallback((next: readonly HighlightType[]) => {
      setTypes(next);
      setPicks((current) => keptPicks(current, next));
    }, []),
    toggle: useCallback((family: string) => {
      setPicks((current) => toggledPick(current, family));
    }, []),
    clear: useCallback(() => setPicks([]), []),
  };
}
