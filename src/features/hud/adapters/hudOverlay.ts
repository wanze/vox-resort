/**
 * The parts of the HUD that are written straight to the DOM, once a frame.
 *
 * Re-rendering React sixty times a second to move a number would distort the
 * very frame rate that number reports, so the lamp count and the time slider
 * are written here, on the nodes themselves. React still owns creating those
 * nodes; this only writes to them.
 *
 * It lives in `adapters/` because that is what it is — DOM I/O on the hot path —
 * and keeping it out of the component leaves `App` with state and effects, which
 * is all a component should have to explain.
 */

/** What the render loop reports at the end of every frame. */
export interface FrameUpdate {
  readonly fps: number;
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /** Lamps contributing to this frame; all of them after dark, none by day. */
  readonly activeLights: number;
}

/**
 * A React ref, structurally. Taking the shape rather than the type keeps this
 * module free of React while still accepting the refs the HUD hands it.
 */
interface Slot<T> {
  readonly current: T | null;
}

export interface HudOverlayParts {
  readonly activeLights: Slot<HTMLSpanElement>;
  readonly time: Slot<HTMLInputElement>;
  /** Called only when the displayed frame rate actually changes. */
  readonly onFpsChange: (fps: number) => void;
}

export interface HudOverlay {
  /** Writes one frame's worth of HUD state. */
  update(frame: FrameUpdate): void;
}

export function createHudOverlay(parts: HudOverlayParts): HudOverlay {
  // Last written values, so an unchanged number costs no DOM write and an
  // unchanged frame rate costs no React render.
  let fps = -1;
  let activeLights = -1;

  const writeLights = (count: number): void => {
    const element = parts.activeLights.current;
    if (count === activeLights || !element) return;
    activeLights = count;
    element.textContent = String(count);
  };

  const writeTime = (time: number): void => {
    const element = parts.time.current;
    // The slider follows the clock while the cycle runs, unless it is being
    // dragged — in which case the clock is following the slider.
    if (!element || document.activeElement === element) return;
    element.value = time.toFixed(3);
  };

  return {
    update(frame) {
      if (frame.fps !== fps) {
        fps = frame.fps;
        parts.onFpsChange(frame.fps);
      }
      writeLights(frame.activeLights);
      writeTime(frame.time);
    },
  };
}
