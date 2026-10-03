import { useEffect, useState, type RefObject } from 'react';
import { watchAltHeld } from '../features/hud/adapters/altHeld';
import type { SignSpot } from '../features/hud/domain/signs';
import type { Showcase } from './showcase';

export interface SignControls {
  readonly spots: readonly SignSpot[];
  // Stable, so the mount effect can hold it.
  readonly adopt: (spots: readonly SignSpot[]) => void;
  // Alt is held: every sign shown says its name.
  readonly named: boolean;
}

export function useSigns(
  showcase: RefObject<Showcase | null>,
  sceneUp: boolean,
  shown: boolean,
): SignControls {
  const [spots, adopt] = useState<readonly SignSpot[]>([]);
  const [named, setNamed] = useState(false);
  useEffect(() => watchAltHeld(setNamed), []);
  useEffect(() => {
    if (sceneUp) showcase.current?.setSigns(shown);
  }, [showcase, sceneUp, shown]);
  return { spots, adopt, named };
}
