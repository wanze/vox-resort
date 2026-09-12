import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';

export interface TerrainShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The brush armed, or null when an object is armed or nothing is. */
  readonly selected: TerrainBrush | null;
  readonly onSelect: (brush: TerrainBrush | null) => void;
}

/**
 * The shelf that changes the ground rather than what stands on it.
 *
 * Above the catalogue, and not inside it, because a brush is not an object: it
 * has no model, no preview, no footprint and no turn, and every one of those is
 * something a catalogue tile prints. What it shares with one is the only thing
 * that matters here — it is the thing the pointer is holding, so it is armed and
 * disarmed by clicking it, and exactly one tile on the whole palette is lit.
 *
 * The brushes themselves come from `terrainBrush.ts`, which is the same rule the
 * catalogue's shelves follow: adding one is a line where the rule lives rather
 * than an edit here.
 */
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
              // Clicking the armed brush again puts the pointer down.
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
