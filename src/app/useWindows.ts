import { useCallback, useEffect, useState } from 'react';
import { loadLayout, saveLayout } from '../features/hud/adapters/layoutStore';
import {
  moveWindow,
  raiseWindow,
  isShown,
  resetPlaces,
  showWindow,
  soloWindow,
  tabOf,
  toCompact,
  toggleWindow,
  type PageId,
  type WindowId,
  type WindowLayout,
  type WindowSpot,
} from '../features/hud/domain/windowLayout';
import type { TabbedWindow } from '../features/hud/domain/windowTabs';
import { isCompact, type LayoutMode } from '../features/hud/domain/layoutMode';
import type { WindowControls } from '../features/hud/components/hudControls';

export function useWindows(mode: LayoutMode): WindowControls {
  const [layout, setLayout] = useState<WindowLayout>(loadLayout);
  const compact = isCompact(mode);

  const [wasCompact, setWasCompact] = useState(false);
  if (compact !== wasCompact) {
    setWasCompact(compact);
    if (compact) setLayout(toCompact);
  }

  useEffect(() => saveLayout(layout), [layout]);

  return {
    layout,
    toggle: useCallback(
      (page: PageId) =>
        setLayout((now) =>
          compact && !isShown(now, page) ? soloWindow(now, page) : toggleWindow(now, page),
        ),
      [compact],
    ),
    show: useCallback(
      (page: PageId, shown: boolean) =>
        setLayout((now) =>
          compact && shown ? soloWindow(now, page) : showWindow(now, page, shown),
        ),
      [compact],
    ),
    raise: useCallback((id: WindowId) => setLayout((now) => raiseWindow(now, id)), []),
    move: useCallback(
      (id: WindowId, spot: WindowSpot) => setLayout((now) => moveWindow(now, id, spot)),
      [],
    ),
    resetPlaces: useCallback(() => setLayout(resetPlaces), []),
    tab: (id: TabbedWindow) => tabOf(layout, id),
  };
}
