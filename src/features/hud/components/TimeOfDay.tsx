import type { RefObject } from 'react';

export interface TimeOfDayProps {
  readonly clockElement: RefObject<HTMLSpanElement | null>;
}

export function TimeOfDay({ clockElement }: TimeOfDayProps) {
  return (
    <div className="hud-time">
      <span ref={clockElement} className="hud-time-clock" />
    </div>
  );
}
