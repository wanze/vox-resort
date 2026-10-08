import type { HighlightPick, HighlightType } from '../domain/highlights';

export interface HighlightControls {
  readonly types: readonly HighlightType[];
  readonly picks: readonly HighlightPick[];
  readonly toggle: (family: string) => void;
  readonly clear: () => void;
}
