import type { ShowcaseStats } from '../../../app/showcase';
import { STAFF_CAPS, STAFF_ROLES, WAGES, wagesFor, type StaffRole } from '../../sim/domain/staff';
import type { RoleTally, StaffTally } from '../domain/staffPins';
import { ZONE_COLOURS } from '../../overlays/domain/ramp';
import { roleWord } from './staffWords';
import { crewLine, cssColour, ZONE_IDS, zoneLabel } from './zoneWords';

export interface StaffPanelProps {
  readonly staff: ShowcaseStats['staff'] | null;
  // Hourly, with the status: what those on duty were doing on the hour.
  readonly tally: StaffTally | undefined;
  readonly onHire: (role: StaffRole, count: number | null) => void;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const tallyWords = ({ working, walking, idle }: RoleTally): string =>
  `${working} working, ${walking} walking, ${idle} idle`;

function StaffRow({
  role,
  staff,
  tally,
  onHire,
}: {
  readonly role: StaffRole;
  readonly staff: ShowcaseStats['staff'];
  readonly tally: RoleTally | null;
  readonly onHire: StaffPanelProps['onHire'];
}) {
  const count = staff.roster[role];
  const auto = staff.hiring[role] === null;
  const plural = roleWord(role, 2);
  return (
    <div className="hud-staff-row">
      <dt>{plural}</dt>
      <dd className="hud-staff-count">{formatNumber(count)}</dd>
      <dd>
        <button
          type="button"
          className="hud-camera-mode hud-staff-step"
          aria-label={`Let one of the ${plural} go`}
          disabled={count <= 0}
          onClick={() => onHire(role, count - 1)}
        >
          −
        </button>
      </dd>
      <dd>
        <button
          type="button"
          className="hud-camera-mode hud-staff-step"
          aria-label={`Hire one more of the ${plural}`}
          disabled={count >= STAFF_CAPS[role]}
          onClick={() => onHire(role, count + 1)}
        >
          +
        </button>
      </dd>
      <dd>
        <button
          type="button"
          className="hud-camera-mode hud-staff-step"
          aria-label={`Hire ${plural} automatically`}
          aria-pressed={auto}
          onClick={() => onHire(role, auto ? count : null)}
        >
          Auto
        </button>
      </dd>
      <dd className="hud-staff-note">
        {auto ? null : `wants ${formatNumber(staff.recommended[role])}`}
      </dd>
      <dd className="hud-staff-note">{formatNumber(WAGES[role])}/day</dd>
      {tally && count > 0 ? <dd className="hud-staff-tally">{tallyWords(tally)}</dd> : null}
    </div>
  );
}

export function StaffPanel({ staff, tally, onHire }: StaffPanelProps) {
  if (!staff) return <p className="hud-loading">Meshing the catalogue…</p>;

  return (
    <>
      <dl className="hud-staff">
        {STAFF_ROLES.map((role) => (
          <StaffRow
            key={role}
            role={role}
            staff={staff}
            tally={tally?.[role] ?? null}
            onHire={onHire}
          />
        ))}
        <div className="hud-staff-row hud-staff-total">
          <dt>Wages</dt>
          <dd className="hud-staff-count">{formatNumber(wagesFor(staff.roster))}/day</dd>
        </div>
      </dl>
      <h3 className="hud-report-heading">Zone crews</h3>
      <dl className="zone-staff">
        {ZONE_IDS.map((zone) => (
          <div key={zone} className="zone-staff-row">
            <dt style={{ color: cssColour(ZONE_COLOURS[zone]!) }}>{zoneLabel(zone)}</dt>
            <dd>{crewLine(staff.zones[zone]!)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
