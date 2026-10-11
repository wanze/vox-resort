import { OutOf } from '../../../shared/components/OutOf';
import { Actions } from '../../../shared/components/Actions';
import { Meter } from '../../../shared/components/Meter';
import { percentOf } from '../../../shared/components/StatRow';
import type { ShowcaseStats, StatusView } from '../domain/views';
import { Row, Rows } from './ReportRows';

export interface ResortStatsProps {
  readonly stats: ShowcaseStats | null;
  // Pushed hourly, where stats come only on an edit: the rating and the guests would sit frozen.
  readonly status: StatusView | null;
  readonly onOpenReport: () => void;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

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
    <div className="hud-report">
      <Rows>
        <Row label="Rating">
          <dd>{`${stars.toFixed(1)} ★`}</dd>
        </Row>
        <Row label="Guests">
          <dd>
            <OutOf value={present} total={stats.guests.capacity} />
          </dd>
        </Row>
        <Row label="Beds">
          <dd>
            {unmade > 0 ? <Aside>{`${formatNumber(unmade)} unmade`}</Aside> : null}
            <OutOf value={stats.beds.taken} total={stats.beds.total} />
          </dd>
        </Row>
        <Row label="Asleep">
          <dd>
            <OutOf value={stats.asleep} total={stats.beds.taken} />
          </dd>
        </Row>
        <Row label="Staff at work">
          <dd>
            <OutOf value={stats.staff.working} total={stats.staff.total} />
          </dd>
        </Row>
        <Row label="Clean">
          <dd className="ui-stat-meter">
            <Meter level={stats.cleanliness} />
            <span>{percentOf(stats.cleanliness)}</span>
          </dd>
        </Row>
        <Row label="In venues">
          <dd>
            <Aside>{`${formatNumber(stats.venues.waiting)} queueing`}</Aside>
            {formatNumber(stats.venues.inside)}
          </dd>
        </Row>
      </Rows>
      <Actions>
        <button type="button" className="ui-button" onClick={onOpenReport}>
          Day report
        </button>
      </Actions>
    </div>
  );
}
