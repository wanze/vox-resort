import { WEATHERS, type Weather } from '../../sim/domain/weather';

export interface WeatherControlProps {
  /** What kind of day it is now, however it came to be that. */
  readonly weather: Weather;
  /** The day it is pinned to, or null while the week runs as it was drawn. */
  readonly forced: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
}

/**
 * What each kind of day is called, and the mark it is shown by.
 *
 * Here rather than in `sim/domain/weather.ts` for the reason `RenderStats.tsx`
 * keeps its own copy of the names: the domain should not have to be edited to
 * change a phrase, and a bar this narrow wants a glyph where the panel wants a
 * sentence.
 */
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

/**
 * What the sky is doing, and the four buttons that make it do something else.
 *
 * ## Why the resort can be made to storm from the bar
 *
 * A storm is four days in twenty-four and it lasts a whole simulated day, so
 * seeing whether the rain draws right, or whether a plot has enough under a
 * roof to survive one, means waiting out a week at whatever speed the clock is
 * on. The buttons pin it instead. Nothing about the pin is saved - see
 * `showcase.ts`'s `Clock.setWeather` - so it is a way of looking at the resort
 * and not a change to it.
 *
 * ## Auto is a button rather than the absence of one
 *
 * Pressing the day that is already pinned could let go of the pin, and that is
 * exactly the control nobody can see the state of: pinned-to-clear and
 * running-and-clear look identical and behave differently at midnight. So the
 * week's own draw is its own button, and it is the one lit when nothing is
 * pinned.
 */
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
