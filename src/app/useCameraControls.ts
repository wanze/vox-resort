import { useCallback, useState, type RefObject } from 'react';
import type { CameraMode, CompassDirection } from '../features/layout/domain/worldBounds';
import type { CameraView, Showcase } from './showcase';

/**
 * The camera panel, as React state.
 *
 * A mirror rather than the source of truth: the scene owns which camera is on
 * screen, and `C`, `Q` and `E` move it from the canvas without React hearing
 * about it. So every change goes to the scene first and the state is read back
 * off it, and the showcase reports the keyboard's changes through `adopt`.
 */
export interface CameraControls {
  readonly view: CameraView;
  /** Records what the scene says the camera is now doing. */
  adopt(view: CameraView): void;
  setMode(mode: CameraMode): void;
  setDirection(direction: CompassDirection): void;
}

/** What the panel shows before a scene exists to ask. */
const INITIAL_VIEW: CameraView = { mode: 'perspective', direction: 'southeast' };

export function useCameraControls(showcase: RefObject<Showcase | null>): CameraControls {
  const [view, setView] = useState<CameraView>(INITIAL_VIEW);

  const apply = useCallback(
    (change: (mounted: Showcase) => void) => {
      const mounted = showcase.current;
      if (!mounted) return;
      change(mounted);
      // Read back rather than assumed: the scene refuses a mode change while a
      // benchmark is running, and the panel should say what is true.
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
  };
}
