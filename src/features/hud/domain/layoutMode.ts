export type LayoutMode = 'desk' | 'bottom' | 'rail';

// The stylesheet keys off data-layout, so these are the only copies of the thresholds.
// The widest viewport whose desk bar no longer fits in one row, even with every label folded away.
const COMPACT_WIDTH = 1010;
const SHORT_HEIGHT = 500;

export function layoutModeFor(width: number, height: number): LayoutMode {
  if (height <= SHORT_HEIGHT) return 'rail';
  return width <= COMPACT_WIDTH ? 'bottom' : 'desk';
}

export const isCompact = (mode: LayoutMode): boolean => mode !== 'desk';

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

// A phone's keyboard shortens the viewport while a field has focus, which would read as a phone
// held sideways and swap the layout under the field. Turning the phone still changes the width.
export function steadySize(
  settled: ViewportSize | null,
  measured: ViewportSize,
  typing: boolean,
): ViewportSize {
  if (typing && settled !== null && settled.width === measured.width) return settled;
  return measured;
}
