import { useMemo, useRef, type RefObject } from 'react';
import { MAX_MARKERS, MAX_WORKS } from '../features/hud/domain/markers';
import { MAX_SIGNS } from '../features/hud/domain/signs';
import { PINNED_STAFF } from '../features/hud/domain/staffPins';
import type { HudNodes } from '../features/hud/components/hudNodes';

const slotsOf = (length: number): RefObject<(HTMLElement | null)[]> => ({
  current: Array.from({ length }, () => null),
});

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
  const staffPins = useRef<(HTMLButtonElement | null)[]>(
    Array.from({ length: PINNED_STAFF.length }, () => null),
  );
  // One hook for the three over the map: each is a fixed row of slots the render loop fills.
  const { markers, signs, works } = useMemo(
    () => ({
      markers: slotsOf(MAX_MARKERS),
      signs: slotsOf(MAX_SIGNS),
      works: slotsOf(MAX_WORKS),
    }),
    [],
  );
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
      works,
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
      works,
    ],
  );
}
