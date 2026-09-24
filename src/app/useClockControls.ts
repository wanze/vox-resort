import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { Weather } from '../features/sim/domain/weather';

// The time is not held here: it changes every frame, so hudOverlay writes it straight to the DOM.
export interface ClockControls {
  readonly speed: SimSpeed;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  setWeather(weather: Weather | null): void;
  adoptWeather(weather: Weather): void;
}

export function useClockControls(showcase: RefObject<Showcase | null>): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('paused');
  // Clear until the scene reports, on the frame after it mounts.
  const [weather, setWeather] = useState<Weather>('clear');
  const [forcedWeather, setForced] = useState<Weather | null>(null);

  return {
    speed,
    weather,
    forcedWeather,
    setTime: useCallback(
      (time: number) => {
        showcase.current?.setTime(time);
      },
      [showcase],
    ),
    setSpeed: useCallback(
      (next: SimSpeed) => {
        setSpeed(next);
        showcase.current?.setSpeed(next);
      },
      [showcase],
    ),
    setWeather: useCallback(
      (next: Weather | null) => {
        setForced(next);
        showcase.current?.setWeather(next);
        // Set here too, so the button reads as pressed on the click rather than a frame later.
        if (next !== null) setWeather(next);
      },
      [showcase],
    ),
    adoptWeather: useCallback((next: Weather) => setWeather(next), []),
  };
}
