import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { OverlayKind } from '../features/overlays/domain/overlays';

export interface OverlayControls {
  readonly kind: OverlayKind | null;
  setOverlay(kind: OverlayKind | null): void;
}

export function useOverlay(showcase: RefObject<Showcase | null>): OverlayControls {
  const [kind, setKind] = useState<OverlayKind | null>(null);

  return {
    kind,
    setOverlay: useCallback(
      (next: OverlayKind | null) => {
        setKind(next);
        showcase.current?.setOverlay(next);
      },
      [showcase],
    ),
  };
}
