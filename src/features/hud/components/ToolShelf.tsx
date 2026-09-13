import { BULLDOZER } from '../../build/domain/buildTool';

export interface ToolShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  /** Whether the bulldozer is the thing the pointer is holding. */
  readonly armed: boolean;
  readonly onArm: (armed: boolean) => void;
}

/**
 * The shelf that takes things away rather than standing them.
 *
 * Beside the terrain shelf and above the catalogue, for the reason the terrain
 * shelf is there: the bulldozer has no model, no preview, no footprint and no
 * turn, and it works the plot rather than adding to it. What it shares with every
 * other tile is that it is the thing the pointer is holding, so it is armed and
 * disarmed by clicking it.
 *
 * Its label and hint come from `buildTool.ts`, where the tool itself is defined.
 */
export function ToolShelf({ open, onToggle, armed, onArm }: ToolShelfProps) {
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
          <span className="build-group-label">Tools</span>
          <span className="build-group-count">1</span>
        </button>
      </h3>
      {open ? (
        <div className="build-grid">
          <button
            type="button"
            className="build-tile terrain-tile"
            aria-pressed={armed}
            title={`${BULLDOZER.label} — ${BULLDOZER.hint}, drag to clear a run`}
            // Clicking the armed tile again puts the pointer down.
            onClick={() => onArm(!armed)}
          >
            <span className="build-tile-art">
              <span className="terrain-tile-glyph" aria-hidden="true">
                {BULLDOZER.glyph}
              </span>
            </span>
            <span className="build-tile-name">{BULLDOZER.label}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
