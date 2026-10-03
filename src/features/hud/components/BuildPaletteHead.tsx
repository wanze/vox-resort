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
  // Only for an object: a phone has no R key, and nothing else armed has a facing.
  readonly onTurn: (() => void) | null;
  readonly styles: Strip | null;
  readonly preview: PreviewLookup;
  readonly onStyle: (pick: StylePick) => void;
}

interface ArmedBarProps {
  readonly armed: string;
  readonly detail: string | null;
  readonly onDisarm: () => void;
  readonly onTurn: (() => void) | null;
}

function ArmedBar({ armed, detail, onDisarm, onTurn }: ArmedBarProps) {
  return (
    <div className="hud-palette-armed-row">
      <button
        type="button"
        className="hud-palette-armed"
        onClick={onDisarm}
        aria-label={`Stop placing ${armed}`}
      >
        <span className="hud-palette-armed-label">Placing</span>
        <span className="hud-palette-armed-name">{armed}</span>
        {detail ? <span className="hud-palette-armed-detail">· {detail}</span> : null}
        <span className="hud-palette-armed-stop" aria-hidden="true">
          ✕
        </span>
      </button>
      {onTurn ? (
        <button
          type="button"
          className="hud-palette-turn"
          onClick={onTurn}
          title="Turn (R)"
          aria-label="Turn"
        >
          ⟳
        </button>
      ) : null}
    </div>
  );
}

export function BuildPaletteHead({
  count,
  query,
  onQueryChange,
  focusSearch,
  armed,
  armedDetail,
  onDisarm,
  onTurn,
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
        <ArmedBar armed={armed} detail={armedDetail} onDisarm={onDisarm} onTurn={onTurn} />
      ) : null}
      {styles ? <StyleStrip strip={styles} preview={preview} onStyle={onStyle} /> : null}
    </>
  );
}
