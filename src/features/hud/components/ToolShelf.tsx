import { BULLDOZER } from '../../build/domain/buildTool';

export interface ToolShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly armed: boolean;
  readonly onArm: (armed: boolean) => void;
}

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
