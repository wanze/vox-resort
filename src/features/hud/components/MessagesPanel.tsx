import type { ReactNode } from 'react';
import type { HudPrefs } from '../domain/hudPrefs';
import { toastKey, type Message, type News, type ToastKind } from '../domain/news';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { stampOf, TICKS_PER_DAY } from '../../sim/domain/simClock';
import { adviceLabel, newsSays } from './adviceWords';
import { daySummary, trendOn } from './dayWords';

export interface MessagesPanelProps {
  readonly log: readonly Message[];
  readonly prefs: HudPrefs;
  readonly history: readonly DayReport[];
  readonly mode: GameMode | null;
  readonly onMutedChange: (kind: ToastKind, muted: boolean) => void;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onOpenReport: (day: number) => void;
}

// Short enough to sit side by side; the full sentence is the tooltip.
const TOGGLES: readonly {
  readonly kind: ToastKind;
  readonly label: string;
  readonly title: string;
}[] = [
  { kind: 'urgent', label: 'Urgent', title: 'Toast urgent problems' },
  { kind: 'warning', label: 'Warnings', title: 'Toast warnings' },
  { kind: 'day', label: 'Day reports', title: "Toast each day's summary" },
];

const whenOf = (ticks: number): string => {
  const { day, hour } = stampOf(ticks);
  return `day ${day}, ${String(hour).padStart(2, '0')}:00`;
};

// A report is labelled with the day its period started on, and closed at the next check-in.
const closedAt = (report: DayReport): number => (report.day + 1) * TICKS_PER_DAY + CHECK_IN_TICK;

function Line({
  label,
  when,
  says,
  action,
}: {
  readonly label: string;
  readonly when: number;
  readonly says: string;
  readonly action: ReactNode;
}) {
  return (
    <div className="hud-message">
      <dt>
        {label}
        <span className="hud-message-when">{whenOf(when)}</span>
      </dt>
      <dd>{says}</dd>
      <dd className="hud-message-action">{action}</dd>
    </div>
  );
}

function ActionButton({
  label,
  name,
  onClick,
}: {
  readonly label: string;
  readonly name?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hud-camera-mode hud-advice-show"
      aria-label={name}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function NewsLine({
  news,
  onShowOnPlot,
}: {
  readonly news: News;
  readonly onShowOnPlot: MessagesPanelProps['onShowOnPlot'];
}) {
  const { at } = news.advice;
  return (
    <Line
      label={adviceLabel(news.advice.kind)}
      when={news.at}
      says={newsSays(news)}
      action={
        at ? (
          <ActionButton
            label="Show"
            name={`Show ${news.advice.subject} at tile ${at.tileX}, ${at.tileZ}`}
            onClick={() => onShowOnPlot(at)}
          />
        ) : null
      }
    />
  );
}

function DayLine({ report, ...props }: { readonly report: DayReport } & MessagesPanelProps) {
  return (
    <Line
      label="Day report"
      when={closedAt(report)}
      says={daySummary(report, trendOn(props.history, report.day), props.mode)}
      action={
        props.history.some((kept) => kept.day === report.day) ? (
          <ActionButton label="Summary" onClick={() => props.onOpenReport(report.day)} />
        ) : null
      }
    />
  );
}

export function MessagesPanel(props: MessagesPanelProps) {
  const { log, prefs, onMutedChange, onShowOnPlot } = props;
  return (
    <div className="hud-messages">
      <div className="hud-message-toggles" role="group" aria-label="Toasts">
        {TOGGLES.map(({ kind, label, title }) => {
          const shown = !prefs.muted.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              className="hud-camera-mode"
              aria-pressed={shown}
              title={title}
              onClick={() => onMutedChange(kind, shown)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {log.length === 0 ? (
        <p className="hud-loading">Nothing has happened yet.</p>
      ) : (
        <dl className="hud-message-list">
          {log.map((message) =>
            message.kind === 'day' ? (
              <DayLine key={toastKey(message)} report={message.report} {...props} />
            ) : (
              <NewsLine
                key={`${message.news.at}:${message.news.key}`}
                news={message.news}
                onShowOnPlot={onShowOnPlot}
              />
            ),
          )}
        </dl>
      )}
    </div>
  );
}
