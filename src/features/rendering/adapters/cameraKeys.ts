import type { CameraMode } from '../../layout/domain/worldBounds';

export interface CameraKeysOptions {
  readonly mode: () => CameraMode;
  readonly onModeChange: (mode: CameraMode) => void;
  readonly onTurn: (quarters: number) => void;
}

export interface CameraKeys {
  dispose(): void;
}

// Fields only: a clicked HUD button keeps the focus and must not swallow the camera keys.
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

interface CameraGesture {
  readonly swap: boolean;
  readonly quarters: number;
}

const GESTURES: Readonly<Record<string, CameraGesture>> = {
  c: { swap: true, quarters: 0 },
  q: { swap: false, quarters: -1 },
  e: { swap: false, quarters: 1 },
};

function otherMode(mode: CameraMode): CameraMode {
  return mode === 'perspective' ? 'isometric' : 'perspective';
}

function aimedAtScene(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !inAField(event.target);
}

function gestureFor(event: KeyboardEvent): CameraGesture | null {
  if (!aimedAtScene(event)) return null;
  return GESTURES[event.key.toLowerCase()] ?? null;
}

export function createCameraKeys(options: CameraKeysOptions): CameraKeys {
  const onKeyDown = (event: KeyboardEvent): void => {
    const gesture = gestureFor(event);
    if (gesture === null) return;
    if (gesture.swap) {
      options.onModeChange(otherMode(options.mode()));
      return;
    }
    // Deliberately does not switch into isometric: snapping a camera the user is flying
    // is worse than a key that does nothing.
    if (options.mode() === 'isometric') options.onTurn(gesture.quarters);
  };

  globalThis.addEventListener('keydown', onKeyDown);
  return {
    dispose() {
      globalThis.removeEventListener('keydown', onKeyDown);
    },
  };
}
