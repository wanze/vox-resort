import type { CSSProperties } from 'react';
import { HelpTip } from '../../../shared/components/HelpTip';
import { OutOf } from '../../../shared/components/OutOf';
import { StatRow } from '../../../shared/components/StatRow';
import { shownDay } from '../../../shared/domain/dayNumber';
import type { GameMode } from '../../sim/domain/ledger';
import {
  lastNightOf,
  PHASE_WORDS,
  phaseEffect,
  phaseOfSeasonDay,
  SEASON_DAYS,
  type DayMark,
  type SeasonPhase,
  type SeasonReport,
  type SeasonView,
} from '../../sim/domain/season';
import { PaperArchive } from '../../newspaper/components/PaperArchive';
import type { PaperControls } from '../../newspaper/components/paperControls';
import { MoneyRows, ReviewRows } from './DayReportPanel';
import { PanelSummary } from './PanelSummary';
import { Row, Rows, Section } from './ReportRows';
import { signed } from './ledgerWords';
import {
  bookingsLine,
  MIX_LABELS,
  nextLine,
  PHASE_GUESTS,
  shareWords,
} from '../domain/seasonWords';

export interface SeasonPanelProps {
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
  // Oldest first, as the day reports are kept.
  readonly seasons: readonly SeasonReport[];
  // null before the first books are told.
  readonly mode: GameMode | null;
  readonly paper: PaperControls;
}

const whole = (value: number): string => value.toLocaleString('en-US');

const starsOf = (value: number | null): string => (value === null ? '–' : `${value.toFixed(1)} ★`);

function MarkRow({
  label,
  mark,
  words,
}: {
  readonly label: string;
  readonly mark: DayMark | null;
  readonly words: (value: number) => string;
}) {
  if (mark === null) return null;
  return (
    <Row label={label}>
      <dd>{`Day ${shownDay(mark.day)} · ${words(mark.value)}`}</dd>
    </Row>
  );
}

function RatingSection({ report }: { readonly report: SeasonReport }) {
  return (
    <Section title="Rating">
      <Rows>
        <Row label="Mean">
          <dd>{starsOf(report.meanStars)}</dd>
        </Row>
        <Row label="Best day">
          <dd>{starsOf(report.bestStars)}</dd>
        </Row>
        <Row label="Worst day">
          <dd>{starsOf(report.worstStars)}</dd>
        </Row>
      </Rows>
    </Section>
  );
}

function GuestsSection({ report }: { readonly report: SeasonReport }) {
  return (
    <Section title="Guests">
      <Rows>
        <Row label="Arrived">
          <dd>{whole(report.arrived)}</dd>
        </Row>
        <Row label="Turned away">
          <dd>{whole(report.turnedAway)}</dd>
        </Row>
        <Row label="Checked out">
          <dd>{whole(report.left)}</dd>
        </Row>
        <ReviewRows reviews={report.reviews} meanReview={report.meanReview} />
        <MarkRow
          label="Busiest day"
          mark={report.busiest}
          words={(value) => `${whole(value)} guests`}
        />
      </Rows>
    </Section>
  );
}

function MoneySection({
  report,
  mode,
}: {
  readonly report: SeasonReport;
  readonly mode: GameMode | null;
}) {
  if (mode !== 'tycoon') return null;
  return (
    <Section title="Money">
      <Rows>
        <MoneyRows money={report.money} balance={report.balance} />
        <MarkRow label="Best day" mark={report.best} words={signed} />
      </Rows>
    </Section>
  );
}

const meanAndNet = (report: SeasonReport, mode: GameMode | null): string =>
  mode === 'tycoon'
    ? `${starsOf(report.meanStars)} · ${signed(report.net)}`
    : starsOf(report.meanStars);

function EarlierSection({
  seasons,
  mode,
}: {
  readonly seasons: readonly SeasonReport[];
  readonly mode: GameMode | null;
}) {
  if (seasons.length === 0) return null;
  return (
    <Section title="Earlier seasons">
      <Rows>
        {seasons.toReversed().map((report) => (
          <Row key={report.number} label={`Season ${report.number}`}>
            <dd>{meanAndNet(report, mode)}</dd>
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

const MIX_KINDS = Object.keys(MIX_LABELS) as (keyof typeof MIX_LABELS)[];

const SEASON_DAY_NUMBERS = Array.from({ length: SEASON_DAYS }, (_, at) => at + 1);

const PHASES_IN_SEASON: readonly { readonly phase: SeasonPhase; readonly days: number }[] = (
  ['early', 'holidays', 'late'] as const
).map((phase) => ({
  phase,
  days: SEASON_DAY_NUMBERS.filter((day) => phaseOfSeasonDay(day) === phase).length,
}));

// Read out by the line above it, so the track itself is only for the eye.
function DayTrack({ day }: { readonly day: number }) {
  return (
    <div className="hud-season-track" aria-hidden="true">
      <ol className="hud-season-days">
        {SEASON_DAY_NUMBERS.map((each) => (
          <li
            key={each}
            data-phase={phaseOfSeasonDay(each)}
            data-past={each < day || undefined}
            data-today={each === day || undefined}
          />
        ))}
      </ol>
      <div className="hud-season-legend">
        {PHASES_IN_SEASON.map(({ phase, days }) => (
          <span key={phase} data-phase={phase} style={{ '--days': days } as CSSProperties}>
            {PHASE_WORDS[phase]}
          </span>
        ))}
      </div>
    </div>
  );
}

function PhaseHelp({ season }: { readonly season: SeasonView }) {
  const effect = phaseEffect(season.phase);
  const next = nextLine(season.day);
  return (
    <HelpTip label={`About the ${PHASE_WORDS[season.phase].toLowerCase()}`}>
      <p>{PHASE_GUESTS[season.phase]}</p>
      <dl className="ui-stats">
        <StatRow label="Bookings">{bookingsLine(effect.demand)}</StatRow>
        {MIX_KINDS.map((kind) => (
          <StatRow key={kind} label={MIX_LABELS[kind]}>
            {shareWords(effect.mix[kind])}
          </StatRow>
        ))}
      </dl>
      {next ? <p>{next}</p> : null}
    </HelpTip>
  );
}

// Before its first check-in a season has no day yet, and the closing day is past the track.
function dayFigure(season: SeasonView) {
  if (season.day < 1) return 'from tomorrow';
  if (season.phase === 'closing') return 'closing';
  return <OutOf value={season.day} total={SEASON_DAYS} />;
}

function Running({ season }: { readonly season: SeasonView }) {
  return (
    <Section title={`Season ${season.number}`}>
      <PanelSummary
        figures={[
          { label: 'Day', value: dayFigure(season) },
          { label: 'Now', value: PHASE_WORDS[season.phase] },
        ]}
        help={<PhaseHelp season={season} />}
      />
      <DayTrack day={season.day} />
    </Section>
  );
}

function Between({ season }: { readonly season: SeasonView }) {
  const next = season.number + 1;
  return (
    <Section title={`Before season ${next}`}>
      <PanelSummary
        figures={[{ label: 'Clock', value: 'stopped' }]}
        help={
          <HelpTip label="Between seasons">
            <p>The clock is stopped: build and renovate in peace.</p>
            <p>
              {`Open season ${next} in the top bar to start it at the next check-in, with the early season's guests.`}
            </p>
          </HelpTip>
        }
      />
    </Section>
  );
}

function ThisSeason({ season }: { readonly season: SeasonView | null }) {
  if (season === null) return <p className="ui-loading">This resort runs no seasons.</p>;
  return season.state === 'break' ? <Between season={season} /> : <Running season={season} />;
}

// Only seasons closed since the paper began have one; the rows below cover the rest.
function PaperSection({ paper }: { readonly paper: PaperControls }) {
  if (paper.editions.length === 0) return null;
  return (
    <Section title="The season paper">
      <PaperArchive editions={paper.editions} current={null} onRead={paper.read} />
    </Section>
  );
}

// A season counted from part way through, as a save from before seasons is, says so.
function LastSeason({ seasons, season, mode, paper }: SeasonPanelProps) {
  const report = seasons.at(-1);
  if (!report) {
    if (season === null) return null;
    return (
      <p className="ui-loading">{`The first season report comes on day ${shownDay(season.closesOn)}.`}</p>
    );
  }
  const days = `Days ${shownDay(report.startedOn)}–${shownDay(lastNightOf(report))}`;
  return (
    <>
      <h3 className="hud-report-title">{`Season ${report.number} report · ${days}`}</h3>
      {report.days < SEASON_DAYS ? (
        <p className="ui-note">
          {`Covers ${whole(report.days)} of its ${SEASON_DAYS} days: the rest were played before seasons.`}
        </p>
      ) : null}
      <PaperSection paper={paper} />
      <RatingSection report={report} />
      <GuestsSection report={report} />
      <MoneySection report={report} mode={mode} />
      <EarlierSection seasons={seasons.slice(0, -1)} mode={mode} />
    </>
  );
}

export function SeasonPanel(props: SeasonPanelProps) {
  return (
    <div className="hud-report">
      <ThisSeason season={props.season} />
      <LastSeason {...props} />
    </div>
  );
}
