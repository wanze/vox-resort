/**
 * The parts of the HUD that are written straight to the DOM, once a frame.
 *
 * Re-rendering React sixty times a second to move a caption would distort the
 * very frame rate the caption sits next to, so the label elements, the lamp
 * count and the time slider are positioned and written here, on the nodes
 * themselves. React still owns creating those nodes; this only moves them.
 *
 * It lives in `adapters/` because that is what it is — DOM I/O on the hot path —
 * and keeping it out of the component leaves `App` with state and effects, which
 * is all a component should have to explain.
 */

import { sortByDepth, type ScreenPosition } from '../domain/labelProjection';

/** What the render loop reports at the end of every frame. */
export interface FrameUpdate {
  readonly fps: number;
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /** Lamps contributing to this frame; all of them after dark, none by day. */
  readonly activeLights: number;
  /** Screen position per anchor id; missing ids are off-screen this frame. */
  readonly labels: ReadonlyMap<string, ScreenPosition>;
}

/**
 * A React ref, structurally. Taking the shape rather than the type keeps this
 * module free of React while still accepting the refs the HUD hands it.
 */
interface Slot<T> {
  readonly current: T | null;
}

export interface HudOverlayParts {
  /** The rendered label nodes, by anchor id. */
  readonly labels: Slot<Map<string, HTMLDivElement>>;
  readonly activeLights: Slot<HTMLSpanElement>;
  readonly time: Slot<HTMLInputElement>;
  /** Called only when the displayed frame rate actually changes. */
  readonly onFpsChange: (fps: number) => void;
}

export interface HudOverlay {
  /** Writes one frame's worth of HUD state. */
  update(frame: FrameUpdate): void;
}

/** Moves the label nodes onto this frame's screen positions. */
function positionLabels(
  elements: Map<string, HTMLDivElement>,
  labels: ReadonlyMap<string, ScreenPosition>,
): void {
  for (const [id, element] of elements) {
    if (!labels.has(id)) element.style.visibility = 'hidden';
  }
  const visible = sortByDepth([...labels].map(([id, screen]) => ({ id, screen })));
  visible.forEach(({ id, screen }, index) => {
    const element = elements.get(id);
    if (!element) return;
    element.style.visibility = 'visible';
    // Far to near, so a nearby label always covers one behind it.
    element.style.zIndex = String(index);
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
  });
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
      if (parts.labels.current) positionLabels(parts.labels.current, frame.labels);
      if (frame.fps !== fps) {
        fps = frame.fps;
        parts.onFpsChange(frame.fps);
      }
      writeLights(frame.activeLights);
      writeTime(frame.time);
    },
  };
}
