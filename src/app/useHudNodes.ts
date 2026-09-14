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
  /** The day and the hour, as text. */
  readonly clock: RefObject<HTMLSpanElement | null>;
  readonly drawn: RefObject<HTMLSpanElement | null>;
  readonly cpu: RefObject<HTMLSpanElement | null>;
  readonly detail: RefObject<HTMLSpanElement | null>;
  readonly shaders: RefObject<HTMLSpanElement | null>;
  /** What the selected guest is doing this instant; see `InspectPanel`. */
  readonly inspect: RefObject<HTMLSpanElement | null>;
}

export function useHudNodes(): HudNodes {
  const activeLights = useRef<HTMLSpanElement | null>(null);
  const time = useRef<HTMLInputElement | null>(null);
  const clock = useRef<HTMLSpanElement | null>(null);
  const drawn = useRef<HTMLSpanElement | null>(null);
  const cpu = useRef<HTMLSpanElement | null>(null);
  const detail = useRef<HTMLSpanElement | null>(null);
  const shaders = useRef<HTMLSpanElement | null>(null);
  const inspect = useRef<HTMLSpanElement | null>(null);
  // One stable object, so the effect that mounts the renderer can depend on it
  // and still run exactly once.
  return useMemo(
    () => ({ activeLights, time, clock, drawn, cpu, detail, shaders, inspect }),
    [activeLights, time, clock, drawn, cpu, detail, shaders, inspect],
  );
}
