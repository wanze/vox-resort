import type { RefObject } from 'react';

export interface TimeOfDayProps {
  readonly dayElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLSpanElement | null>;
}

export function TimeOfDay({ dayElement, timeElement }: TimeOfDayProps) {
  return (
    <div className="hud-time">
      <span className="hud-time-clock">
        <span ref={dayElement} className="hud-time-day" />
        <span ref={timeElement} />
      </span>
    </div>
  );
}
