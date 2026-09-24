import { WEATHERS, type Weather } from '../../sim/domain/weather';

export interface WeatherControlProps {
  readonly weather: Weather;
  readonly forced: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
}

// Kept here rather than in the domain so a phrase can change without touching it.
const WEATHER_MARKS: { readonly [kind in Weather]: string } = {
  clear: '☀︎',
  rain: '☔︎',
  storm: '⚡︎',
  heatwave: '♨︎',
};

const WEATHER_NAMES: { readonly [kind in Weather]: string } = {
  clear: 'Clear',
  rain: 'Rain',
  storm: 'Storm',
  heatwave: 'Heatwave',
};

// Auto is its own button: pinned-to-clear and running-and-clear look identical
// but behave differently at midnight.
export function WeatherControl({ weather, forced, onWeatherChange }: WeatherControlProps) {
  return (
    <div className="hud-weather" role="group" aria-label="Weather">
      <span className="hud-weather-now">
        <span aria-hidden="true">{WEATHER_MARKS[weather]}</span> {WEATHER_NAMES[weather]}
      </span>
      <button
        type="button"
        className="hud-weather-pick"
        aria-pressed={forced === null}
        title="Let the week's own weather run"
        onClick={() => onWeatherChange(null)}
      >
        Auto
      </button>
      {WEATHERS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="hud-weather-pick"
          aria-pressed={forced === kind}
          aria-label={WEATHER_NAMES[kind]}
          title={WEATHER_NAMES[kind]}
          onClick={() => onWeatherChange(kind)}
        >
          <span aria-hidden="true">{WEATHER_MARKS[kind]}</span>
        </button>
      ))}
    </div>
  );
}
