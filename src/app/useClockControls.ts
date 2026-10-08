import { useCallback, useRef, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { Weather } from '../features/sim/domain/weather';
import type { ClockControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

export function useClockControls(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
): ClockControls {
  const [speed, setSpeed] = useState<SimSpeed>('paused');
  const weather = useHudSlice(hud, (state) => state.weather);
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
      },
      [showcase],
    ),
    adoptSpeed: useCallback((next: SimSpeed) => {
      current.current = next;
      setSpeed(next);
    }, []),
    adoptForced: useCallback((next: Weather | null) => setForced(next), []),
  };
}
