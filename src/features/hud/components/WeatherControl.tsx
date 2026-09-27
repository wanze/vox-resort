import { HudDropdown } from './HudDropdown';
import { HudOption } from './HudOption';
import { PixelIcon } from './PixelIcon';
import { WEATHER_NAMES, WEATHER_NOTES } from './controlNames';
import { WEATHERS, type Weather } from '../../sim/domain/weather';

export interface WeatherControlProps {
  readonly weather: Weather;
  readonly forced: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// Forecast is its own row: pinned-to-sunny and running-and-sunny look identical
// but behave differently at midnight.
export function WeatherControl({
  weather,
  forced,
  onWeatherChange,
  open,
  onOpenChange,
}: WeatherControlProps) {
  const pick = (next: Weather | null) => (): void => {
    onWeatherChange(next);
    onOpenChange(false);
  };

  return (
    <HudDropdown
      className="hud-weather"
      open={open}
      onOpenChange={onOpenChange}
      title={`Weather: ${WEATHER_NAMES[weather]}${forced ? ', pinned' : ', following the forecast'}`}
      label={
        <>
          <PixelIcon name={weather} />
          <span className="hud-chip-label">{WEATHER_NAMES[weather]}</span>
          <span className="hud-chip-tag">{forced ? 'pinned' : 'forecast'}</span>
        </>
      }
    >
      <HudOption
        icon="forecast"
        label="Forecast"
        note="let the week's own weather run"
        checked={forced === null}
        onSelect={pick(null)}
      />
      <hr className="hud-rule" />
      {WEATHERS.map((kind) => (
        <HudOption
          key={kind}
          icon={kind}
          label={WEATHER_NAMES[kind]}
          note={WEATHER_NOTES[kind]}
          checked={forced === kind}
          onSelect={pick(kind)}
        />
      ))}
    </HudDropdown>
  );
}
