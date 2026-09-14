import { useState, type RefObject } from 'react';
import { CameraPanel } from './CameraPanel';
import { HudPopover } from './HudPopover';
import { HudReadout } from './HudReadout';
import { RenderStats, type FrameCostElements } from './RenderStats';
import { ResortPanel } from './ResortPanel';
import { TimeOfDay } from './TimeOfDay';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { ResortControls } from '../../../app/useResortControls';
import type { ShowcaseStats } from '../../../app/showcase';

export interface TopBarProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly drawnElement: RefObject<HTMLSpanElement | null>;
  readonly frameCostElements: FrameCostElements;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
}

/** The tools the bar can open, named so only one is ever out at a time. */
type Tool = 'details' | 'resort' | 'camera';

/**
 * The one bar the HUD reads from: what the scene is doing now, and the tools
 * that change it folded away behind their names.
 *
 * Only one tool is open at a time, because they all hang off the same edge and
 * two of them out at once would be two panels fighting for the same strip of
 * screen.
 */
export function TopBar(props: TopBarProps) {
  const {
    fps,
    stats,
    activeLightsElement,
    drawnElement,
    frameCostElements,
    timeElement,
    clock,
    camera,
    resort,
  } = props;
  const [tool, setTool] = useState<Tool | null>(null);
  const toggle = (next: Tool) => (): void => setTool((current) => (current === next ? null : next));

  return (
    <header className="hud-bar">
      <TimeOfDay
        timeElement={timeElement}
        cycling={clock.cycling}
        onTimeChange={clock.setTime}
        onCyclingChange={clock.setCycling}
      />

      <div className="hud-bar-readouts">
        <HudReadout
          label="Objects"
          value={stats ? stats.objectCount.toLocaleString('en-US') : '—'}
        />
        <HudReadout label="FPS" value={fps} />
      </div>

      {/* Pushed to the far edge, so the bar reads as what the scene is doing on
          one side and what you can do to it on the other. */}
      <div className="hud-bar-tools">
        <HudPopover label="Details" open={tool === 'details'} onToggle={toggle('details')}>
          <RenderStats
            stats={stats}
            activeLightsElement={activeLightsElement}
            drawnElement={drawnElement}
            frameCostElements={frameCostElements}
          />
        </HudPopover>

        <HudPopover label="Resort" open={tool === 'resort'} onToggle={toggle('resort')}>
          {resort.params ? (
            <ResortPanel
              params={resort.params}
              onGenerate={resort.generate}
              onClear={resort.clear}
              busy={resort.building}
            />
          ) : null}
        </HudPopover>

        <HudPopover label="Camera" open={tool === 'camera'} onToggle={toggle('camera')}>
          <CameraPanel
            mode={camera.view.mode}
            direction={camera.view.direction}
            detail={camera.view.detail}
            onModeChange={camera.setMode}
            onDirectionChange={camera.setDirection}
            onDetailChange={camera.setDetail}
          />
        </HudPopover>
      </div>
    </header>
  );
}
