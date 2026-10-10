import type { RefCallback, RefObject } from 'react';
import { DemandMeter } from './DemandMeter';
import { HudReadout } from './HudReadout';
import { MainMenu, type ShortcutToggle, type ViewToggles } from './MainMenu';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { RatingControl } from './RatingControl';
import { SpeedControl, type FastNights } from './SpeedControl';
import { TimeOfDay } from './TimeOfDay';
import { WeatherForecast } from './WeatherForecast';
import { WindowDock } from './WindowDock';
import { OverlayControl } from '../../overlays/components/OverlayControl';
import { HighlightControl } from '../../highlights/components/HighlightControl';
import type { DayForecast } from '../../events/domain/programmeView';
import type { Ledger } from '../../sim/domain/ledger';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { ClockControls, ResortControls, SoundControls, WindowControls } from './hudControls';
import type { StatusView } from '../domain/views';
import type { OverlayControls } from '../../overlays/components/overlayControls';
import type { SaveControls } from '../../saves/components/saveControls';

export type MenuId = 'main' | 'speed' | 'weather' | 'overlay' | 'highlight' | 'demand' | 'rating';

export interface TopBarProps {
  readonly barElement: RefCallback<HTMLElement>;
  readonly dayElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLSpanElement | null>;
  readonly clock: ClockControls;
  readonly fastNights: FastNights;
  readonly resort: ResortControls;
  readonly saves: SaveControls;
  readonly overlay: OverlayControls;
  readonly highlights: HighlightControls;
  readonly ledger: Ledger | null;
  readonly status: StatusView | null;
  readonly trend: number | null;
  readonly adviceCount: number;
  readonly windows: WindowControls;
  readonly menu: MenuId | null;
  readonly onMenuChange: (menu: MenuId | null) => void;
  readonly onFind: () => void;
  readonly view: ViewToggles;
  readonly shortcuts: ShortcutToggle;
  // A touch layout: no field takes focus by itself there.
  readonly compact: boolean;
  readonly sound: SoundControls;
  readonly forecast: readonly DayForecast[];
  readonly onPhoto: () => void;
  readonly debug: boolean;
}

function MoneyReadout({ ledger }: { readonly ledger: Ledger | null }) {
  if (ledger?.mode !== 'tycoon') return null;
  return (
    <HudReadout icon={<PixelIcon name="money" />} value={ledger.balance.toLocaleString('en-US')} />
  );
}

function GuestsReadout({ status }: { readonly status: StatusView | null }) {
  if (status === null) return null;
  return (
    <div>
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

// Never handed to the menu as the gates are: between seasons it is the one thing to press.
function OpenSeasonButton({
  season,
  onOpen,
}: {
  readonly season: number;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-chip hud-season-open"
      title="Open the gates and start the next season"
      onClick={onOpen}
    >
      <span className="hud-gates-lamp" aria-hidden="true" />
      <span className="hud-readout-value">{`Open season ${season}`}</span>
    </button>
  );
}

interface SeasonAction {
  readonly next: number;
  readonly onOpen: () => void;
}

// Null outside a break, where the gates are the player's to open and close.
function seasonActionOf(resort: ResortControls, clock: ClockControls): SeasonAction | null {
  if (resort.season?.state !== 'break') return null;
  return {
    next: resort.season.number + 1,
    onOpen: () => {
      resort.openSeason();
      clock.resume();
    },
  };
}

function GateControl({
  action,
  resort,
}: {
  readonly action: SeasonAction | null;
  readonly resort: ResortControls;
}) {
  if (action) return <OpenSeasonButton season={action.next} onOpen={action.onOpen} />;
  return <GatesToggle open={resort.open} onOpenChange={resort.setOpen} />;
}

// The stylesheet hands it to the menu on a narrow bar: there is no room, and it is rarely changed.
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
      className="ui-chip hud-gates"
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
  const { barElement, clock, resort, overlay, ledger, status, windows, menu, onMenuChange } = props;
  const season = seasonActionOf(resort, clock);
  const opener =
    (id: MenuId) =>
    (open: boolean): void =>
      onMenuChange(open ? id : null);

  return (
    <header ref={barElement} className="hud-bar">
      <div className="ui-plate">
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
          shortcuts={props.shortcuts}
          highlights={props.highlights}
          overlay={overlay}
          gates={{ open: resort.open, onOpenChange: resort.setOpen }}
          season={season}
          onPhoto={props.onPhoto}
          debug={props.debug}
        />
      </div>

      <div className="ui-plate">
        <TimeOfDay
          dayElement={props.dayElement}
          timeElement={props.timeElement}
          season={resort.season}
        />
        <SpeedControl
          speed={clock.speed}
          onSpeedChange={clock.setSpeed}
          fastNights={props.fastNights}
          open={menu === 'speed'}
          onOpenChange={opener('speed')}
          betweenSeasons={season !== null}
        />
        <WeatherForecast
          weather={clock.weather}
          forced={clock.forcedWeather}
          forecast={props.forecast}
          open={menu === 'weather'}
          onOpenChange={opener('weather')}
        />
      </div>

      {/* Highlight first: its legend hangs to the left, the map's to the right, so both fit. */}
      <div className="ui-plate hud-maps-plate">
        <HighlightControl
          highlights={props.highlights}
          open={menu === 'highlight'}
          onOpenChange={opener('highlight')}
          focusSearch={!props.compact}
        />
        <OverlayControl
          kind={overlay.kind}
          onKindChange={overlay.setOverlay}
          open={menu === 'overlay'}
          onOpenChange={opener('overlay')}
        />
      </div>

      <div className="ui-plate hud-status">
        <DemandMeter status={status} open={menu === 'demand'} onOpenChange={opener('demand')} />
        {status ? (
          <RatingControl
            rating={status.rating}
            stepFree={status.stepFree}
            trend={props.trend}
            open={menu === 'rating'}
            onOpenChange={opener('rating')}
          />
        ) : null}
        <GateControl action={season} resort={resort} />
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
