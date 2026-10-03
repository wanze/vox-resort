import type { RefObject } from 'react';
import { DemandMeter } from './DemandMeter';
import { HudReadout } from './HudReadout';
import { MainMenu } from './MainMenu';
import { PixelIcon } from './PixelIcon';
import { RatingControl } from './RatingControl';
import { SpeedControl } from './SpeedControl';
import { TimeOfDay } from './TimeOfDay';
import { WeatherControl } from './WeatherControl';
import { WindowToolbar } from './WindowToolbar';
import { OverlayControl } from '../../overlays/components/OverlayControl';
import type { ClockControls } from '../../../app/useClockControls';
import type { OverlayControls } from '../../../app/useOverlay';
import type { ResortControls } from '../../../app/useResortControls';
import type { SaveControls } from '../../../app/useSaves';
import type { StatusView } from '../../../app/showcase';
import type { WindowControls } from '../../../app/useWindows';
import type { Ledger } from '../../sim/domain/ledger';

export type MenuId = 'main' | 'speed' | 'weather' | 'overlay' | 'rating';

export interface TopBarProps {
  readonly timeElement: RefObject<HTMLInputElement | null>;
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
  readonly markers: boolean;
  readonly onMarkersChange: (shown: boolean) => void;
  readonly signs: boolean;
  readonly onSignsChange: (shown: boolean) => void;
  readonly staffPins: boolean;
  readonly onStaffPinsChange: (shown: boolean) => void;
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
    <HudReadout
      icon={<PixelIcon name="guests" />}
      label="Guests"
      value={
        <>
          {status.present.toLocaleString('en-US')}
          <span className="hud-figure-of"> / {status.beds.total.toLocaleString('en-US')}</span>
        </>
      }
    />
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
      <span className="hud-readout">
        <span className="hud-readout-label">Gates</span>
        <span className="hud-readout-value">{open ? 'Open' : 'Closed'}</span>
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
        />
      </div>

      <div className="hud-plate">
        <TimeOfDay
          timeElement={props.timeElement}
          clockElement={props.clockElement}
          onTimeChange={clock.setTime}
        />
        <SpeedControl
          speed={clock.speed}
          onSpeedChange={clock.setSpeed}
          open={menu === 'speed'}
          onOpenChange={opener('speed')}
        />
      </div>

      <div className="hud-plate">
        <WeatherControl
          weather={clock.weather}
          forced={clock.forcedWeather}
          onWeatherChange={clock.setWeather}
          open={menu === 'weather'}
          onOpenChange={opener('weather')}
        />
        <OverlayControl
          kind={overlay.kind}
          onKindChange={overlay.setOverlay}
          open={menu === 'overlay'}
          onOpenChange={opener('overlay')}
          markers={props.markers}
          onMarkersChange={props.onMarkersChange}
          signs={props.signs}
          onSignsChange={props.onSignsChange}
          staff={props.staffPins}
          onStaffChange={props.onStaffPinsChange}
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
        <GuestsReadout status={status} />
        <MoneyReadout ledger={ledger} />
        <GatesToggle open={resort.open} onOpenChange={resort.setOpen} />
      </div>

      <WindowToolbar
        layout={windows.layout}
        onToggle={windows.toggle}
        adviceCount={props.adviceCount}
      />
    </header>
  );
}
