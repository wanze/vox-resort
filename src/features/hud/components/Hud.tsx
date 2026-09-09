import type { RefObject } from "react";
import { BuildPalette } from "./BuildPalette";
import { CameraPanel } from "./CameraPanel";
import { ResortPanel } from "./ResortPanel";
import { FpsCounter } from "./FpsCounter";
import { ObjectLabels } from "./ObjectLabels";
import type { ResortParams } from "../../layout/domain/resortGenerator";
import type { CameraMode, CompassDirection } from "../../layout/domain/worldBounds";
import type { LabelAnchor, ShowcaseStats } from "../../../app/showcase";

export interface HudProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  readonly anchors: readonly LabelAnchor[];
  readonly labelElements: RefObject<Map<string, HTMLDivElement>>;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly cycling: boolean;
  readonly onTimeChange: (time: number) => void;
  readonly onCyclingChange: (cycling: boolean) => void;
  /** Object type the pointer is armed with, or null when nothing is. */
  readonly buildType: string | null;
  readonly onBuildTypeChange: (typeId: string | null) => void;
  /** What the resort on screen was grown from, and how to grow another. */
  readonly params: ResortParams | null;
  readonly onGenerate: (params: ResortParams) => void;
  readonly onClear: (params: ResortParams) => void;
  readonly building: boolean;
  /** Which camera is on screen, and which way the isometric one faces. */
  readonly cameraMode: CameraMode;
  readonly cameraDirection: CompassDirection;
  readonly onCameraModeChange: (mode: CameraMode) => void;
  readonly onCameraDirectionChange: (direction: CompassDirection) => void;
  readonly error: string | null;
}

export function Hud(props: HudProps) {
  const { fps, stats, anchors, labelElements, error } = props;
  return (
    <div className="hud">
      <FpsCounter
        fps={fps}
        stats={stats}
        activeLightsElement={props.activeLightsElement}
        timeElement={props.timeElement}
        cycling={props.cycling}
        onTimeChange={props.onTimeChange}
        onCyclingChange={props.onCyclingChange}
      />
      <CameraPanel
        mode={props.cameraMode}
        direction={props.cameraDirection}
        onModeChange={props.onCameraModeChange}
        onDirectionChange={props.onCameraDirectionChange}
      />
      <BuildPalette selected={props.buildType} onSelect={props.onBuildTypeChange} />
      {props.params ? (
        <ResortPanel
          params={props.params}
          onGenerate={props.onGenerate}
          onClear={props.onClear}
          busy={props.building}
        />
      ) : null}
      <ObjectLabels anchors={anchors} elements={labelElements} />
      {error ? (
        <div className="hud-error" role="alert">
          <strong>Could not start the renderer</strong>
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
}
