import type { ReactNode } from 'react';

export interface HudReadoutProps {
  // Left out where the figure says what it is, as the stars and the gates' lamp do.
  readonly label?: string;
  readonly value: ReactNode;
  readonly icon?: ReactNode;
}

export function HudReadout({ label, value, icon }: HudReadoutProps) {
  return (
    <div className="hud-readout-row">
      {icon}
      <div className="hud-readout">
        {label ? <span className="hud-readout-label">{label}</span> : null}
        <span className="hud-readout-value">{value}</span>
      </div>
    </div>
  );
}
