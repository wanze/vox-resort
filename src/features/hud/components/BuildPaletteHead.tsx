import type { StylePick } from '../../build/domain/buildTool';
import type { StyleStrip as Strip } from '../../build/domain/stylePick';
import type { PreviewLookup } from './BuildPalette';
import { ObjectInfo } from './ObjectInfo';
import { StyleStrip } from './StyleStrip';
import { keyLabel } from '../domain/keymap';

export interface BuildPaletteHeadProps {
  readonly count: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  // Only when the player opened the palette; on page load the keys still belong to the game.
  readonly focusSearch: boolean;
  readonly armed: string | null;
  readonly armedDetail: string | null;
  readonly armedObject: string | null;
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
  readonly object: string | null;
  readonly onDisarm: () => void;
  readonly onTurn: (() => void) | null;
}

function ArmedBar({ armed, detail, object, onDisarm, onTurn }: ArmedBarProps) {
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
      {object ? (
        <ObjectInfo typeId={object} className="hud-palette-info" mode="toggle" scale={2} />
      ) : null}
      {onTurn ? (
        <button
          type="button"
          className="hud-palette-turn"
          onClick={onTurn}
          title={`Turn (${keyLabel('turnPlacement')})`}
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
  armedObject,
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
        <ArmedBar
          armed={armed}
          detail={armedDetail}
          object={armedObject}
          onDisarm={onDisarm}
          onTurn={onTurn}
        />
      ) : null}
      {styles ? <StyleStrip strip={styles} preview={preview} onStyle={onStyle} /> : null}
    </>
  );
}
