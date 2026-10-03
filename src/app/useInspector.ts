import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SelectionView } from '../features/inspect/domain/selection';
import type { OrderSpot } from '../features/hud/domain/markers';
import type { OrderRole } from '../features/sim/domain/staffRouter';

// The scene owns the selection, since clicks land on the canvas; this only mirrors what it reports.
export interface InspectorControls {
  readonly selection: SelectionView | null;
  // Stable, so the mount effect can hold it.
  readonly adopt: (selection: SelectionView | null) => void;
  // Mirrored here too: an order is given from the inspector, and its flag shows on the markers.
  readonly orders: readonly OrderSpot[];
  readonly adoptOrders: (orders: readonly OrderSpot[]) => void;
  send(role: OrderRole): void;
  sendCleanerTo(tile: { readonly tileX: number; readonly tileZ: number }): void;
  renameVenue(key: string, name: string): void;
  selectPerson(person: number): void;
  selectWorker(worker: number): void;
  showSelected(): void;
  selectAt(tile: { readonly tileX: number; readonly tileZ: number }): void;
  clear(): void;
}

export function useInspector(showcase: RefObject<Showcase | null>): InspectorControls {
  const [selection, adopt] = useState<SelectionView | null>(null);
  const [orders, adoptOrders] = useState<readonly OrderSpot[]>([]);

  return {
    selection,
    adopt,
    orders,
    adoptOrders,
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
