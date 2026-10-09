import { useLayoutEffect, type RefObject } from 'react';
import { watchBarFolds } from '../features/hud/adapters/barFolds';
import { isCompact, type LayoutMode } from '../features/hud/domain/layoutMode';

// A desk bar keeps its media queries; only the compact strip runs short of its whole width.
export function useBarFolds(bar: RefObject<HTMLElement | null>, layout: LayoutMode): void {
  const compact = isCompact(layout);
  useLayoutEffect(() => {
    if (!compact || !bar.current) return undefined;
    return watchBarFolds(bar.current);
  }, [bar, compact]);
}
