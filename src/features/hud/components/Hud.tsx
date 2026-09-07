import type { RefObject } from "react";
import { BuildPalette } from "./BuildPalette";
import { FpsCounter } from "./FpsCounter";
import { ObjectLabels } from "./ObjectLabels";
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
      <BuildPalette selected={props.buildType} onSelect={props.onBuildTypeChange} />
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
