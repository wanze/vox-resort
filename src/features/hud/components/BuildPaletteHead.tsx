export interface BuildPaletteHeadProps {
  /** How many objects the shelves below are currently offering. */
  readonly count: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** Name of the type the pointer is holding, or null when it is empty. */
  readonly armed: string | null;
  readonly onDisarm: () => void;
}

/**
 * The palette's fixed top: what it is, how to narrow it, and what you are
 * holding.
 *
 * The armed chip only appears once something is armed, which is deliberate —
 * it is the one control that is about the pointer rather than the catalogue,
 * and a permanently empty slot for it would read as a fourth thing to fill in.
 */
export function BuildPaletteHead({
  count,
  query,
  onQueryChange,
  armed,
  onDisarm,
}: BuildPaletteHeadProps) {
  return (
    <>
      <header className="hud-palette-head">
        <h2 className="hud-palette-title">Build</h2>
        <span className="hud-palette-count">{count}</span>
      </header>

      <div className="hud-palette-search">
        <input
          type="search"
          value={query}
          placeholder="Search the catalogue"
          aria-label="Search the catalogue"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      {armed ? (
        <button
          type="button"
          className="hud-palette-armed"
          onClick={onDisarm}
          aria-label={`Stop placing ${armed}`}
        >
          <span className="hud-palette-armed-label">Placing</span>
          <span className="hud-palette-armed-name">{armed}</span>
          <span className="hud-palette-armed-stop" aria-hidden="true">
            ✕
          </span>
        </button>
      ) : null}
    </>
  );
}
