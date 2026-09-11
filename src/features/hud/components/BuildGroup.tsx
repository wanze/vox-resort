import type { ObjectTypeGroup } from '../../catalog/domain/objectTypes';

export interface BuildGroupProps {
  readonly group: ObjectTypeGroup;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selected: string | null;
  readonly onSelect: (typeId: string | null) => void;
}

const toCssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** One shelf of the catalogue: its name, and its objects once it is opened. */
export function BuildGroup({ group, open, onToggle, selected, onSelect }: BuildGroupProps) {
  return (
    <div className="hud-palette-group">
      <button
        type="button"
        className="hud-palette-group-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        {group.label}
      </button>
      {open ? (
        <ul className="hud-palette-items">
          {group.types.map((type) => {
            // A one-tile object can be drawn by dragging rather than clicked
            // down one at a time.
            const drawable = type.model.tiles.x === 1 && type.model.tiles.z === 1;
            return (
              <li key={type.id}>
                <button
                  type="button"
                  className="hud-palette-item"
                  aria-pressed={selected === type.id}
                  // Clicking the armed type again puts the pointer down.
                  onClick={() => onSelect(selected === type.id ? null : type.id)}
                >
                  <span
                    className="hud-palette-swatch"
                    style={{ background: toCssColor(type.color) }}
                  />
                  <span className="hud-palette-label">{type.label}</span>
                  <span className="hud-palette-size">
                    {type.model.tiles.x}×{type.model.tiles.z}
                    {drawable ? ' ✎' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
