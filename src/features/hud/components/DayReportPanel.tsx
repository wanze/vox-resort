import type { ReactNode } from 'react';
import { tallyWords, welcomeWords } from '../../events/components/eventWords';
import type { DayReport } from '../../sim/domain/dayReport';
import { netOf, REASONS, type GameMode } from '../../sim/domain/ledger';
import { trendOn, trendWords } from './dayWords';
import { REASON_LABELS, signed } from './ledgerWords';
import { RatingBreakdown } from './RatingControl';
import { Sparkline } from './Sparkline';
import { THOUGHT_LABELS, thoughtLine } from './thoughtWords';

export interface DayReportPanelProps {
  readonly history: readonly DayReport[];
  // null for the newest.
  readonly shown: number | null;
  readonly onShow: (day: number) => void;
  // null before the first books are told.
  readonly mode: GameMode | null;
  readonly resortName: string | null;
}

// The report keeps more for yesterday's photo wall; here only the top of the list.
const SPOTS_SHOWN = 3;

const whole = (value: number): string => value.toLocaleString('en-US');

const starsOf = (value: number): string => `${value.toFixed(1)} ★`;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section>
      <h3 className="hud-report-heading">{title}</h3>
      {children}
    </section>
  );
}

function Stepper({
  history,
  at,
  onShow,
  resortName,
}: {
  readonly history: readonly DayReport[];
  readonly at: number;
  readonly onShow: (day: number) => void;
  readonly resortName: string | null;
}) {
  const before = history[at - 1];
  const after = history[at + 1];
  return (
    <div className="hud-report-stepper">
      <button
        type="button"
        className="ui-button"
        aria-label="The day before"
        disabled={!before}
        onClick={() => before && onShow(before.day)}
      >
        ‹
      </button>
      <strong>
        {resortName === null
          ? `Day ${history[at]!.day}`
          : `${resortName} · Day ${history[at]!.day}`}
      </strong>
      <button
        type="button"
        className="ui-button"
        aria-label="The day after"
        disabled={!after}
        onClick={() => after && onShow(after.day)}
      >
        ›
      </button>
    </div>
  );
}

function RatingSection({
  report,
  trend,
}: {
  readonly report: DayReport;
  readonly trend: number | null;
}) {
  const change = trendWords(trend);
  return (
    <Section title="Rating">
      <p className="hud-report-stars">
        {starsOf(report.rating.stars)}
        {change ? <span className="hud-figure-aside">{`${change} on the day before`}</span> : null}
      </p>
      <RatingBreakdown rating={report.rating} />
    </Section>
  );
}

type Layout = 'figures' | 'said' | 'chart';

function Rows({ layout, children }: { readonly layout: Layout; readonly children: ReactNode }) {
  return (
    <dl className="hud-report-rows" data-layout={layout}>
      {children}
    </dl>
  );
}

function Row({
  label,
  total = false,
  children,
}: {
  readonly label: string;
  readonly total?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="hud-report-row" data-total={total || undefined}>
      <dt className="ui-label">{label}</dt>
      {children}
    </div>
  );
}

function WelcomedRow({ report }: { readonly report: DayReport }) {
  const words = welcomeWords(report);
  if (words === null) return null;
  return (
    <Row label="Welcomed">
      <dd>{words}</dd>
    </Row>
  );
}

function GuestsSection({ report }: { readonly report: DayReport }) {
  return (
    <Section title="Guests">
      <Rows layout="figures">
        <Row label="On the plot">
          <dd>{whole(report.present)}</dd>
        </Row>
        <Row label="Arrived">
          <dd>{whole(report.arrived)}</dd>
        </Row>
        <WelcomedRow report={report} />
        <Row label="Checked out">
          <dd>{whole(report.left)}</dd>
        </Row>
        <Row label="Beds">
          <dd>
            {whole(report.beds.taken)}
            <span className="hud-figure-of"> / {whole(report.beds.total)}</span>
          </dd>
        </Row>
        <Row label="Reviews">
          <dd>{whole(report.reviews)}</dd>
        </Row>
        {report.meanReview === null ? null : (
          <Row label="Mean review">
            <dd>{starsOf(report.meanReview)}</dd>
          </Row>
        )}
      </Rows>
    </Section>
  );
}

function MoneySection({ report }: { readonly report: DayReport }) {
  return (
    <Section title="Money">
      <Rows layout="figures">
        {REASONS.map((reason) => (
          <Row key={reason} label={REASON_LABELS[reason]}>
            <dd>{signed(report.money[reason])}</dd>
          </Row>
        ))}
        <Row label="Net" total>
          <dd>{signed(netOf(report.money))}</dd>
        </Row>
        <Row label="Balance">
          <dd>{whole(report.balance)}</dd>
        </Row>
      </Rows>
    </Section>
  );
}

function EventsSection({ report }: { readonly report: DayReport }) {
  const words = tallyWords(report.events);
  if (words === null) return null;
  return (
    <Section title="Programme">
      <Rows layout="figures">
        <Row label="Events">
          <dd>{words}</dd>
        </Row>
      </Rows>
    </Section>
  );
}

function PhotosSection({ report }: { readonly report: DayReport }) {
  if (!report.photos) return null;
  return (
    <Section title="Most photographed">
      <Rows layout="figures">
        {report.photos.spots.slice(0, SPOTS_SHOWN).map((spot) => (
          <Row key={spot.key} label={spot.subject}>
            <dd>{`${whole(spot.count)}×`}</dd>
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

function SaidSection({ report }: { readonly report: DayReport }) {
  return (
    <Section title="What guests said">
      {report.loudest.length === 0 ? (
        <p className="ui-loading">Nobody said anything.</p>
      ) : (
        <Rows layout="said">
          {report.loudest.map((tally) => (
            <Row key={`${tally.kind}|${tally.subject ?? ''}`} label={THOUGHT_LABELS[tally.kind]}>
              <dd className="hud-report-said">{thoughtLine(tally.kind, tally.subject)}</dd>
              <dd>{`${whole(tally.count)}×`}</dd>
            </Row>
          ))}
        </Rows>
      )}
    </Section>
  );
}

function ChartRow({
  label,
  values,
  format,
}: {
  readonly label: string;
  readonly values: readonly number[];
  readonly format: (value: number) => string;
}) {
  return (
    <Row label={label}>
      <dd className="hud-report-chart">
        <Sparkline label={label} values={values} format={format} />
      </dd>
      <dd>{format(values.at(-1)!)}</dd>
    </Row>
  );
}

// From the second report: one day is a point, not a line.
function TrendSection({
  history,
  mode,
}: {
  readonly history: readonly DayReport[];
  readonly mode: GameMode | null;
}) {
  if (history.length < 2) return null;
  return (
    <Section title={`Last ${history.length} days`}>
      <Rows layout="chart">
        <ChartRow
          label="Rating"
          values={history.map((report) => report.rating.stars)}
          format={starsOf}
        />
        <ChartRow label="Guests" values={history.map((report) => report.present)} format={whole} />
        {mode === 'tycoon' ? (
          <ChartRow
            label="Net"
            values={history.map((report) => netOf(report.money))}
            format={signed}
          />
        ) : null}
      </Rows>
    </Section>
  );
}

// A day no longer kept falls back to the newest, as does a history that has just been replaced.
const indexOf = (history: readonly DayReport[], shown: number | null): number => {
  const at = shown === null ? -1 : history.findIndex((report) => report.day === shown);
  return at < 0 ? history.length - 1 : at;
};

export function DayReportPanel({ history, shown, onShow, mode, resortName }: DayReportPanelProps) {
  if (history.length === 0) {
    return <p className="ui-loading">The first report comes at the next check-in.</p>;
  }
  const at = indexOf(history, shown);
  const report = history[at]!;
  return (
    <div className="ui-stack hud-report">
      <Stepper history={history} at={at} onShow={onShow} resortName={resortName} />
      <RatingSection report={report} trend={trendOn(history, report.day)} />
      <GuestsSection report={report} />
      {mode === 'tycoon' ? <MoneySection report={report} /> : null}
      <EventsSection report={report} />
      <PhotosSection report={report} />
      <SaidSection report={report} />
      <TrendSection history={history} mode={mode} />
    </div>
  );
}
