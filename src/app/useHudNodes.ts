import { useMemo, useRef, type RefObject } from 'react';
import type { DebugElements } from '../features/hud/components/RenderStats';
import { MAX_MARKERS } from '../features/hud/domain/markers';
import { MAX_SIGNS } from '../features/hud/domain/signs';
import { PINNED_STAFF } from '../features/hud/domain/staffPins';

// Written by the render loop outside React: re-rendering the HUD every frame
// would distort the frame rate it reports.
export interface HudNodes extends DebugElements {
  readonly clock: RefObject<HTMLSpanElement | null>;
  readonly inspect: RefObject<HTMLSpanElement | null>;
  readonly markers: RefObject<(HTMLElement | null)[]>;
  readonly staffPins: RefObject<(HTMLButtonElement | null)[]>;
  readonly signs: RefObject<(HTMLElement | null)[]>;
}

export function useHudNodes(): HudNodes {
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
  const markers = useRef<(HTMLElement | null)[]>(Array.from({ length: MAX_MARKERS }, () => null));
  const staffPins = useRef<(HTMLButtonElement | null)[]>(
    Array.from({ length: PINNED_STAFF.length }, () => null),
  );
  const signs = useRef<(HTMLElement | null)[]>(Array.from({ length: MAX_SIGNS }, () => null));
  // One stable object, so the effect mounting the renderer runs exactly once.
  return useMemo(
    () => ({
      clock,
      inspect,
      fps,
      cpu,
      gpu,
      drawn,
      detail,
      people,
      shaders,
      activeLights,
      markers,
      staffPins,
      signs,
    }),
    [
      clock,
      inspect,
      fps,
      cpu,
      gpu,
      drawn,
      detail,
      people,
      shaders,
      activeLights,
      markers,
      staffPins,
      signs,
    ],
  );
}
