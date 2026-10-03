import { useState } from 'react';
import { MAX_RESORT_NAME, rerollResortName, resortNameFor } from '../domain/resortName';

export interface ResortNameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

// Follows the seed until the player names the resort, so a rerolled seed brings its own name.
export function useDraftName(seed: number): readonly [string, (name: string) => void] {
  const [typed, setTyped] = useState<string | null>(null);
  return [typed ?? resortNameFor(seed), setTyped];
}

export function ResortNameField({ value, onChange }: ResortNameFieldProps) {
  return (
    <div className="hud-resort-row hud-resort-name">
      <span>Name</span>
      <input
        type="text"
        value={value}
        maxLength={MAX_RESORT_NAME}
        placeholder="Name the resort"
        onChange={(event) => onChange(event.target.value)}
        aria-label="Name of the resort"
      />
      <button
        type="button"
        className="hud-resort-roll"
        onClick={() => onChange(rerollResortName(Math.random))}
        aria-label="A different name"
      >
        ⟳
      </button>
    </div>
  );
}
