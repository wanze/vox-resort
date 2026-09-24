import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';

export interface TerrainShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selected: TerrainBrush | null;
  readonly onSelect: (brush: TerrainBrush | null) => void;
}

export function TerrainShelf({ open, onToggle, selected, onSelect }: TerrainShelfProps) {
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
          <span className="build-group-label">Terrain</span>
          <span className="build-group-count">{TERRAIN_BRUSHES.length}</span>
        </button>
      </h3>
      {open ? (
        <div className="build-grid">
          {TERRAIN_BRUSHES.map((brush) => (
            <button
              key={brush.id}
              type="button"
              className="build-tile terrain-tile"
              aria-pressed={selected === brush.id}
              title={`${brush.label} — ${brush.hint}, drag to work a run`}
              onClick={() => onSelect(selected === brush.id ? null : brush.id)}
            >
              <span className="build-tile-art">
                <span className="terrain-tile-glyph" aria-hidden="true">
                  {brush.glyph}
                </span>
              </span>
              <span className="build-tile-name">{brush.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
