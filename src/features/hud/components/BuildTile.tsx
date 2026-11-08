import { footprintLabel, isDrawable } from '../domain/paletteFilter';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import { isUnlocked, starsNeededFor } from '../../catalog/domain/unlocks';
import { canAfford, type Ledger } from '../../sim/domain/ledger';
import { starsLabel, type Prestige } from '../../sim/domain/prestige';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { PreviewLookup } from './BuildPalette';
import { ObjectInfo } from './ObjectInfo';

export interface BuildTileProps {
  readonly type: ObjectTypeDefinition;
  readonly preview: PreviewLookup;
  readonly selected: boolean;
  readonly ledger: Ledger | null;
  // Null in a sandbox and before the first resort, which lock nothing.
  readonly prestige: Prestige | null;
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

// Selectable all the same, as a tile short of money is, so the player can read what it needs.
function lockOf(type: ObjectTypeDefinition, prestige: Prestige | null): number | null {
  const needed = starsNeededFor(type.id);
  return needed === null || isUnlocked(type.id, prestige, 'tycoon') ? null : needed;
}

// A padlock over the greyed art and a pale badge, so a locked tile is not read as a dear one.
function Locked({ stars }: { readonly stars: number }) {
  return (
    <>
      <span className="hud-build-tile-lock">
        <PixelIcon name="lock" scale={2} />
      </span>
      <span className="hud-build-tile-badge">
        {stars}
        <span className="hud-build-tile-badge-star">★</span>
      </span>
    </>
  );
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

export function BuildTile({ type, preview, selected, ledger, prestige, onSelect }: BuildTileProps) {
  const { price, className, note } = moneyOf(type, ledger);
  const lock = lockOf(type, prestige);
  const title = lock
    ? `${type.label} — needs ${starsLabel(lock)}`
    : `${type.label} — ${describe(type, price)}${note}`;

  // A sibling, not a child: a button may not hold another, and the tap on it must not arm the tile.
  return (
    <div className="hud-build-tile-slot">
      <button
        type="button"
        className={className}
        data-locked={lock !== null}
        aria-pressed={selected}
        aria-label={lock ? `${type.label}, needs ${starsLabel(lock)}` : type.label}
        title={title}
        onClick={() => onSelect(selected ? null : type.id)}
      >
        <TileArt type={type} preview={preview} />
        <span className="hud-build-tile-name" aria-hidden="true">
          {type.label}
        </span>
        {lock ? <Locked stars={lock} /> : <span className="hud-build-tile-badge">{price}</span>}
      </button>
      <ObjectInfo typeId={type.id} className="hud-build-tile-info" mode="hover" />
    </div>
  );
}
