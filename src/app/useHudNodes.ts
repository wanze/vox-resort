import { useMemo, useRef } from 'react';
import { MAX_MARKERS } from '../features/hud/domain/markers';
import { MAX_SIGNS } from '../features/hud/domain/signs';
import { PINNED_STAFF } from '../features/hud/domain/staffPins';
import type { HudNodes } from '../features/hud/components/hudNodes';

export function useHudNodes(): HudNodes {
  const day = useRef<HTMLSpanElement | null>(null);
  const time = useRef<HTMLSpanElement | null>(null);
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
      day,
      time,
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
      day,
      time,
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
