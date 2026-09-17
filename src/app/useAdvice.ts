import { useCallback, useState, type RefObject } from 'react';
import type { Advice } from '../features/sim/domain/advice';
import type { Showcase } from './showcase';

/**
 * What the resort is getting wrong, as React state.
 *
 * The shape of `useInspector.ts`, and for its reason: the scene works the list
 * out - once a simulated day, and on an edit that has settled - and this holds
 * the last one it pushed.
 *
 * The one thing it does back to the scene is move the camera, which is not
 * advice changing the plot: `advice.ts` observes and never alters, and panning
 * to look at a building alters nothing about it. Everything else here is
 * read-only.
 */
export interface AdviceControls {
  readonly advice: readonly Advice[];
  /** Takes what the scene says; stable, so the mount effect can hold it. */
  readonly adopt: (advice: readonly Advice[]) => void;
  /** Pans the camera to the building a piece of advice is about. */
  showOnPlot(at: { readonly tileX: number; readonly tileZ: number }): void;
}

export function useAdvice(showcase: RefObject<Showcase | null>): AdviceControls {
  const [advice, adopt] = useState<readonly Advice[]>([]);

  return {
    advice,
    adopt,
    showOnPlot: useCallback(
      (at: { readonly tileX: number; readonly tileZ: number }) => {
        showcase.current?.lookAtTile(at);
      },
      [showcase],
    ),
  };
}
