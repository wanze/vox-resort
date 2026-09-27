import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';
import { STAFF_ROLES, type Roster, type StaffRole } from '../../sim/domain/staff';

export interface ResortStatsProps {
  readonly stats: ShowcaseStats | null;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const ROLE_NAMES: { readonly [role in StaffRole]: readonly [string, string] } = {
  cleaner: ['cleaner', 'cleaners'],
  lifeguard: ['lifeguard', 'lifeguards'],
  animator: ['animator', 'animators'],
};

const rosterLine = (roster: Roster): string =>
  STAFF_ROLES.map((role) => {
    const [one, many] = ROLE_NAMES[role];
    return `${formatNumber(roster[role])} ${roster[role] === 1 ? one : many}`;
  }).join(' · ');

export function ResortStats({ stats }: ResortStatsProps) {
  if (!stats) return <p className="hud-loading">Meshing the catalogue…</p>;

  return (
    <dl className="hud-stats hud-stats-stacked hud-figures">
      <StatRow label="Guests" note="on the plot now, of the bodies it was built for">
        {formatNumber(stats.guests.present)} / {formatNumber(stats.guests.capacity)}
      </StatRow>
      <StatRow label="Rating" note="out of five, from how happy they are and how many have a bed">
        {stats.rating.toFixed(1)}
      </StatRow>
      <StatRow label="Beds" note="taken by guests, of all the plot sleeps">
        {formatNumber(stats.beds.taken)} / {formatNumber(stats.beds.total)}
      </StatRow>
      <StatRow label="Asleep" note="in bed now, of the guests who have one">
        {formatNumber(stats.asleep)} / {formatNumber(stats.beds.taken)}
      </StatRow>
      <StatRow label="Staff" note={`working now, of ${rosterLine(stats.staff.roster)} on duty`}>
        {formatNumber(stats.staff.working)} / {formatNumber(stats.staff.total)}
      </StatRow>
      <StatRow label="Cleanliness" note="mean over the venues standing">
        {Math.round(stats.cleanliness * 100)}%
      </StatRow>
      <StatRow label="Venues" note="inside now, and queueing at a door">
        {formatNumber(stats.venues.inside)} / {formatNumber(stats.venues.waiting)}
      </StatRow>
    </dl>
  );
}
