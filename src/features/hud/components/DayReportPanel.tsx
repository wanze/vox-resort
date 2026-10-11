import { tallyWords, welcomeWords } from '../../events/components/eventWords';
import type { DayReport } from '../../sim/domain/dayReport';
import { netOf, REASONS, type Column, type GameMode } from '../../sim/domain/ledger';
import { trendOn, trendWords } from './dayWords';
import { RemarkList } from './GuestsPanel';
import { REASON_LABELS, signed, toneOf } from './ledgerWords';
import { PanelSummary, type SummaryFigure } from './PanelSummary';
import { RatingBreakdown } from './RatingControl';
import { Row, Rows, Section } from './ReportRows';
import { Sparkline } from './Sparkline';
import { OutOf } from '../../../shared/components/OutOf';
import { shownDay } from '../../../shared/domain/dayNumber';

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
          ? `Day ${shownDay(history[at]!.day)}`
          : `${resortName} · Day ${shownDay(history[at]!.day)}`}
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

// The day at a glance, as the toast told it: the sections below take each figure apart.
function DaySummary({
  report,
  trend,
  mode,
}: {
  readonly report: DayReport;
  readonly trend: number | null;
  readonly mode: GameMode | null;
}) {
  const net = netOf(report.money);
  const figures: SummaryFigure[] = [
    { label: 'Rating', value: starsOf(report.rating.stars), aside: trendWords(trend) },
    { label: 'Guests', value: whole(report.present) },
  ];
  if (mode === 'tycoon') figures.push({ label: 'Net', value: signed(net), tone: toneOf(net) });
  return <PanelSummary figures={figures} />;
}

function RatingSection({ report }: { readonly report: DayReport }) {
  return (
    <Section title="Rating">
      <RatingBreakdown rating={report.rating} />
    </Section>
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
      <Rows>
        <Row label="Arrived">
          <dd>{whole(report.arrived)}</dd>
        </Row>
        {report.turnedAway ? (
          <Row label="Turned away">
            <dd>{whole(report.turnedAway)}</dd>
          </Row>
        ) : null}
        <WelcomedRow report={report} />
        <Row label="Checked out">
          <dd>{whole(report.left)}</dd>
        </Row>
        <Row label="Beds">
          <dd>
            <OutOf value={report.beds.taken} total={report.beds.total} />
          </dd>
        </Row>
        <ReviewRows reviews={report.reviews} meanReview={report.meanReview} />
      </Rows>
    </Section>
  );
}

// Shared with the season report, which sums the same figures over its days.
export function ReviewRows({
  reviews,
  meanReview,
}: {
  readonly reviews: number;
  readonly meanReview: number | null;
}) {
  return (
    <>
      <Row label="Reviews">
        <dd>{whole(reviews)}</dd>
      </Row>
      {meanReview === null ? null : (
        <Row label="Mean review">
          <dd>{starsOf(meanReview)}</dd>
        </Row>
      )}
    </>
  );
}

export function MoneyRows({
  money,
  balance,
}: {
  readonly money: Column;
  readonly balance: number;
}) {
  return (
    <>
      {REASONS.map((reason) => (
        <Row key={reason} label={REASON_LABELS[reason]}>
          <dd>{signed(money[reason])}</dd>
        </Row>
      ))}
      <Row label="Net" total>
        <dd>{signed(netOf(money))}</dd>
      </Row>
      <Row label="Balance">
        <dd>{whole(balance)}</dd>
      </Row>
    </>
  );
}

function MoneySection({ report }: { readonly report: DayReport }) {
  return (
    <Section title="Money">
      <Rows>
        <MoneyRows money={report.money} balance={report.balance} />
      </Rows>
    </Section>
  );
}

function EventsSection({ report }: { readonly report: DayReport }) {
  const words = tallyWords(report.events);
  if (words === null) return null;
  return (
    <Section title="Programme">
      <Rows>
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
      <Rows>
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
        <RemarkList loudest={report.loudest} />
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
        <span>{format(values.at(-1)!)}</span>
      </dd>
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
      <Rows>
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
    <div className="hud-report">
      <Stepper history={history} at={at} onShow={onShow} resortName={resortName} />
      <DaySummary report={report} trend={trendOn(history, report.day)} mode={mode} />
      <RatingSection report={report} />
      <GuestsSection report={report} />
      {mode === 'tycoon' ? <MoneySection report={report} /> : null}
      <EventsSection report={report} />
      <PhotosSection report={report} />
      <SaidSection report={report} />
      <TrendSection history={history} mode={mode} />
    </div>
  );
}
