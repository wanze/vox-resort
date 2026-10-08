import { useCallback, type RefObject } from 'react';
import type { Advice } from '../features/sim/domain/advice';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

export interface AdviceControls {
  readonly advice: readonly Advice[];
  showOnPlot(at: { readonly tileX: number; readonly tileZ: number }): void;
}

export function useAdvice(showcase: RefObject<Showcase | null>, hud: HudStore): AdviceControls {
  const { list } = useHudSlice(hud, (state) => state.advice);

  return {
    advice: list,
    showOnPlot: useCallback(
      (at: { readonly tileX: number; readonly tileZ: number }) => {
        showcase.current?.lookAtTile(at);
      },
      [showcase],
    ),
  };
}
