import type { RefObject } from 'react';
import type { UpkeepRow } from '../../resort-sim/domain/ageing';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { worksWords } from './RenovateAction';

type Tile = { readonly tileX: number; readonly tileZ: number };

export interface RenovationPinsProps {
  readonly works: readonly UpkeepRow[];
  readonly shown: boolean;
  // Positioned, and their bars filled, by the render loop; React only says what each one is.
  readonly elements: RefObject<(HTMLElement | null)[]>;
  readonly onSelectAt: (at: Tile) => void;
}

const toldOf = (row: UpkeepRow): string =>
  row.works ? `${row.label}: ${worksWords(row.works)}` : row.label;

export function RenovationPins({ works, shown, elements, onSelectAt }: RenovationPinsProps) {
  if (!shown) return null;
  return (
    <div className="hud-works">
      {works.map((row, index) => (
        <div
          key={row.key}
          ref={(element) => {
            elements.current[index] = element;
          }}
          className="hud-work-spot"
          // Hidden until the render loop has placed it, so it never flashes in the corner.
          hidden
        >
          <button
            type="button"
            className="hud-work"
            data-state={row.works?.kind}
            aria-label={toldOf(row)}
            title={toldOf(row)}
            onClick={() => onSelectAt(row.at)}
          >
            <PixelIcon name="renovate" />
            <span className="hud-work-bar">
              <span className="hud-work-fill" />
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
