import { useState, type RefObject } from 'react';
import { AdvicePanel } from './AdvicePanel';
import { CameraPanel } from './CameraPanel';
import { GuestsPanel } from './GuestsPanel';
import { HudPopover } from './HudPopover';
import { HudReadout } from './HudReadout';
import { RenderStats, type FrameCostElements } from './RenderStats';
import { ResortPanel } from './ResortPanel';
import { TimeOfDay } from './TimeOfDay';
import { WeatherControl } from './WeatherControl';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { ResortControls } from '../../../app/useResortControls';
import type { ShowcaseStats, VoicesView } from '../../../app/showcase';
import type { Advice } from '../../sim/domain/advice';

export interface TopBarProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly drawnElement: RefObject<HTMLSpanElement | null>;
  readonly frameCostElements: FrameCostElements;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clockElement: RefObject<HTMLSpanElement | null>;
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
  readonly advice: readonly Advice[];
  readonly voices: VoicesView;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
}

type Tool = 'details' | 'resort' | 'camera' | 'advice' | 'guests';

export function TopBar(props: TopBarProps) {
  const {
    fps,
    stats,
    activeLightsElement,
    drawnElement,
    frameCostElements,
    timeElement,
    clockElement,
    clock,
    camera,
    resort,
    advice,
    voices,
    onShowOnPlot,
  } = props;
  const [tool, setTool] = useState<Tool | null>(null);
  const toggle = (next: Tool) => (): void => setTool((current) => (current === next ? null : next));

  return (
    <header className="hud-bar">
      <TimeOfDay
        timeElement={timeElement}
        clockElement={clockElement}
        speed={clock.speed}
        onTimeChange={clock.setTime}
        onSpeedChange={clock.setSpeed}
      />

      <WeatherControl
        weather={clock.weather}
        forced={clock.forcedWeather}
        onWeatherChange={clock.setWeather}
      />

      <div className="hud-bar-readouts">
        <HudReadout
          label="Objects"
          value={stats ? stats.objectCount.toLocaleString('en-US') : '—'}
        />
        <HudReadout label="Resort" value={resort.open ? 'Open' : 'Closed'} />
        <HudReadout label="FPS" value={fps} />
      </div>

      <div className="hud-bar-tools">
        <HudPopover label="Details" open={tool === 'details'} onToggle={toggle('details')}>
          <RenderStats
            stats={stats}
            activeLightsElement={activeLightsElement}
            drawnElement={drawnElement}
            frameCostElements={frameCostElements}
          />
        </HudPopover>

        <HudPopover label="Advice" open={tool === 'advice'} onToggle={toggle('advice')}>
          <AdvicePanel advice={advice} onShowOnPlot={onShowOnPlot} />
        </HudPopover>

        <HudPopover label="Guests" open={tool === 'guests'} onToggle={toggle('guests')}>
          <GuestsPanel voices={voices} />
        </HudPopover>

        <HudPopover label="Resort" open={tool === 'resort'} onToggle={toggle('resort')}>
          {resort.params ? (
            <ResortPanel
              params={resort.params}
              onGenerate={resort.generate}
              onClear={resort.clear}
              busy={resort.building}
              open={resort.open}
              onOpenChange={resort.setOpen}
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
