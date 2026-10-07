import type { CSSProperties } from 'react';
import { PRESSURE_LOUD } from './demandWords';

function toneOf(pressure: number): string {
  if (pressure > PRESSURE_LOUD) return 'loud';
  return pressure > 0 ? 'up' : 'down';
}

// Upright in the bar, across in the window: the same zero-centred scale either way.
export function DemandBar({
  pressure,
  across = false,
}: {
  readonly pressure: number;
  readonly across?: boolean;
}) {
  return (
    <span
      className="hud-demand-bar"
      data-tone={toneOf(pressure)}
      data-across={across || undefined}
      aria-hidden="true"
    >
      <span className="hud-demand-fill" style={{ '--pressure': pressure } as CSSProperties} />
    </span>
  );
}
