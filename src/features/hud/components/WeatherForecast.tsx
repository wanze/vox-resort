import { HudPopover } from './HudDropdown';
import { PixelIcon } from './PixelIcon';
import { WEATHER_NAMES, WEATHER_NOTES } from './controlNames';
import type { DayForecast } from '../../events/domain/programmeView';
import { dayWords } from '../../events/domain/week';
import type { Weather } from '../../sim/domain/weather';

export interface WeatherForecastProps {
  readonly weather: Weather;
  readonly forced: Weather | null;
  // From today, one a day.
  readonly forecast: readonly DayForecast[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// Today and the five days after it: the weather is drawn from the seed, so it is known ahead.
const DAYS_SHOWN = 6;

function ForecastDay({ each, today }: { readonly each: DayForecast; readonly today: boolean }) {
  return (
    <li className="hud-forecast-day">
      <span className="hud-option-icon">
        <PixelIcon name={each.weather} />
      </span>
      <span className="hud-option-text">
        <span className="hud-option-label">
          {today ? 'Today' : dayWords(each.day)} · {WEATHER_NAMES[each.weather]}
        </span>
        <span className="hud-option-note">{WEATHER_NOTES[each.weather]}</span>
      </span>
    </li>
  );
}

// Pinning the weather is a sandbox switch, so it stays on the menu's Weather page.
export function WeatherForecast(props: WeatherForecastProps) {
  const { weather, forced } = props;
  const title = `Weather: ${WEATHER_NAMES[weather]}${forced ? ', pinned' : ', following the forecast'}`;
  return (
    <HudPopover
      name="Weather forecast"
      className="hud-weather"
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      label={
        <span className="hud-weather-badge">
          <PixelIcon name={weather} />
          {forced ? <span className="hud-weather-pin" /> : null}
        </span>
      }
    >
      <ol className="hud-forecast">
        {props.forecast.slice(0, DAYS_SHOWN).map((each, at) => (
          <ForecastDay key={each.day} each={each} today={at === 0} />
        ))}
      </ol>
      {forced ? (
        <p className="hud-rating-note">
          Pinned to {WEATHER_NAMES[forced].toLowerCase()} in the menu, so every day stays that way.
        </p>
      ) : null}
    </HudPopover>
  );
}
