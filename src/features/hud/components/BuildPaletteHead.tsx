export interface BuildPaletteHeadProps {
  readonly count: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly armed: string | null;
  readonly onDisarm: () => void;
}

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
