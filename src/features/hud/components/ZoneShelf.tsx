import { ZONE_COLOURS } from '../../overlays/domain/ramp';
import { STAFF_ROLES, type Roster } from '../../sim/domain/staff';
import { NO_ZONE, ZONES } from '../../sim/domain/zones';
import { roleWord } from './staffWords';

export interface ZoneShelfProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selected: number | null;
  readonly onSelect: (zone: number | null) => void;
  readonly staff: readonly Roster[] | null;
}

const ZONE_IDS = Array.from({ length: ZONES }, (_, zone) => zone);

const cssColour = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

export const zoneLabel = (zone: number): string =>
  zone === NO_ZONE ? 'Erase zone' : `Zone ${zone + 1}`;

function crewLine(roster: Roster): string {
  const parts = STAFF_ROLES.filter((role) => roster[role] > 0).map(
    (role) => `${roster[role]} ${roleWord(role, roster[role])}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'nobody';
}

interface ZoneBrush {
  readonly zone: number;
  readonly name: string;
  readonly hint: string;
  readonly glyph: string;
  readonly colour?: string;
}

const BRUSHES: readonly ZoneBrush[] = [
  ...ZONE_IDS.map((zone) => ({
    zone,
    name: zoneLabel(zone),
    hint: 'Paint where staff work, drag to paint a run',
    glyph: '■',
    colour: cssColour(ZONE_COLOURS[zone]!),
  })),
  {
    zone: NO_ZONE,
    name: 'Erase',
    hint: 'Take the zone off a tile, drag to clear a run',
    glyph: '⌫',
  },
];

function ZoneButton({
  brush,
  selected,
  onSelect,
}: {
  readonly brush: ZoneBrush;
  readonly selected: number | null;
  readonly onSelect: ZoneShelfProps['onSelect'];
}) {
  const pressed = selected === brush.zone;
  return (
    <button
      type="button"
      className="build-tile terrain-tile"
      aria-pressed={pressed}
      title={`${zoneLabel(brush.zone)} — ${brush.hint}`}
      onClick={() => onSelect(pressed ? null : brush.zone)}
    >
      <span className="build-tile-art">
        <span className="terrain-tile-glyph" aria-hidden="true" style={{ color: brush.colour }}>
          {brush.glyph}
        </span>
      </span>
      <span className="build-tile-name">{brush.name}</span>
    </button>
  );
}

export function ZoneShelf({ open, onToggle, selected, onSelect, staff }: ZoneShelfProps) {
  return (
    <section className="build-group">
      <h3 className="build-group-head">
        <button
          type="button"
          className="build-group-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="build-group-caret" aria-hidden="true" />
          <span className="build-group-label">Zones</span>
          <span className="build-group-count">{ZONES}</span>
        </button>
      </h3>
      {open ? (
        <>
          <div className="build-grid">
            {BRUSHES.map((brush) => (
              <ZoneButton key={brush.zone} brush={brush} selected={selected} onSelect={onSelect} />
            ))}
          </div>
          {staff ? (
            <dl className="zone-staff">
              {ZONE_IDS.map((zone) => (
                <div key={zone} className="zone-staff-row">
                  <dt style={{ color: cssColour(ZONE_COLOURS[zone]!) }}>{zoneLabel(zone)}</dt>
                  <dd>{crewLine(staff[zone]!)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
