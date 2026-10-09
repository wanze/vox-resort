import { useLayoutEffect, useState, type RefCallback } from 'react';
import { watchBarFolds } from '../features/hud/adapters/barFolds';
import { isCompact, type LayoutMode } from '../features/hud/domain/layoutMode';

// A desk bar keeps its media queries; only the compact strip runs short of its whole width. Held
// in state rather than a ref: the bar mounts only once playing, long after a phone is first compact.
export function useBarFolds(layout: LayoutMode): RefCallback<HTMLElement> {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const compact = isCompact(layout);
  useLayoutEffect(() => {
    if (!compact || !bar) return undefined;
    return watchBarFolds(bar);
  }, [bar, compact]);
  return setBar;
}
