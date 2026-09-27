import { useCallback, useEffect, useState } from 'react';
import { loadLayout, saveLayout } from '../features/hud/adapters/layoutStore';
import {
  moveWindow,
  raiseWindow,
  resetPlaces,
  showWindow,
  toggleWindow,
  type WindowId,
  type WindowLayout,
  type WindowSpot,
} from '../features/hud/domain/windowLayout';

export interface WindowControls {
  readonly layout: WindowLayout;
  toggle(id: WindowId): void;
  show(id: WindowId, shown: boolean): void;
  raise(id: WindowId): void;
  move(id: WindowId, spot: WindowSpot): void;
  resetPlaces(): void;
}

export function useWindows(): WindowControls {
  const [layout, setLayout] = useState<WindowLayout>(loadLayout);

  useEffect(() => saveLayout(layout), [layout]);

  return {
    layout,
    toggle: useCallback((id: WindowId) => setLayout((now) => toggleWindow(now, id)), []),
    show: useCallback(
      (id: WindowId, shown: boolean) => setLayout((now) => showWindow(now, id, shown)),
      [],
    ),
    raise: useCallback((id: WindowId) => setLayout((now) => raiseWindow(now, id)), []),
    move: useCallback(
      (id: WindowId, spot: WindowSpot) => setLayout((now) => moveWindow(now, id, spot)),
      [],
    ),
    resetPlaces: useCallback(() => setLayout(resetPlaces), []),
  };
}
