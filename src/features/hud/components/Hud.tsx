import type { RefObject } from 'react';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { HudError } from './HudError';
import { InspectPanel } from './InspectPanel';
import { TopBar, type TopBarProps } from './TopBar';
import type { BuildTool } from '../../build/domain/buildTool';
import type { SelectionView } from '../../inspect/domain/selection';

export interface HudProps extends TopBarProps {
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly selection: SelectionView | null;
  readonly inspectElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  readonly onClearSelection: () => void;
  readonly error: string | null;
}

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
        advice={props.advice}
        onShowOnPlot={props.onShowOnPlot}
      />
      <BuildPalette preview={props.preview} tool={props.tool} onToolChange={props.onToolChange} />
      <InspectPanel
        selection={props.selection}
        activityElement={props.inspectElement}
        onSelectPerson={props.onSelectPerson}
        onClose={props.onClearSelection}
      />
      {props.error ? <HudError message={props.error} /> : null}
    </div>
  );
}
