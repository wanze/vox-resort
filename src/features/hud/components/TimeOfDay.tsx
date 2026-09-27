import type { RefObject } from 'react';

export interface TimeOfDayProps {
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clockElement: RefObject<HTMLSpanElement | null>;
  readonly onTimeChange: (time: number) => void;
}

export function TimeOfDay({ timeElement, clockElement, onTimeChange }: TimeOfDayProps) {
  return (
    <div className="hud-time">
      <span ref={clockElement} className="hud-time-clock" />
      <input
        ref={timeElement}
        type="range"
        min={0}
        max={1}
        step={0.002}
        defaultValue={0.62}
        onChange={(event) => onTimeChange(Number(event.target.value))}
        aria-label="Time of day"
      />
    </div>
  );
}
