import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SelectionView } from '../features/inspect/domain/selection';

/**
 * The inspector, as React state.
 *
 * Only what was clicked on lives here, and only as the scene reports it: the
 * scene holds the selection itself, because the canvas is where clicks land and
 * the frame loop is what reads it. What the guest is doing this instant is not
 * here at all; it is written straight to the DOM by `hudOverlay`.
 */
export interface InspectorControls {
  readonly selection: SelectionView | null;
  /** Takes what the scene says is selected; stable, so the mount effect can hold it. */
  readonly adopt: (selection: SelectionView | null) => void;
  /** Inspects somebody else - a member of the same party, from the list. */
  selectPerson(person: number): void;
  clear(): void;
}

export function useInspector(showcase: RefObject<Showcase | null>): InspectorControls {
  const [selection, adopt] = useState<SelectionView | null>(null);

  return {
    selection,
    adopt,
    // Both go through the scene, which calls back through `adopt`.
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
