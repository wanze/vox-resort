import { useCallback, useState, type RefObject } from 'react';
import type { Advice } from '../features/sim/domain/advice';
import type { Showcase } from './showcase';

export interface AdviceControls {
  readonly advice: readonly Advice[];
  readonly adopt: (advice: readonly Advice[], ticks: number) => void;
  // Shown but not heard, so the first advice the showcase sends is the news baseline.
  readonly show: (advice: readonly Advice[]) => void;
  showOnPlot(at: { readonly tileX: number; readonly tileZ: number }): void;
}

export function useAdvice(
  showcase: RefObject<Showcase | null>,
  hear: (advice: readonly Advice[], ticks: number) => void,
): AdviceControls {
  const [advice, show] = useState<readonly Advice[]>([]);

  return {
    advice,
    adopt: useCallback(
      (next: readonly Advice[], ticks: number) => {
        show(next);
        hear(next, ticks);
      },
      [hear],
    ),
    show,
    showOnPlot: useCallback(
      (at: { readonly tileX: number; readonly tileZ: number }) => {
        showcase.current?.lookAtTile(at);
      },
      [showcase],
    ),
  };
}
