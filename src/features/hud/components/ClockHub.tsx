import type { RefObject } from 'react';
import { HudReadout } from './HudReadout';
import { shortAmount } from './ledgerWords';
import { OutOf } from '../../../shared/components/OutOf';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { PlayButton, SpeedControl, type FastNights } from './SpeedControl';
import { TimeOfDay } from './TimeOfDay';
import { WeatherForecast } from './WeatherForecast';
import type { DayForecast } from '../../events/domain/programmeView';
import type { SeasonView } from '../../sim/domain/season';
import type { Ledger } from '../../sim/domain/ledger';
import type { ClockControls } from './hudControls';
import type { StatusView } from '../domain/views';

function GuestsReadout({ status }: { readonly status: StatusView | null }) {
  if (status === null) return null;
  return (
    <HudReadout
      name="Guests"
      icon={<PixelIcon name="guests" />}
      value={<OutOf value={status.present} total={status.beds.total} unit="beds" />}
    />
  );
}

// The full figure is read out and kept in the title: only the strip's eye gets the short one.
function MoneyReadout({ balance, short }: { readonly balance: number; readonly short: boolean }) {
  const full = balance.toLocaleString('en-US');
  const value = short ? (
    <span title={full}>
      <span aria-hidden="true">{shortAmount(balance)}</span>
      <span className="ui-visually-hidden">{full}</span>
    </span>
  ) : (
    full
  );
  return <HudReadout name="Money" icon={<PixelIcon name="money" />} value={value} />;
}

export interface ClockHubProps {
  readonly dayElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLSpanElement | null>;
  readonly season: SeasonView | null;
  readonly clock: ClockControls;
  readonly fastNights: FastNights;
  readonly forecast: readonly DayForecast[];
  readonly ledger: Ledger | null;
  readonly status: StatusView | null;
  // The clock is stopped until the next season opens.
  readonly betweenSeasons: boolean;
  readonly short: boolean;
  readonly speedMenu: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
  readonly weatherMenu: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
}

// Free play keeps no books, so there the guests are the only figure and never fold away.
function HubFigures({ ledger, status, short }: Pick<ClockHubProps, 'ledger' | 'status' | 'short'>) {
  if (ledger?.mode !== 'tycoon') return <GuestsReadout status={status} />;
  return (
    <>
      <MoneyReadout balance={ledger.balance} short={short} />
      <div className="hud-hub-guests">
        <GuestsReadout status={status} />
      </div>
    </>
  );
}

// What is always read and always pressed, sunk into the middle of the bar around the play button.
export function ClockHub(props: ClockHubProps) {
  const { clock } = props;
  return (
    <div className="ui-plate hud-hub">
      <div className="ui-inset hud-hub-well">
        <TimeOfDay
          dayElement={props.dayElement}
          timeElement={props.timeElement}
          season={props.season}
        />
        <WeatherForecast
          weather={clock.weather}
          forced={clock.forcedWeather}
          forecast={props.forecast}
          open={props.weatherMenu.open}
          onOpenChange={props.weatherMenu.onOpenChange}
        />
        <PlayButton
          speed={clock.speed}
          onToggle={clock.togglePause}
          betweenSeasons={props.betweenSeasons}
        />
        <SpeedControl
          speed={clock.speed}
          onSpeedChange={clock.setSpeed}
          fastNights={props.fastNights}
          open={props.speedMenu.open}
          onOpenChange={props.speedMenu.onOpenChange}
          betweenSeasons={props.betweenSeasons}
        />
        <HubFigures ledger={props.ledger} status={props.status} short={props.short} />
      </div>
    </div>
  );
}
