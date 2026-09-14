import type { RefObject } from 'react';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { HudError } from './HudError';
import { TopBar } from './TopBar';
import type { FrameCostElements } from './RenderStats';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { ResortControls } from '../../../app/useResortControls';
import type { ShowcaseStats } from '../../../app/showcase';
import type { BuildTool } from '../../build/domain/buildTool';

export interface HudProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly drawnElement: RefObject<HTMLSpanElement | null>;
  readonly frameCostElements: FrameCostElements;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
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
        clock={props.clock}
        camera={props.camera}
        resort={props.resort}
      />
      <BuildPalette preview={props.preview} tool={props.tool} onToolChange={props.onToolChange} />
      {props.error ? <HudError message={props.error} /> : null}
    </div>
  );
}
