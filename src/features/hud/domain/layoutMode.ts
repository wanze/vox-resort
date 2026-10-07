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
