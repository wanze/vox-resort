import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';
import { STAFF_ROLES, type Roster } from '../../sim/domain/staff';
import { roleWord } from './staffWords';

export interface ResortStatsProps {
  readonly stats: ShowcaseStats | null;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const rosterLine = (roster: Roster): string =>
  STAFF_ROLES.map((role) => `${formatNumber(roster[role])} ${roleWord(role, roster[role])}`).join(
    ' · ',
  );

const bedsNote = (unmade: number): string =>
  unmade > 0
    ? `taken by guests, of all the plot sleeps; ${formatNumber(unmade)} waiting to be made up`
    : 'taken by guests, of all the plot sleeps';

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
      <StatRow label="Beds" note={bedsNote(stats.beds.unmade)}>
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
