import type { LandView } from '../domain/landRights';

export interface LandShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly land: LandView;
  readonly armed: boolean;
  readonly onArm: (armed: boolean) => void;
}

export const LAND_TOOL = {
  hint: 'Take in a parcel beside the land you own; drag to take in a strip',
  glyph: '⌗',
} as const;

// Free play claims land for nothing, so the price is only shown when there is one.
export function landToolLabel(land: Pick<LandView, 'price'>): string {
  return land.price > 0 ? `Buy land · ${land.price.toLocaleString('en-US')}` : 'Claim land';
}

export function LandShelf({ open, onToggle, land, armed, onArm }: LandShelfProps) {
  return (
    <section className="build-group">
      <h3 className="build-group-head">
        <button
          type="button"
          className="build-group-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="build-group-caret" aria-hidden="true" />
          <span className="build-group-label">Land</span>
          <span className="build-group-count">{land.forSale}</span>
        </button>
      </h3>
      {open ? (
        <div className="build-grid">
          <button
            type="button"
            className="build-tile terrain-tile"
            aria-pressed={armed}
            title={`${landToolLabel(land)} — ${LAND_TOOL.hint}`}
            onClick={() => onArm(!armed)}
          >
            <span className="build-tile-art">
              <span className="terrain-tile-glyph" aria-hidden="true">
                {LAND_TOOL.glyph}
              </span>
            </span>
            <span className="build-tile-name">{landToolLabel(land)}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
