import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { OverlayKind } from '../features/overlays/domain/overlays';
import type { OverlayControls } from '../features/overlays/components/overlayControls';

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
