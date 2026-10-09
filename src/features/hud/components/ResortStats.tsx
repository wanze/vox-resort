import { StatRow } from '../../../shared/components/StatRow';
import type { ShowcaseStats, StatusView } from '../domain/views';

export interface ResortStatsProps {
  readonly stats: ShowcaseStats | null;
  // Pushed hourly, where stats come only on an edit: the rating and the guests would sit frozen.
  readonly status: StatusView | null;
  readonly onOpenReport: () => void;
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

function liveFigures(stats: ShowcaseStats, status: StatusView | null) {
  if (status === null) return { stars: stats.rating, present: stats.guests.present };
  return { stars: status.rating.stars, present: status.present };
}

export function ResortStats({ stats, status, onOpenReport }: ResortStatsProps) {
  if (!stats) return <p className="ui-loading">Meshing the catalogue…</p>;
  const { unmade } = stats.beds;
  const { stars, present } = liveFigures(stats, status);

  return (
    <div className="ui-stack">
      <dl className="ui-stats hud-figures hud-overview">
        <StatRow label="Rating">{`${stars.toFixed(1)} ★`}</StatRow>
        <StatRow label="Guests">
          <OutOf value={present} of={stats.guests.capacity} />
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
      <div className="ui-actions">
        <button type="button" className="ui-button-large" onClick={onOpenReport}>
          Day report
        </button>
      </div>
    </div>
  );
}
