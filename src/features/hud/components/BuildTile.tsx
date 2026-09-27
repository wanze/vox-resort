import { footprintLabel, isDrawable } from '../domain/paletteFilter';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import { canAfford, type Ledger } from '../../sim/domain/ledger';
import type { PreviewLookup } from './BuildPalette';

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
    className: short ? 'build-tile build-tile-short' : 'build-tile',
    note: short ? ', more than the bank holds' : '',
  };
}

export function BuildTile({ type, preview, selected, ledger, onSelect }: BuildTileProps) {
  const picture = preview(type.id);
  const { price, className, note } = moneyOf(type, ledger);

  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      title={`${type.label} — ${describe(type, price)}${note}`}
      onClick={() => onSelect(selected ? null : type.id)}
    >
      <span className="build-tile-art">
        {picture ? (
          <img src={picture} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <span className="build-tile-swatch" style={{ background: toCssColor(type.color) }} />
        )}
      </span>
      <span className="build-tile-name">{type.label}</span>
      <span className="build-tile-badge">
        <span className="build-tile-cost">{price}</span>
      </span>
    </button>
  );
}
