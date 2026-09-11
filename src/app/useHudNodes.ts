import { useMemo, useRef, type RefObject } from 'react';

/**
 * The HUD nodes the render loop writes to directly.
 *
 * They are kept together because they are used together: this is exactly the
 * set `createHudOverlay` writes to once a frame, outside React's reconciler.
 * Re-rendering the HUD sixty times a second to write a number would distort the
 * very frame rate that number reports.
 */
export interface HudNodes {
  readonly activeLights: RefObject<HTMLSpanElement | null>;
  readonly time: RefObject<HTMLInputElement | null>;
}

export function useHudNodes(): HudNodes {
  const activeLights = useRef<HTMLSpanElement | null>(null);
  const time = useRef<HTMLInputElement | null>(null);
  // One stable object, so the effect that mounts the renderer can depend on it
  // and still run exactly once.
  return useMemo(() => ({ activeLights, time }), [activeLights, time]);
}
