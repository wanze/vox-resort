import { useCallback, useState, type RefObject } from 'react';
import type { Advice } from '../features/sim/domain/advice';
import type { Showcase } from './showcase';

export interface AdviceControls {
  readonly advice: readonly Advice[];
  readonly adopt: (advice: readonly Advice[]) => void;
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
