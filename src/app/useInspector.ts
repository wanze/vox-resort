import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SelectionView } from '../features/inspect/domain/selection';

// The scene owns the selection, since clicks land on the canvas; this only mirrors what it reports.
export interface InspectorControls {
  readonly selection: SelectionView | null;
  // Stable, so the mount effect can hold it.
  readonly adopt: (selection: SelectionView | null) => void;
  selectPerson(person: number): void;
  clear(): void;
}

export function useInspector(showcase: RefObject<Showcase | null>): InspectorControls {
  const [selection, adopt] = useState<SelectionView | null>(null);

  return {
    selection,
    adopt,
    selectPerson: useCallback(
      (person: number) => {
        showcase.current?.selectPerson(person);
      },
      [showcase],
    ),
    clear: useCallback(() => {
      showcase.current?.clearSelection();
    }, [showcase]),
  };
}
