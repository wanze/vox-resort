import { PixelIcon } from './PixelIcon';
import { WEATHER_NAMES } from './controlNames';
import type { Weather } from '../../sim/domain/weather';

export interface WeatherBadgeProps {
  readonly weather: Weather;
  readonly forced: Weather | null;
}

// Read-only: pinning the weather is a sandbox switch, so it lives on the menu's Weather page.
export function WeatherBadge({ weather, forced }: WeatherBadgeProps) {
  const title = `Weather: ${WEATHER_NAMES[weather]}${forced ? ', pinned' : ', following the forecast'}`;
  return (
    <span className="hud-weather-badge" role="img" aria-label={title} title={title}>
      <PixelIcon name={weather} />
      {forced ? <span className="hud-weather-pin" /> : null}
    </span>
  );
}
