import type { OverlayKind } from '../domain/overlays';

export interface OverlayControls {
  readonly kind: OverlayKind | null;
  setOverlay(kind: OverlayKind | null): void;
}
