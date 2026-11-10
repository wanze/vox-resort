import type { CSSProperties } from 'react';
import { PRESSURE_LOUD } from './demandWords';

function toneOf(pressure: number): string {
  if (pressure > PRESSURE_LOUD) return 'loud';
  return pressure > 0 ? 'up' : 'down';
}

export function DemandBar({ pressure }: { readonly pressure: number }) {
  return (
    <span className="hud-demand-bar" data-tone={toneOf(pressure)} aria-hidden="true">
      <span className="hud-demand-fill" style={{ '--pressure': pressure } as CSSProperties} />
    </span>
  );
}
