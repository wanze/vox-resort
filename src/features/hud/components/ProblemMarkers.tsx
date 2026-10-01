import type { RefObject } from 'react';
import type { Advice } from '../../sim/domain/advice';
import { markersOf } from '../domain/markers';
import { severityOf } from '../domain/news';
import { adviceSays } from './adviceWords';
import { PixelIcon } from './PixelIcon';

type Tile = { readonly tileX: number; readonly tileZ: number };

export interface ProblemMarkersProps {
  readonly advice: readonly Advice[];
  readonly shown: boolean;
  // Positioned by the render loop, as the clock is; React only says what each one is.
  readonly elements: RefObject<(HTMLButtonElement | null)[]>;
  readonly onShowOnPlot: (at: Tile) => void;
  readonly onSelectAt: (at: Tile) => void;
}

export function ProblemMarkers({
  advice,
  shown,
  elements,
  onShowOnPlot,
  onSelectAt,
}: ProblemMarkersProps) {
  if (!shown) return null;
  return (
    <div className="hud-markers">
      {markersOf(advice).map((marker, index) => {
        const says = adviceSays(marker.advice);
        return (
          <button
            key={marker.key}
            ref={(element) => {
              elements.current[index] = element;
            }}
            type="button"
            className="hud-marker"
            data-severity={severityOf(marker.advice) ?? 'note'}
            aria-label={says}
            title={says}
            // Hidden until the render loop has placed it, so it never flashes in the corner.
            hidden
            onClick={() => {
              onShowOnPlot(marker.at);
              onSelectAt(marker.at);
            }}
          >
            <PixelIcon name={marker.icon} />
          </button>
        );
      })}
    </div>
  );
}
