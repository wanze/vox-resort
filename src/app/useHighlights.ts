import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  keptPicks,
  toggledPick,
  type HighlightPick,
} from '../features/highlights/domain/highlights';
import type { Showcase } from './showcase';
import type { HighlightControls } from '../features/highlights/components/highlightControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

export function useHighlights(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  sceneUp: boolean,
): HighlightControls {
  const types = useHudSlice(hud, (state) => state.highlightTypes);
  const [picks, setPicks] = useState<readonly HighlightPick[]>([]);
  // A kind pulled down is no longer picked.
  useEffect(
    () =>
      hud.watch(
        (state) => state.highlightTypes,
        (next) => setPicks((current) => keptPicks(current, next)),
      ),
    [hud],
  );
  useEffect(() => {
    if (sceneUp) showcase.current?.setHighlights(picks);
  }, [showcase, sceneUp, picks]);
  return {
    types,
    picks,
    toggle: useCallback((family: string) => {
      setPicks((current) => toggledPick(current, family));
    }, []),
    clear: useCallback(() => setPicks([]), []),
  };
}
