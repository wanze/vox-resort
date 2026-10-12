import type { BuildTool, StylePick } from '../../build/domain/buildTool';
import { styleLetter, styleStripFor, type StyleStrip as Strip } from '../../build/domain/stylePick';
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
      className="hud-build-tile hud-build-tile--terrain hud-build-tile--style"
      aria-pressed={pressed}
      aria-label="Random style"
      title="Random style, rolled again for every placement"
      onClick={() => onStyle(null)}
    >
      <span className="hud-build-tile-glyph" aria-hidden="true">
        🎲
      </span>
    </button>
  );
}

export function StyleStrip({ strip, preview, onStyle }: StyleStripProps) {
  return (
    <div className="hud-palette-styles" role="group" aria-label="Style">
      <RandomTile pressed={strip.pick === null} onStyle={onStyle} />
      {strip.styles.map((type, index) => (
        <button
          key={type.id}
          type="button"
          className="hud-build-tile hud-build-tile--style"
          aria-pressed={strip.pick === type.id}
          aria-label={type.styleLabel}
          title={type.styleLabel}
          onClick={() => onStyle(type.id)}
        >
          <TileArt type={type} preview={preview} />
          <span className="hud-build-tile-name" aria-hidden="true">
            {styleLetter(index)}
          </span>
        </button>
      ))}
      <kbd className="ui-option-key hud-palette-styles-key" title="V cycles the styles">
        V
      </kbd>
    </div>
  );
}

export interface ArmedStylesProps {
  readonly tool: BuildTool | null;
  readonly preview: PreviewLookup;
  readonly onToolChange: (tool: BuildTool) => void;
}

// The sheet is put away once something is picked, so its strip is out of reach on a phone.
export function ArmedStyles({ tool, preview, onToolChange }: ArmedStylesProps) {
  const strip = styleStripFor(tool);
  if (!strip) return null;
  const onStyle = (style: StylePick): void =>
    onToolChange({ kind: 'object', id: strip.family, style });
  return <StyleStrip strip={strip} preview={preview} onStyle={onStyle} />;
}
