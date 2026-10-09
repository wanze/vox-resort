import type { RefObject } from 'react';
import type { Advice } from '../../sim/domain/advice';
import { markersOf, orderedTiles, tileKey, type Marker, type OrderSpot } from '../domain/markers';
import { severityOf } from '../domain/news';
import { adviceSays } from './adviceWords';
import { PixelIcon } from '../../../shared/components/PixelIcon';

type Tile = { readonly tileX: number; readonly tileZ: number };

export interface ProblemMarkersProps {
  readonly advice: readonly Advice[];
  readonly shown: boolean;
  // Positioned by the render loop, as the clock is; React only says what each one is.
  readonly elements: RefObject<(HTMLElement | null)[]>;
  readonly onShowOnPlot: (at: Tile) => void;
  readonly onSelectAt: (at: Tile) => void;
  // Flagged on their marker, so a problem somebody is on the way to reads as handled.
  readonly orders: readonly OrderSpot[];
  readonly onSendCleaner: (at: Tile) => void;
}

// A littered path is no building to inspect, so the order is given from its marker.
function SendCleaner({
  marker,
  sent,
  onSend,
}: {
  readonly marker: Marker;
  readonly sent: boolean;
  readonly onSend: () => void;
}) {
  if (sent || marker.icon !== 'litter') return null;
  return (
    <button type="button" className="hud-marker-menu" onClick={onSend}>
      Send a cleaner
    </button>
  );
}

const toldOf = (marker: Marker, sent: boolean): string => {
  const says = adviceSays(marker.advice);
  return sent ? `${says} Somebody is on the way.` : says;
};

function MarkerSpot({
  marker,
  spotRef,
  sent,
  onShowOnPlot,
  onSelectAt,
  onSendCleaner,
}: Omit<ProblemMarkersProps, 'advice' | 'shown' | 'orders' | 'elements'> & {
  readonly marker: Marker;
  readonly spotRef: (element: HTMLElement | null) => void;
  readonly sent: boolean;
}) {
  const told = toldOf(marker, sent);
  return (
    <div
      ref={spotRef}
      className="hud-marker-spot"
      // Hidden until the render loop has placed it, so it never flashes in the corner.
      hidden
    >
      <button
        type="button"
        className="hud-marker"
        data-severity={severityOf(marker.advice) ?? 'note'}
        data-sent={sent || undefined}
        aria-label={told}
        title={told}
        onClick={() => {
          onShowOnPlot(marker.at);
          onSelectAt(marker.at);
        }}
      >
        <PixelIcon name={marker.icon} />
        <span className="hud-marker-flag" />
      </button>
      <SendCleaner marker={marker} sent={sent} onSend={() => onSendCleaner(marker.at)} />
    </div>
  );
}

export function ProblemMarkers({ advice, shown, orders, elements, ...props }: ProblemMarkersProps) {
  if (!shown) return null;
  const ordered = orderedTiles(orders);
  return (
    <div className="hud-markers">
      {markersOf(advice).map((marker, index) => (
        <MarkerSpot
          key={marker.key}
          marker={marker}
          spotRef={(element) => {
            elements.current[index] = element;
          }}
          sent={ordered.has(tileKey(marker.at))}
          {...props}
        />
      ))}
    </div>
  );
}
