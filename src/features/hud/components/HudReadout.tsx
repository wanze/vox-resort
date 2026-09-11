import type { ReactNode } from 'react';

export interface HudReadoutProps {
  readonly label: string;
  readonly value: ReactNode;
}

/** One number in the bar, with the word that says what it counts. */
export function HudReadout({ label, value }: HudReadoutProps) {
  return (
    <div className="hud-readout">
      <span className="hud-readout-label">{label}</span>
      <span className="hud-readout-value">{value}</span>
    </div>
  );
}
