import type { RefObject } from 'react';
import { DemandMeter } from './DemandMeter';
import { HudReadout } from './HudReadout';
import { MainMenu, type ViewToggles } from './MainMenu';
import { PixelIcon } from './PixelIcon';
import { RatingControl } from './RatingControl';
import { SpeedControl } from './SpeedControl';
import { TimeOfDay } from './TimeOfDay';
import { WeatherForecast } from './WeatherForecast';
import { WindowDock } from './WindowDock';
import { OverlayControl } from '../../overlays/components/OverlayControl';
import type { ClockControls } from '../../../app/useClockControls';
import type { OverlayControls } from '../../../app/useOverlay';
import type { ResortControls } from '../../../app/useResortControls';
import type { SaveControls } from '../../../app/useSaves';
import type { SoundControls } from '../../../app/useSound';
import type { StatusView } from '../../../app/showcase';
import type { WindowControls } from '../../../app/useWindows';
import type { DayForecast } from '../../events/domain/programmeView';
import type { Ledger } from '../../sim/domain/ledger';

export type MenuId = 'main' | 'speed' | 'weather' | 'overlay' | 'rating';

export interface TopBarProps {
  readonly clockElement: RefObject<HTMLSpanElement | null>;
  readonly clock: ClockControls;
  readonly resort: ResortControls;
  readonly saves: SaveControls;
  readonly overlay: OverlayControls;
  readonly ledger: Ledger | null;
  readonly status: StatusView | null;
  readonly trend: number | null;
  readonly adviceCount: number;
  readonly windows: WindowControls;
  readonly menu: MenuId | null;
  readonly onMenuChange: (menu: MenuId | null) => void;
  readonly onFind: () => void;
  readonly view: ViewToggles;
  readonly sound: SoundControls;
  readonly forecast: readonly DayForecast[];
}

function MoneyReadout({ ledger }: { readonly ledger: Ledger | null }) {
  if (ledger?.mode !== 'tycoon') return null;
  return (
    <HudReadout
      icon={<PixelIcon name="books" />}
      label="Money"
      value={ledger.balance.toLocaleString('en-US')}
    />
  );
}

function GuestsReadout({ status }: { readonly status: StatusView | null }) {
  if (status === null) return null;
  return (
    <div className="hud-guests">
      <HudReadout
        icon={<PixelIcon name="guests" />}
        value={
          <>
            {status.present.toLocaleString('en-US')}
            <span className="hud-figure-of"> / {status.beds.total.toLocaleString('en-US')}</span>
          </>
        }
      />
    </div>
  );
}

function GatesToggle({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="hud-gates"
      aria-pressed={open}
      title={open ? 'Close the gates to new guests' : 'Open the gates to new guests'}
      onClick={() => onOpenChange(!open)}
    >
      <span className="hud-gates-lamp" aria-hidden="true" />
      <span className="hud-readout-value">
        Gates<span className="hud-gates-state"> {open ? 'open' : 'closed'}</span>
      </span>
    </button>
  );
}

export function TopBar(props: TopBarProps) {
  const { clock, resort, overlay, ledger, status, windows, menu, onMenuChange } = props;
  const opener =
    (id: MenuId) =>
    (open: boolean): void =>
      onMenuChange(open ? id : null);

  return (
    <header className="hud-bar">
      <div className="hud-plate">
        <MainMenu
          open={menu === 'main'}
          onOpenChange={opener('main')}
          windows={windows}
          saves={props.saves}
          resortName={props.resort.name}
          onFind={props.onFind}
          clock={clock}
          sound={props.sound}
          view={props.view}
        />
      </div>

      <div className="hud-plate">
        <TimeOfDay clockElement={props.clockElement} />
        <SpeedControl
          speed={clock.speed}
          onSpeedChange={clock.setSpeed}
          open={menu === 'speed'}
          onOpenChange={opener('speed')}
        />
        <WeatherForecast
          weather={clock.weather}
          forced={clock.forcedWeather}
          forecast={props.forecast}
          open={menu === 'weather'}
          onOpenChange={opener('weather')}
        />
      </div>

      <div className="hud-plate">
        <OverlayControl
          kind={overlay.kind}
          onKindChange={overlay.setOverlay}
          open={menu === 'overlay'}
          onOpenChange={opener('overlay')}
        />
      </div>

      <DemandMeter demand={status?.demand ?? null} onOpen={() => windows.show('demand', true)} />

      <div className="hud-plate hud-status">
        {status ? (
          <RatingControl
            rating={status.rating}
            stepFree={status.stepFree}
            trend={props.trend}
            open={menu === 'rating'}
            onOpenChange={opener('rating')}
          />
        ) : null}
        <GatesToggle open={resort.open} onOpenChange={resort.setOpen} />
        <MoneyReadout ledger={ledger} />
        <GuestsReadout status={status} />
      </div>

      <WindowDock
        layout={windows.layout}
        onToggle={windows.toggle}
        adviceCount={props.adviceCount}
      />
    </header>
  );
}
