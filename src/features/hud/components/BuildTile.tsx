import { footprintLabel, isDrawable } from '../domain/paletteFilter';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import { canAfford, type Ledger } from '../../sim/domain/ledger';
import type { PreviewLookup } from './BuildPalette';
import { ObjectInfo } from './ObjectInfo';

export interface BuildTileProps {
  readonly type: ObjectTypeDefinition;
  readonly preview: PreviewLookup;
  readonly selected: boolean;
  readonly ledger: Ledger | null;
  readonly onSelect: (typeId: string | null) => void;
}

const toCssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function describe(type: ObjectTypeDefinition, cost: string): string {
  const footprint = `${footprintLabel(type)} tiles, costs ${cost}`;
  return isDrawable(type) ? `${footprint}, drag to draw a run` : footprint;
}

// A class, not disabled: the player may still pick it up to read what it costs.
function moneyOf(type: ObjectTypeDefinition, ledger: Ledger | null) {
  const cost = buildCostOf(type.id);
  const short = ledger !== null && !canAfford(ledger, cost);
  return {
    price: cost.toLocaleString('en-US'),
    className: short ? 'hud-build-tile hud-build-tile--short' : 'hud-build-tile',
    note: short ? ', more than the bank holds' : '',
  };
}

// The swatch stands in until `pnpm preview` has drawn the model.
export function TileArt({ type, preview }: { type: ObjectTypeDefinition; preview: PreviewLookup }) {
  const picture = preview(type.id);
  return (
    <span className="hud-build-tile-art">
      {picture ? (
        <img src={picture} alt="" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span className="hud-build-tile-swatch" style={{ background: toCssColor(type.color) }} />
      )}
    </span>
  );
}

export function BuildTile({ type, preview, selected, ledger, onSelect }: BuildTileProps) {
  const { price, className, note } = moneyOf(type, ledger);

  // A sibling, not a child: a button may not hold another, and the tap on it must not arm the tile.
  return (
    <div className="hud-build-tile-slot">
      <button
        type="button"
        className={className}
        aria-pressed={selected}
        aria-label={type.label}
        title={`${type.label} — ${describe(type, price)}${note}`}
        onClick={() => onSelect(selected ? null : type.id)}
      >
        <TileArt type={type} preview={preview} />
        <span className="hud-build-tile-name" aria-hidden="true">
          {type.label}
        </span>
        <span className="hud-build-tile-badge">
          <span className="hud-build-tile-cost">{price}</span>
        </span>
      </button>
      <ObjectInfo typeId={type.id} className="hud-build-tile-info" mode="hover" />
    </div>
  );
}
