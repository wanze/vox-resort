import { HudOption } from './HudOption';
import { WEATHER_NAMES, WEATHER_NOTES } from './controlNames';
import { WEATHERS, type Weather } from '../../sim/domain/weather';

export interface WeatherOptionsProps {
  readonly forced: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
}

// Forecast is its own row: pinned-to-sunny and running-and-sunny look identical
// but behave differently at midnight.
export function WeatherOptions({ forced, onWeatherChange }: WeatherOptionsProps) {
  return (
    <>
      <HudOption
        icon="forecast"
        label="Forecast"
        note="let the week's own weather run"
        checked={forced === null}
        onSelect={() => onWeatherChange(null)}
      />
      <hr className="hud-rule" />
      {WEATHERS.map((kind) => (
        <HudOption
          key={kind}
          icon={kind}
          label={WEATHER_NAMES[kind]}
          note={WEATHER_NOTES[kind]}
          checked={forced === kind}
          onSelect={() => onWeatherChange(kind)}
        />
      ))}
    </>
  );
}
