import { useCallback, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { OrderRole } from '../features/sim/domain/staffRouter';
import type { InspectorControls } from '../features/hud/components/hudControls';

export function useInspector(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
): InspectorControls {
  const selection = useHudSlice(hud, (state) => state.selection);

  return {
    selection,
    send: useCallback(
      (role: OrderRole) => {
        showcase.current?.sendStaff(role);
      },
      [showcase],
    ),
    sendCleanerTo: useCallback(
      (tile: { readonly tileX: number; readonly tileZ: number }) => {
        showcase.current?.sendCleanerTo(tile);
      },
      [showcase],
    ),
    renameVenue: useCallback(
      (key: string, name: string) => {
        showcase.current?.renameVenue(key, name);
      },
      [showcase],
    ),
    selectPerson: useCallback(
      (person: number) => {
        showcase.current?.selectPerson(person);
      },
      [showcase],
    ),
    selectWorker: useCallback(
      (worker: number) => {
        showcase.current?.selectWorker(worker);
      },
      [showcase],
    ),
    showSelected: useCallback(() => {
      showcase.current?.showSelected();
    }, [showcase]),
    selectAt: useCallback(
      (tile: { readonly tileX: number; readonly tileZ: number }) => {
        showcase.current?.selectAt(tile);
      },
      [showcase],
    ),
    clear: useCallback(() => {
      showcase.current?.clearSelection();
    }, [showcase]),
  };
}
