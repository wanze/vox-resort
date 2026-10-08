import type { KeyboardEvent } from 'react';
import { armedZone, type BuildTool } from '../../build/domain/buildTool';
import { rovingTarget } from '../domain/roving';
import { zoneLabel, ZONE_BRUSHES } from './zoneWords';

export interface ZoneChipsProps {
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
}

export function ZoneChips({ tool, onToolChange }: ZoneChipsProps) {
  const armed = armedZone(tool);
  if (armed === null) return null;

  // One Tab stop for the group, the arrows arm as they move, as native radio buttons do.
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = ZONE_BRUSHES.findIndex((brush) => brush.zone === armed);
    const next = rovingTarget(event.key, at, ZONE_BRUSHES.length, 'both');
    const brush = next === null ? undefined : ZONE_BRUSHES[next];
    if (next === null || brush === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onToolChange({ kind: 'zone', zone: brush.zone });
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div className="zone-chips" role="radiogroup" aria-label="Zone" onKeyDown={step}>
      {ZONE_BRUSHES.map((brush) => (
        <button
          key={brush.zone}
          type="button"
          className="zone-chip"
          role="radio"
          aria-checked={armed === brush.zone}
          tabIndex={armed === brush.zone ? 0 : -1}
          aria-label={zoneLabel(brush.zone)}
          title={`${zoneLabel(brush.zone)} — ${brush.hint}`}
          style={brush.colour ? { background: brush.colour } : undefined}
          onClick={() => onToolChange({ kind: 'zone', zone: brush.zone })}
        >
          {brush.colour ? null : <span aria-hidden="true">⌫</span>}
        </button>
      ))}
    </div>
  );
}
