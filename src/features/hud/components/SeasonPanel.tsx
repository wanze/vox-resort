import type { CSSProperties } from 'react';
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
import { MoneyRows, ReviewRows, Row, Rows, Section } from './DayReportPanel';
import { signed } from './ledgerWords';
import {
  bookingsLine,
  MIX_LABELS,
  nextLine,
  PHASE_GUESTS,
  seasonLine,
  shareWords,
} from './seasonWords';

export interface SeasonPanelProps {
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
  // Oldest first, as the day reports are kept.
  readonly seasons: readonly SeasonReport[];
  // null before the first books are told.
  readonly mode: GameMode | null;
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
      <Rows layout="figures">
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
      <Rows layout="figures">
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
      <Rows layout="figures">
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
      <Rows layout="figures">
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

function Running({ season }: { readonly season: SeasonView }) {
  const effect = phaseEffect(season.phase);
  const next = nextLine(season.day);
  return (
    <Section title={`Season ${season.number}`}>
      <div className="hud-season-now">
        <p>{seasonLine(season)}</p>
        <DayTrack day={season.day} />
        <p>{PHASE_GUESTS[season.phase]}</p>
        <Rows layout="figures">
          <Row label="Bookings">
            <dd>{bookingsLine(effect.demand)}</dd>
          </Row>
          {MIX_KINDS.map((kind) => (
            <Row key={kind} label={MIX_LABELS[kind]}>
              <dd>{shareWords(effect.mix[kind])}</dd>
            </Row>
          ))}
        </Rows>
        {next ? <p className="ui-loading">{next}</p> : null}
      </div>
    </Section>
  );
}

function Between({ season }: { readonly season: SeasonView }) {
  const next = season.number + 1;
  return (
    <Section title={`Before season ${next}`}>
      <div className="hud-season-now">
        <p>
          {`The clock is stopped: build and renovate in peace. Open season ${next} in the top bar starts it at the next check-in, with the early season's guests.`}
        </p>
      </div>
    </Section>
  );
}

function ThisSeason({ season }: { readonly season: SeasonView | null }) {
  if (season === null) return <p className="ui-loading">This resort runs no seasons.</p>;
  return season.state === 'break' ? <Between season={season} /> : <Running season={season} />;
}

// A season counted from part way through, as a save from before seasons is, says so.
function LastSeason({ seasons, season, mode }: SeasonPanelProps) {
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
      <h3 className="hud-report-heading">{`Season ${report.number} report · ${days}`}</h3>
      {report.days < SEASON_DAYS ? (
        <p className="ui-loading">
          {`Covers ${whole(report.days)} of its ${SEASON_DAYS} days: the rest were played before seasons.`}
        </p>
      ) : null}
      <RatingSection report={report} />
      <GuestsSection report={report} />
      <MoneySection report={report} mode={mode} />
      <EarlierSection seasons={seasons.slice(0, -1)} mode={mode} />
    </>
  );
}

export function SeasonPanel(props: SeasonPanelProps) {
  return (
    <div className="ui-stack hud-report">
      <ThisSeason season={props.season} />
      <LastSeason {...props} />
    </div>
  );
}
