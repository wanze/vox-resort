import { useSyncExternalStore } from 'react';
import { currentLook, setLook, watchLook } from '../features/hud/adapters/lookStore';
import type { LookControls } from '../features/hud/components/hudControls';

export function useLook(): LookControls {
  return { look: useSyncExternalStore(watchLook, currentLook), setLook };
}
