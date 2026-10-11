import type { ReactNode } from 'react';

export interface HudReadoutProps {
  // Left out where the figure says what it is, as the stars and the gates' lamp do.
  readonly label?: string;
  readonly value: ReactNode;
  readonly icon?: ReactNode;
  // Read before the value where only the icon names it on screen.
  readonly name?: string;
}

export function HudReadout({ label, value, icon, name }: HudReadoutProps) {
  return (
    <div className="hud-readout-row">
      {icon}
      <div className="hud-readout">
        {label ? <span className="ui-label hud-readout-label">{label}</span> : null}
        <span className="hud-readout-value">
          {name ? <span className="ui-visually-hidden">{`${name}: `}</span> : null}
          {value}
        </span>
      </div>
    </div>
  );
}
