import type { RefObject } from 'react';
import type { SeasonView } from '../../sim/domain/season';
import { seasonLine, seasonTitle } from '../domain/seasonWords';

export interface TimeOfDayProps {
  readonly dayElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLSpanElement | null>;
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
}

export function TimeOfDay({ dayElement, timeElement, season }: TimeOfDayProps) {
  return (
    <div className="hud-time" title={season ? seasonLine(season) : undefined}>
      {season ? <span className="hud-time-season">{seasonTitle(season)}</span> : null}
      <span className="hud-time-clock">
        <span ref={dayElement} className="hud-time-day" />
        <span ref={timeElement} />
      </span>
    </div>
  );
}
