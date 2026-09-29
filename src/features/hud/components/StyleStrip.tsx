import type { StylePick } from '../../build/domain/buildTool';
import { styleLetter, type StyleStrip as Strip } from '../../build/domain/stylePick';
import type { PreviewLookup } from './BuildPalette';
import { TileArt } from './BuildTile';

export interface StyleStripProps {
  readonly strip: Strip;
  readonly preview: PreviewLookup;
  readonly onStyle: (pick: StylePick) => void;
}

function RandomTile({
  pressed,
  onStyle,
}: {
  pressed: boolean;
  onStyle: (pick: StylePick) => void;
}) {
  return (
    <button
      type="button"
      className="build-tile terrain-tile style-tile"
      aria-pressed={pressed}
      aria-label="Random style"
      title="Random style, rolled again for every placement"
      onClick={() => onStyle(null)}
    >
      <span className="terrain-tile-glyph" aria-hidden="true">
        🎲
      </span>
    </button>
  );
}

export function StyleStrip({ strip, preview, onStyle }: StyleStripProps) {
  return (
    <div className="hud-palette-styles" role="group" aria-label="Style">
      {strip.rolls ? <RandomTile pressed={strip.pick === null} onStyle={onStyle} /> : null}
      {strip.styles.map((type, index) => (
        <button
          key={type.id}
          type="button"
          className="build-tile style-tile"
          aria-pressed={strip.pick === type.id}
          aria-label={type.styleLabel}
          title={type.styleLabel}
          onClick={() => onStyle(type.id)}
        >
          <TileArt type={type} preview={preview} />
          <span className="build-tile-name" aria-hidden="true">
            {styleLetter(index)}
          </span>
        </button>
      ))}
      <kbd className="hud-option-key hud-palette-styles-key" title="V cycles the styles">
        V
      </kbd>
    </div>
  );
}
