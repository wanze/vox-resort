import type { ReactNode } from 'react';

export interface HudReadoutProps {
  readonly label: string;
  readonly value: ReactNode;
}

export function HudReadout({ label, value }: HudReadoutProps) {
  return (
    <div className="hud-readout">
      <span className="hud-readout-label">{label}</span>
      <span className="hud-readout-value">{value}</span>
    </div>
  );
}
