import { useMemo, useRef, type RefObject } from 'react';

/**
 * The HUD nodes the render loop writes to directly.
 *
 * They are kept together because they are used together: this is exactly the
 * set `createHudOverlay` positions and writes once a frame, outside React's
 * reconciler. Re-rendering the HUD sixty times a second to move a caption would
 * distort the very frame rate the caption sits next to.
 */
export interface HudNodes {
  /** The rendered label elements, by anchor id. */
  readonly labels: RefObject<Map<string, HTMLDivElement>>;
  readonly activeLights: RefObject<HTMLSpanElement | null>;
  readonly time: RefObject<HTMLInputElement | null>;
}

export function useHudNodes(): HudNodes {
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeLights = useRef<HTMLSpanElement | null>(null);
  const time = useRef<HTMLInputElement | null>(null);
  // One stable object, so the effect that mounts the renderer can depend on it
  // and still run exactly once.
  return useMemo(() => ({ labels, activeLights, time }), [labels, activeLights, time]);
}
