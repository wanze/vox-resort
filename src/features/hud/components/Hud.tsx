import type { RefObject } from 'react';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { HudError } from './HudError';
import { TopBar } from './TopBar';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { ResortControls } from '../../../app/useResortControls';
import type { ShowcaseStats } from '../../../app/showcase';

export interface HudProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
  /** Where the palette's tiles get their pictures; see {@link PreviewLookup}. */
  readonly preview: PreviewLookup;
  /** Object type the pointer is armed with, or null when nothing is. */
  readonly buildType: string | null;
  readonly onBuildTypeChange: (typeId: string | null) => void;
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
        timeElement={props.timeElement}
        clock={props.clock}
        camera={props.camera}
        resort={props.resort}
      />
      <BuildPalette
        preview={props.preview}
        selected={props.buildType}
        onSelect={props.onBuildTypeChange}
      />
      {props.error ? <HudError message={props.error} /> : null}
    </div>
  );
}
