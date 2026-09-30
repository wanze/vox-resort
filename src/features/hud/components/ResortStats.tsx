import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';

export interface ResortStatsProps {
  readonly stats: ShowcaseStats | null;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

function OutOf({ value, of }: { readonly value: number; readonly of: number }) {
  return (
    <>
      {formatNumber(value)}
      <span className="hud-figure-of"> / {formatNumber(of)}</span>
    </>
  );
}

function Aside({ children }: { readonly children: string }) {
  return <span className="hud-figure-aside">{children}</span>;
}

export function ResortStats({ stats }: ResortStatsProps) {
  if (!stats) return <p className="hud-loading">Meshing the catalogue…</p>;
  const { unmade } = stats.beds;

  return (
    <dl className="hud-stats hud-figures hud-overview">
      <StatRow label="Rating">{`${stats.rating.toFixed(1)} ★`}</StatRow>
      <StatRow label="Guests">
        <OutOf value={stats.guests.present} of={stats.guests.capacity} />
      </StatRow>
      <StatRow label="Beds">
        <OutOf value={stats.beds.taken} of={stats.beds.total} />
        {unmade > 0 ? <Aside>{`${formatNumber(unmade)} unmade`}</Aside> : null}
      </StatRow>
      <StatRow label="Asleep">
        <OutOf value={stats.asleep} of={stats.beds.taken} />
      </StatRow>
      <StatRow label="Staff">
        <OutOf value={stats.staff.working} of={stats.staff.total} />
      </StatRow>
      <StatRow label="Clean">{`${Math.round(stats.cleanliness * 100)}%`}</StatRow>
      <StatRow label="Venues">
        {formatNumber(stats.venues.inside)}
        <Aside>{`${formatNumber(stats.venues.waiting)} queueing`}</Aside>
      </StatRow>
    </dl>
  );
}
