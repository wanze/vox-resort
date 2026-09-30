import type { ShowcaseStats } from '../../../app/showcase';
import { STAFF_CAPS, STAFF_ROLES, WAGES, wagesFor, type StaffRole } from '../../sim/domain/staff';
import { roleWord } from './staffWords';

export interface StaffPanelProps {
  readonly staff: ShowcaseStats['staff'] | null;
  readonly onHire: (role: StaffRole, count: number | null) => void;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

function StaffRow({
  role,
  staff,
  onHire,
}: {
  readonly role: StaffRole;
  readonly staff: ShowcaseStats['staff'];
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
    </div>
  );
}

export function StaffPanel({ staff, onHire }: StaffPanelProps) {
  if (!staff) return <p className="hud-loading">Meshing the catalogue…</p>;

  return (
    <dl className="hud-staff">
      {STAFF_ROLES.map((role) => (
        <StaffRow key={role} role={role} staff={staff} onHire={onHire} />
      ))}
      <div className="hud-staff-row hud-staff-total">
        <dt>Wages</dt>
        <dd className="hud-staff-count">{formatNumber(wagesFor(staff.roster))}/day</dd>
      </div>
    </dl>
  );
}
