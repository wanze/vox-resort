import { useMemo, useRef, type RefObject } from 'react';
import type { DebugElements } from '../features/hud/components/RenderStats';

// Written by the render loop outside React: re-rendering the HUD every frame
// would distort the frame rate it reports.
export interface HudNodes extends DebugElements {
  readonly time: RefObject<HTMLInputElement | null>;
  readonly clock: RefObject<HTMLSpanElement | null>;
  readonly inspect: RefObject<HTMLSpanElement | null>;
}

export function useHudNodes(): HudNodes {
  const time = useRef<HTMLInputElement | null>(null);
  const clock = useRef<HTMLSpanElement | null>(null);
  const inspect = useRef<HTMLSpanElement | null>(null);
  const fps = useRef<HTMLSpanElement | null>(null);
  const cpu = useRef<HTMLSpanElement | null>(null);
  const gpu = useRef<HTMLSpanElement | null>(null);
  const drawn = useRef<HTMLSpanElement | null>(null);
  const detail = useRef<HTMLSpanElement | null>(null);
  const people = useRef<HTMLSpanElement | null>(null);
  const shaders = useRef<HTMLSpanElement | null>(null);
  const activeLights = useRef<HTMLSpanElement | null>(null);
  // One stable object, so the effect mounting the renderer runs exactly once.
  return useMemo(
    () => ({ time, clock, inspect, fps, cpu, gpu, drawn, detail, people, shaders, activeLights }),
    [time, clock, inspect, fps, cpu, gpu, drawn, detail, people, shaders, activeLights],
  );
}
