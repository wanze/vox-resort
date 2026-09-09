import { useMemo } from 'react';
import { objectTypeGroups } from '../../catalog/domain/objectTypes';

export interface BuildPaletteProps {
  /** Type the pointer is armed with, or null when nothing is being placed. */
  readonly selected: string | null;
  readonly onSelect: (typeId: string | null) => void;
}

const toCssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * The build palette: every object in the catalogue, on the shelf its model
 * declares.
 *
 * Nothing here is a list of objects — the groups come straight from the model
 * registry, so a new model file appears in the palette without this component
 * being touched, which is the same rule the layout, the materials and the HUD
 * labels already follow.
 */
export function BuildPalette({ selected, onSelect }: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);

  return (
    <section className="hud-palette" aria-label="Build palette">
      <header className="hud-palette-head">
        <h2>Build</h2>
        {selected ? (
          <button type="button" className="hud-palette-clear" onClick={() => onSelect(null)}>
            Done
          </button>
        ) : null}
      </header>
      <div className="hud-palette-groups">
        {groups.map((group) => (
          <div key={group.category} className="hud-palette-group">
            <h3>{group.label}</h3>
            <ul>
              {group.types.map((type) => {
                const single = type.model.tiles.x === 1 && type.model.tiles.z === 1;
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
                        {single ? ' ✎' : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="hud-palette-hint">
        {selected
          ? 'Click to place, drag to draw ✎ objects. R turns the object a quarter, shift-R the other way. The right button moves the camera while a type is armed; Esc cancels.'
          : 'Pick an object, then click the ground to place it. R turns it before it goes down; ✎ objects can be drawn by dragging.'}
      </p>
    </section>
  );
}
