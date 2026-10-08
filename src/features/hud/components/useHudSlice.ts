import { useSyncExternalStore } from 'react';
import type { HudState, HudStore } from '../domain/hudStore';

// The selector hands back a slice as stored, never a new object, or React would render forever.
export function useHudSlice<T>(store: HudStore, select: (state: HudState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()));
}
