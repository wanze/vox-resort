import { useMemo, useRef, type RefObject } from 'react';

// Written by the render loop outside React: re-rendering the HUD every frame
// would distort the frame rate it reports.
export interface HudNodes {
  readonly activeLights: RefObject<HTMLSpanElement | null>;
  readonly time: RefObject<HTMLInputElement | null>;
  readonly clock: RefObject<HTMLSpanElement | null>;
  readonly drawn: RefObject<HTMLSpanElement | null>;
  readonly cpu: RefObject<HTMLSpanElement | null>;
  readonly detail: RefObject<HTMLSpanElement | null>;
  readonly shaders: RefObject<HTMLSpanElement | null>;
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
  // One stable object, so the effect mounting the renderer runs exactly once.
  return useMemo(
    () => ({ activeLights, time, clock, drawn, cpu, detail, shaders, inspect }),
    [activeLights, time, clock, drawn, cpu, detail, shaders, inspect],
  );
}
