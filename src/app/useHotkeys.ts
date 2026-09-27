import { useEffect, useRef } from 'react';
import { createHotkeys, type Hotkey } from '../features/hud/adapters/hotkeys';

// Read through a ref, so each key sees this render's state without re-adding the listener.
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  const latest = useRef(hotkeys);
  useEffect(() => {
    latest.current = hotkeys;
  });
  useEffect(() => {
    const keys = createHotkeys(() => latest.current);
    return () => keys.dispose();
  }, []);
}
