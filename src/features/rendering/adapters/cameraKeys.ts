/**
 * The keyboard half of the camera controls: switch the view, turn it round.
 *
 * `C` swaps between the perspective and isometric views; `Q` and `E` turn the
 * isometric one a quarter anticlockwise and clockwise. They are separate from
 * the build pointer's `R`, which turns the *object* about to be placed — the two
 * rotations are different things and pressing one must never do the other.
 *
 * Turning only does something in the isometric view, and deliberately does not
 * switch into it: snapping a perspective camera the user is flying into a fixed
 * projection because they brushed a key is worse than a key press that does
 * nothing. The HUD panel is where the mode is changed by pointing at it.
 */

import type { CameraMode } from "../../layout/domain/worldBounds";

export interface CameraKeysOptions {
  /** The mode right now, so `C` can toggle whatever is on screen. */
  readonly mode: () => CameraMode;
  readonly onModeChange: (mode: CameraMode) => void;
  /** Quarter turns for the isometric view; negative turns anticlockwise. */
  readonly onTurn: (quarters: number) => void;
}

export interface CameraKeys {
  dispose(): void;
}

/**
 * Whether a key press was typed into a field rather than aimed at the scene.
 *
 * Fields, and only fields: clicking a HUD button leaves the focus on it, and a
 * rule that ignored every focusable thing would ignore the very key the panel
 * had just told the user about. `buildPointer.ts` reads its own keys by the same
 * rule.
 */
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select");
}

/** What a key press asks the camera for. */
interface CameraGesture {
  /** Swap between the two modes. */
  readonly swap: boolean;
  /** Quarter turns for the isometric view; negative turns anticlockwise. */
  readonly quarters: number;
}

const GESTURES: Readonly<Record<string, CameraGesture>> = {
  c: { swap: true, quarters: 0 },
  q: { swap: false, quarters: -1 },
  e: { swap: false, quarters: 1 },
};

/** The mode `C` swaps to. */
function otherMode(mode: CameraMode): CameraMode {
  return mode === "perspective" ? "isometric" : "perspective";
}

/** A press aimed at the scene rather than at a field or a browser shortcut. */
function aimedAtScene(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !inAField(event.target);
}

/** The gesture a press asks for, or null if it was not asking for one. */
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
    // Turning belongs to the isometric view and does not switch into it.
    if (options.mode() === "isometric") options.onTurn(gesture.quarters);
  };

  globalThis.addEventListener("keydown", onKeyDown);
  return {
    dispose() {
      globalThis.removeEventListener("keydown", onKeyDown);
    },
  };
}
