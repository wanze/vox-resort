import { footprintLabel, isDrawable } from '../domain/paletteFilter';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import type { PreviewLookup } from './BuildPalette';

export interface BuildTileProps {
  readonly type: ObjectTypeDefinition;
  readonly preview: PreviewLookup;
  readonly selected: boolean;
  readonly onSelect: (typeId: string | null) => void;
}

const toCssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function describe(type: ObjectTypeDefinition): string {
  const footprint = `${footprintLabel(type)} tiles`;
  return isDrawable(type) ? `${footprint}, drag to draw a run` : footprint;
}

export function BuildTile({ type, preview, selected, onSelect }: BuildTileProps) {
  const picture = preview(type.id);

  return (
    <button
      type="button"
      className="build-tile"
      aria-pressed={selected}
      title={`${type.label} — ${describe(type)}`}
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
        {footprintLabel(type)}
        {isDrawable(type) ? <span className="build-tile-draw"> ✎</span> : null}
      </span>
    </button>
  );
}
