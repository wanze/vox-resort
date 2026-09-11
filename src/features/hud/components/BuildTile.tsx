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

/** What the tile says on hover, and what a screen reader hears after the name. */
function describe(type: ObjectTypeDefinition): string {
  const footprint = `${footprintLabel(type)} tiles`;
  return isDrawable(type) ? `${footprint}, drag to draw a run` : footprint;
}

/**
 * One object on the shelf: its picture, its name and the ground it claims.
 *
 * The picture is the preview rendered from the very model the scene will build,
 * so the tile is the object rather than a word for it — which is the whole point
 * of a catalogue you pick from by eye. When there is none the swatch colour
 * stands in; see `catalog/adapters/previews` for when that happens.
 */
export function BuildTile({ type, preview, selected, onSelect }: BuildTileProps) {
  const picture = preview(type.id);

  return (
    <button
      type="button"
      className="build-tile"
      aria-pressed={selected}
      title={`${type.label} — ${describe(type)}`}
      // Clicking the armed type again puts the pointer down.
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
