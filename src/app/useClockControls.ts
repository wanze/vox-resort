import { useCallback, useRef, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { Weather } from '../features/sim/domain/weather';

// The time is not held here: it changes every frame, so hudOverlay writes it straight to the DOM.
export interface ClockControls {
  readonly speed: SimSpeed;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
  setSpeed(speed: SimSpeed): void;
  togglePause(): void;
  setWeather(weather: Weather | null): void;
  adoptWeather(weather: Weather): void;
  // For a clock the showcase set itself, as a load does; nothing is sent back to it.
  adoptSpeed(speed: SimSpeed): void;
  adoptForced(weather: Weather | null): void;
}

export function useClockControls(showcase: RefObject<Showcase | null>): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('paused');
  // Clear until the scene reports, on the frame after it mounts.
  const [weather, setWeather] = useState<Weather>('clear');
  const [forcedWeather, setForced] = useState<Weather | null>(null);
  // So unpausing goes back to the speed the player had, not to a default.
  const running = useRef<SimSpeed>('normal');
  const current = useRef<SimSpeed>('paused');

  const changeSpeed = useCallback(
    (next: SimSpeed) => {
      current.current = next;
      if (next !== 'paused') running.current = next;
      setSpeed(next);
      showcase.current?.setSpeed(next);
    },
    [showcase],
  );

  return {
    speed,
    weather,
    forcedWeather,
    setSpeed: changeSpeed,
    togglePause: useCallback(
      () => changeSpeed(current.current === 'paused' ? running.current : 'paused'),
      [changeSpeed],
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
    adoptSpeed: useCallback((next: SimSpeed) => {
      current.current = next;
      setSpeed(next);
    }, []),
    adoptForced: useCallback((next: Weather | null) => setForced(next), []),
  };
}
