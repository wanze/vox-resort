import { HelpTip } from '../../../shared/components/HelpTip';
import type { IconName } from '../../../shared/components/pixelIcons';
import { STAFF_CAPS, STAFF_ROLES, WAGES, wagesFor, type StaffRole } from '../../sim/domain/staff';
import type { RoleTally, StaffTally } from '../domain/staffPins';
import { ZONE_COLOURS } from '../../overlays/domain/ramp';
import { roleWord } from './staffWords';
import { crewLine, cssColour, ZONE_IDS, zoneLabel } from './zoneWords';
import type { ShowcaseStats } from '../domain/views';
import { PanelSummary } from './PanelSummary';
import { SettingGroup, SettingRow } from './SettingRows';

export interface StaffPanelProps {
  readonly staff: ShowcaseStats['staff'] | null;
  // Hourly, with the status: what those on duty were doing on the hour.
  readonly tally: StaffTally | undefined;
  readonly onHire: (role: StaffRole, count: number | null) => void;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const ROLE_ICONS: { readonly [role in StaffRole]: IconName } = {
  cleaner: 'cleaner',
  lifeguard: 'lifeguard',
  animator: 'animator',
  mechanic: 'mechanic',
};

const tallyWords = ({ working, walking, idle }: RoleTally): string =>
  `${working} working, ${walking} walking, ${idle} idle`;

const SHARES = ['working', 'walking', 'idle'] as const;

const onDuty = ({ working, walking, idle }: RoleTally): number => working + walking + idle;

// Drawn empty for a role nobody holds, so every row keeps the same height.
function DutyBar({ tally }: { readonly tally: RoleTally | null }) {
  if (!tally || onDuty(tally) === 0) return <span className="hud-staff-duty" />;
  const words = tallyWords(tally);
  return (
    <span className="hud-staff-duty" role="img" aria-label={words} title={words}>
      {SHARES.map((share) => (
        <span
          key={share}
          className="hud-staff-duty-share"
          data-share={share}
          style={{ flexGrow: tally[share] }}
        />
      ))}
    </span>
  );
}

function Headcount({ count, wanted }: { readonly count: number; readonly wanted: number }) {
  return (
    <>
      {formatNumber(count)}
      {wanted === count ? null : (
        <span className="hud-staff-wanted" data-tone={count < wanted ? 'bad' : undefined}>
          /{formatNumber(wanted)}
        </span>
      )}
    </>
  );
}

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
    <SettingRow
      icon={ROLE_ICONS[role]}
      name={plural}
      under={<DutyBar tally={count > 0 ? tally : null} />}
      value={<Headcount count={count} wanted={staff.recommended[role]} />}
      note={`${formatNumber(count * WAGES[role])}/day`}
      stepper={{
        label: `Staffing of the ${plural}`,
        less: {
          label: `Let one of the ${plural} go`,
          disabled: count <= 0,
          onClick: () => onHire(role, count - 1),
        },
        more: {
          label: `Hire one more of the ${plural}`,
          disabled: count >= STAFF_CAPS[role],
          onClick: () => onHire(role, count + 1),
        },
        preset: {
          text: 'Auto',
          label: `Hire ${plural} automatically`,
          pressed: auto,
          onClick: () => onHire(role, auto ? count : null),
        },
      }}
    />
  );
}

function StaffHelp() {
  return (
    <HelpTip label="How staff work">
      <p>
        Each role shows who is on the payroll, and after the slash how many the plot needs when that
        differs. Short-handed is red.
      </p>
      <p>
        The bar under a role is what those on duty did this hour:{' '}
        <span className="hud-staff-key" data-share="working">
          working
        </span>
        ,{' '}
        <span className="hud-staff-key" data-share="walking">
          walking
        </span>{' '}
        to a job, or{' '}
        <span className="hud-staff-key" data-share="idle">
          idle
        </span>
        . Plenty idle means you can let some go.
      </p>
      <p>
        Auto hires and lets go to match what the plot needs; a step by hand switches it off. Wages
        are paid each day, per head.
      </p>
    </HelpTip>
  );
}

export function StaffPanel({ staff, tally, onHire }: StaffPanelProps) {
  if (!staff) return <p className="ui-loading">Meshing the catalogue…</p>;

  return (
    <>
      <div className="hud-settings">
        <PanelSummary
          figures={[
            {
              label: 'Staff',
              value: formatNumber(STAFF_ROLES.reduce((sum, role) => sum + staff.roster[role], 0)),
            },
            { label: 'Wages', value: `${formatNumber(wagesFor(staff.roster))}/day` },
          ]}
          help={<StaffHelp />}
        />
        <SettingGroup>
          {STAFF_ROLES.map((role) => (
            <StaffRow
              key={role}
              role={role}
              staff={staff}
              tally={tally?.[role] ?? null}
              onHire={onHire}
            />
          ))}
        </SettingGroup>
      </div>
      <h3 className="hud-report-heading">Zone crews</h3>
      <dl className="hud-zone-staff">
        {ZONE_IDS.map((zone) => (
          <div key={zone} className="hud-zone-staff-row">
            <dt style={{ color: cssColour(ZONE_COLOURS[zone]!) }}>{zoneLabel(zone)}</dt>
            <dd>{crewLine(staff.zones[zone]!)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
