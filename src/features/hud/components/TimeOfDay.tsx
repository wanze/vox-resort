import type { RefObject } from 'react';
import { SIM_SPEEDS, SPEED_LABELS, type SimSpeed } from '../../sim/domain/simClock';

export interface TimeOfDayProps {
  /** Written straight by the render loop while the resort runs; see `useHudNodes`. */
  readonly timeElement: RefObject<HTMLInputElement | null>;
  /** The day and the hour, written the same way. */
  readonly clockElement: RefObject<HTMLSpanElement | null>;
  readonly speed: SimSpeed;
  readonly onTimeChange: (time: number) => void;
  readonly onSpeedChange: (speed: SimSpeed) => void;
}

/** Where the sun stands, which day it is, and how fast the resort is running. */
export function TimeOfDay({
  timeElement,
  clockElement,
  speed,
  onTimeChange,
  onSpeedChange,
}: TimeOfDayProps) {
  return (
    <div className="hud-time">
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
      <span ref={clockElement} className="hud-time-clock" />
      <div className="hud-time-speeds" role="group" aria-label="Simulation speed">
        {SIM_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            className="hud-time-speed"
            aria-pressed={speed === option}
            onClick={() => onSpeedChange(option)}
          >
            {SPEED_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
