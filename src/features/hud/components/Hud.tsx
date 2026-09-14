import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { HudError } from './HudError';
import { TopBar, type TopBarProps } from './TopBar';
import type { BuildTool } from '../../build/domain/buildTool';

/** Everything the bar takes, and the palette and the error beneath it. */
export interface HudProps extends TopBarProps {
  /** Where the palette's tiles get their pictures; see {@link PreviewLookup}. */
  readonly preview: PreviewLookup;
  /** What the pointer is holding, or null when it is empty. */
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly error: string | null;
}

/** The whole overlay: the bar and the palette over the scene. */
export function Hud(props: HudProps) {
  return (
    <div className="hud">
      <TopBar
        fps={props.fps}
        stats={props.stats}
        activeLightsElement={props.activeLightsElement}
        drawnElement={props.drawnElement}
        frameCostElements={props.frameCostElements}
        timeElement={props.timeElement}
        clockElement={props.clockElement}
        clock={props.clock}
        camera={props.camera}
        resort={props.resort}
      />
      <BuildPalette preview={props.preview} tool={props.tool} onToolChange={props.onToolChange} />
      {props.error ? <HudError message={props.error} /> : null}
    </div>
  );
}
