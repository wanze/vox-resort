import { useCallback, useEffect, useState } from 'react';
import { loadLayout, saveLayout } from '../features/hud/adapters/layoutStore';
import {
  moveWindow,
  raiseWindow,
  resetPlaces,
  showWindow,
  tabOf,
  toggleWindow,
  type PageId,
  type WindowId,
  type WindowLayout,
  type WindowSpot,
} from '../features/hud/domain/windowLayout';
import type { TabbedWindow, TabId } from '../features/hud/domain/windowTabs';

export interface WindowControls {
  readonly layout: WindowLayout;
  toggle(page: PageId): void;
  show(page: PageId, shown: boolean): void;
  raise(id: WindowId): void;
  move(id: WindowId, spot: WindowSpot): void;
  resetPlaces(): void;
  readonly tab: (id: TabbedWindow) => TabId;
}

export function useWindows(): WindowControls {
  const [layout, setLayout] = useState<WindowLayout>(loadLayout);

  useEffect(() => saveLayout(layout), [layout]);

  return {
    layout,
    toggle: useCallback((page: PageId) => setLayout((now) => toggleWindow(now, page)), []),
    show: useCallback(
      (page: PageId, shown: boolean) => setLayout((now) => showWindow(now, page, shown)),
      [],
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
