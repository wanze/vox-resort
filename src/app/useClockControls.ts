import { useCallback, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { Weather } from '../features/sim/domain/weather';

/**
 * The clock controls, as React state.
 *
 * The speed lives here, and so does the weather - which changes at most once a
 * simulated day, and so is cheap to hold in state and re-render on. The time
 * does not: it moves every frame while the resort runs, and the slider and the
 * day readout are written straight to the DOM by `hudOverlay` rather than
 * through React - see `useHudNodes`.
 */
export interface ClockControls {
  readonly speed: SimSpeed;
  /** What kind of day it is now, however it came to be that. */
  readonly weather: Weather;
  /** The day it is pinned to, or null while the week runs as it was drawn. */
  readonly forcedWeather: Weather | null;
  /** Jumps to a moment of the day; the resort keeps running. */
  setTime(time: number): void;
  setSpeed(speed: SimSpeed): void;
  /** Pins the weather to one kind of day, or hands it back with null. */
  setWeather(weather: Weather | null): void;
  /** Takes the weather the scene reports, at midnight and on a rebuild. */
  adoptWeather(weather: Weather): void;
}

export function useClockControls(showcase: RefObject<Showcase | null>): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('paused');
  // Clear until the scene says otherwise, which it does on the frame after it
  // mounts: the panel has to render before there is a showcase to ask.
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
        // What the scene will report back on the next frame, set here as well so
        // the button reads as pressed on the click rather than a frame later -
        // and so that letting go of a pin shows the week's own day at once.
        if (next !== null) setWeather(next);
      },
      [showcase],
    ),
    adoptWeather: useCallback((next: Weather) => setWeather(next), []),
  };
}
