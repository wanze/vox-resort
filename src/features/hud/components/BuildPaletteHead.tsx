import type { StylePick } from '../../build/domain/buildTool';
import type { StyleStrip as Strip } from '../../build/domain/stylePick';
import type { PreviewLookup } from './BuildPalette';
import { StyleStrip } from './StyleStrip';

export interface BuildPaletteHeadProps {
  readonly count: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  // Only when the player opened the palette; on page load the keys still belong to the game.
  readonly focusSearch: boolean;
  readonly armed: string | null;
  readonly armedDetail: string | null;
  readonly onDisarm: () => void;
  readonly styles: Strip | null;
  readonly preview: PreviewLookup;
  readonly onStyle: (pick: StylePick) => void;
}

export function BuildPaletteHead({
  count,
  query,
  onQueryChange,
  focusSearch,
  armed,
  armedDetail,
  onDisarm,
  styles,
  preview,
  onStyle,
}: BuildPaletteHeadProps) {
  return (
    <>
      <div className="hud-palette-search">
        <input
          type="search"
          value={query}
          placeholder="Search the catalogue"
          aria-label="Search the catalogue"
          autoFocus={focusSearch}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            // The field clears itself on the first Escape; the second hands the keys back to the game.
            if (event.key === 'Escape' && query === '') event.currentTarget.blur();
          }}
        />
        <span className="hud-palette-count" title="Kinds of thing to build">
          {count}
        </span>
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
          {armedDetail ? <span className="hud-palette-armed-detail">· {armedDetail}</span> : null}
          <span className="hud-palette-armed-stop" aria-hidden="true">
            ✕
          </span>
        </button>
      ) : null}
      {styles ? <StyleStrip strip={styles} preview={preview} onStyle={onStyle} /> : null}
    </>
  );
}
