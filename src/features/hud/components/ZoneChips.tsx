import { armedZone, type BuildTool } from '../../build/domain/buildTool';
import { zoneLabel, ZONE_BRUSHES } from './zoneWords';

export interface ZoneChipsProps {
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
}

export function ZoneChips({ tool, onToolChange }: ZoneChipsProps) {
  const armed = armedZone(tool);
  if (armed === null) return null;

  return (
    <div className="zone-chips" role="radiogroup" aria-label="Zone">
      {ZONE_BRUSHES.map((brush) => (
        <button
          key={brush.zone}
          type="button"
          className="zone-chip"
          role="radio"
          aria-checked={armed === brush.zone}
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
