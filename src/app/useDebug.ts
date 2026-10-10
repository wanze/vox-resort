import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { DebugControls } from '../features/debug/components/debugControls';
import type { SeasonAction } from '../features/resort-sim/domain/debugSteps';
import { DEBUG_MODE } from './debugFlag';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

// Null outside debug mode, so nothing in the HUD offers it.
export function useDebug(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  resume: () => void,
): DebugControls | null {
  const [turbo, setTurboShown] = useState(false);
  // The showcase answers through the camera slice, and refuses under a bench.
  const detail = useHudSlice(hud, (state) => state.camera.detail);
  const setDetail = useCallback((on: boolean) => showcase.current?.setDetail(on), [showcase]);
  const setTurbo = useCallback(
    (on: boolean) => {
      setTurboShown(on);
      showcase.current?.setTurbo(on);
    },
    [showcase],
  );
  // A season opened from a break resumes the clock, as Open season in the top bar does.
  const runSeasonAction = useCallback(
    (action: SeasonAction) => {
      if (showcase.current?.runSeasonAction(action)) resume();
    },
    [showcase, resume],
  );
  const controls = useMemo(
    () => ({ turbo, setTurbo, detail, setDetail, runSeasonAction }),
    [turbo, setTurbo, detail, setDetail, runSeasonAction],
  );
  return DEBUG_MODE ? controls : null;
}
