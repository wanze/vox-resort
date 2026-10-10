import { PixelIcon } from '../../../shared/components/PixelIcon';
import { canRunSeasonAction, SEASON_ACTIONS } from '../../resort-sim/domain/debugSteps';
import { PHASE_WORDS, type SeasonView } from '../../sim/domain/season';
import { WEATHERS, type Weather } from '../../sim/domain/weather';
import { WEATHER_NAMES } from '../../hud/components/controlNames';
import type { DebugControls } from './debugControls';
import { SEASON_ACTION_WORDS, TURBO_WORDS } from './debugWords';

export interface DebugPanelProps {
  readonly debug: DebugControls;
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
  readonly forcedWeather: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
}

function seasonLine(season: SeasonView | null): string {
  if (!season) return 'No seasons';
  if (season.state === 'break') return `Break after season ${season.number}`;
  return `Season ${season.number}, day ${season.day}: ${PHASE_WORDS[season.phase]}`;
}

// Forecast is its own button: pinned-to-sunny and running-and-sunny look identical
// but behave differently at midnight.
function WeatherPins({
  forced,
  onWeatherChange,
}: {
  readonly forced: Weather | null;
  readonly onWeatherChange: (weather: Weather | null) => void;
}) {
  return (
    <div className="debug-panel-actions">
      <button
        type="button"
        className="ui-button"
        aria-pressed={forced === null}
        onClick={() => onWeatherChange(null)}
      >
        <PixelIcon name="forecast" />
        Forecast
      </button>
      {WEATHERS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="ui-button"
          aria-pressed={forced === kind}
          onClick={() => onWeatherChange(kind)}
        >
          <PixelIcon name={kind} />
          {WEATHER_NAMES[kind]}
        </button>
      ))}
    </div>
  );
}

export function DebugPanel(props: DebugPanelProps) {
  const { debug, season } = props;
  return (
    <div className="ui-stack debug-panel">
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-clock">
        <h3 id="debug-panel-clock" className="ui-label">
          Clock
        </h3>
        <button
          type="button"
          className="ui-button"
          aria-pressed={debug.turbo}
          onClick={() => debug.setTurbo(!debug.turbo)}
        >
          {TURBO_WORDS.label} {debug.turbo ? 'on' : 'off'}
        </button>
      </section>
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-weather">
        <h3 id="debug-panel-weather" className="ui-label">
          Weather
        </h3>
        <WeatherPins forced={props.forcedWeather} onWeatherChange={props.onWeatherChange} />
      </section>
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-render">
        <h3 id="debug-panel-render" className="ui-label">
          Render
        </h3>
        <button
          type="button"
          className="ui-button"
          aria-pressed={debug.detail}
          onClick={() => debug.setDetail(!debug.detail)}
        >
          Level of detail {debug.detail ? 'on' : 'off'}
        </button>
      </section>
      <section className="ui-stack debug-panel-group" aria-labelledby="debug-panel-season">
        <h3 id="debug-panel-season" className="ui-label">
          {seasonLine(season)}
        </h3>
        <div className="debug-panel-actions">
          {SEASON_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="ui-button"
              disabled={!canRunSeasonAction(season, action)}
              onClick={() => debug.runSeasonAction(action)}
            >
              {SEASON_ACTION_WORDS[action].label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
