import { useCallback, type RefObject } from 'react';
import type { CameraMode, CompassDirection } from '../features/layout/domain/worldBounds';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { CameraControls } from '../features/hud/components/hudControls';

export function useCameraControls(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
): CameraControls {
  const view = useHudSlice(hud, (state) => state.camera);

  const apply = useCallback(
    (change: (mounted: Showcase) => void) => {
      const mounted = showcase.current;
      if (mounted) change(mounted);
    },
    [showcase],
  );

  return {
    view,
    setMode: useCallback(
      (mode: CameraMode) => apply((mounted) => mounted.setCameraMode(mode)),
      [apply],
    ),
    setDirection: useCallback(
      (direction: CompassDirection) => apply((mounted) => mounted.setIsoDirection(direction)),
      [apply],
    ),
    setDetail: useCallback(
      (enabled: boolean) => apply((mounted) => mounted.setDetail(enabled)),
      [apply],
    ),
  };
}
