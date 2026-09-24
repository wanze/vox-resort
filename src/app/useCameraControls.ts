import { useCallback, useState, type RefObject } from 'react';
import type { CameraMode, CompassDirection } from '../features/layout/domain/worldBounds';
import type { CameraView, Showcase } from './showcase';

// A mirror: the scene owns the camera and keys move it without React, so state is read back from
// the scene.
export interface CameraControls {
  readonly view: CameraView;
  adopt(view: CameraView): void;
  setMode(mode: CameraMode): void;
  setDirection(direction: CompassDirection): void;
  setDetail(enabled: boolean): void;
}

const INITIAL_VIEW: CameraView = { mode: 'perspective', direction: 'southeast', detail: true };

export function useCameraControls(showcase: RefObject<Showcase | null>): CameraControls {
  const [view, setView] = useState<CameraView>(INITIAL_VIEW);

  const apply = useCallback(
    (change: (mounted: Showcase) => void) => {
      const mounted = showcase.current;
      if (!mounted) return;
      change(mounted);
      // Read back: the scene refuses a mode change while a benchmark is running.
      setView(mounted.cameraView);
    },
    [showcase],
  );

  return {
    view,
    adopt: setView,
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
