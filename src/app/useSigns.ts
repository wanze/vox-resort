import { useEffect, useState, type RefObject } from 'react';
import { watchAltHeld } from '../features/hud/adapters/altHeld';
import type { Showcase } from './showcase';

export interface SignControls {
  // Alt is held: every sign shown says its name.
  readonly named: boolean;
}

export function useSigns(
  showcase: RefObject<Showcase | null>,
  sceneUp: boolean,
  shown: boolean,
): SignControls {
  const [named, setNamed] = useState(false);
  useEffect(() => watchAltHeld(setNamed), []);
  useEffect(() => {
    if (sceneUp) showcase.current?.setSigns(shown);
  }, [showcase, sceneUp, shown]);
  return { named };
}
