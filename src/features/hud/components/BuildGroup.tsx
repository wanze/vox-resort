import { BuildTile } from './BuildTile';
import type { PreviewLookup } from './BuildPalette';
import type { ObjectTypeGroup } from '../../catalog/domain/objectTypes';

export interface BuildGroupProps {
  readonly group: ObjectTypeGroup;
  readonly preview: PreviewLookup;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selected: string | null;
  readonly onSelect: (typeId: string | null) => void;
}

/**
 * One shelf of the catalogue: its name, its count, and its objects as a grid.
 *
 * Shelves stack rather than take turns — all of them are open until somebody
 * folds one away — because the thing being picked is a picture, and a picture
 * you have to open a drawer to see is no faster to find than a word.
 */
export function BuildGroup({
  group,
  preview,
  open,
  onToggle,
  selected,
  onSelect,
}: BuildGroupProps) {
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
          <span className="build-group-label">{group.label}</span>
          <span className="build-group-count">{group.types.length}</span>
        </button>
      </h3>
      {open ? (
        <div className="build-grid">
          {group.types.map((type) => (
            <BuildTile
              key={type.id}
              type={type}
              preview={preview}
              selected={selected === type.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
