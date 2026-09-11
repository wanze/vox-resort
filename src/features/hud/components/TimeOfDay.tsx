import type { RefObject } from 'react';

export interface TimeOfDayProps {
  /** Written straight by the render loop while the cycle runs; see `useHudNodes`. */
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly cycling: boolean;
  readonly onTimeChange: (time: number) => void;
  readonly onCyclingChange: (cycling: boolean) => void;
}

/** Where the sun stands, and whether it is moving on its own. */
export function TimeOfDay({ timeElement, cycling, onTimeChange, onCyclingChange }: TimeOfDayProps) {
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
      <label className="hud-time-cycle">
        <input
          type="checkbox"
          checked={cycling}
          onChange={(event) => onCyclingChange(event.target.checked)}
        />
        <span>Cycle</span>
      </label>
    </div>
  );
}
