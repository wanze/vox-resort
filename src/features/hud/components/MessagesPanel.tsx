import type { ReactNode } from 'react';
import { HelpTip } from '../../../shared/components/HelpTip';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { IconName } from '../../../shared/components/pixelIcons';
import { eventNewsLine } from '../../events/components/eventWords';
import type { HudPrefs } from '../domain/hudPrefs';
import { toastKey, type EventNews, type Message, type News, type ToastKind } from '../domain/news';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { stampOf, TICKS_PER_DAY } from '../../sim/domain/simClock';
import { adviceIcon, newsSays } from './adviceWords';
import { daySummary, trendOn } from './dayWords';
import { PanelSummary } from './PanelSummary';

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
  { kind: 'event', label: 'Events', title: 'Toast the events announced and called off' },
];

const whenOf = (ticks: number): string => {
  const { day, hour } = stampOf(ticks);
  return `day ${day}, ${String(hour).padStart(2, '0')}:00`;
};

// A report is labelled with the day its period started on, and closed at the next check-in.
const closedAt = (report: DayReport): number => (report.day + 1) * TICKS_PER_DAY + CHECK_IN_TICK;

// Coloured as its toast was, so a message reads the same in the log as when it popped up.
function Line({
  icon,
  tone,
  when,
  says,
  action,
}: {
  readonly icon: IconName;
  readonly tone: ToastKind;
  readonly when: number;
  readonly says: string;
  readonly action: ReactNode;
}) {
  return (
    <li className="hud-problem" data-severity={tone}>
      <span className="hud-problem-icon">
        <PixelIcon name={icon} />
      </span>
      <span className="hud-problem-body">
        <span>
          {says} <span className="hud-message-when">{whenOf(when)}</span>
        </span>
      </span>
      {action ? <span className="hud-problem-actions">{action}</span> : null}
    </li>
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
    <button type="button" className="ui-button hud-advice-show" aria-label={name} onClick={onClick}>
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
      icon={adviceIcon(news.advice.kind)}
      tone={news.severity}
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

function EventLine({
  news,
  onShowOnPlot,
}: {
  readonly news: EventNews;
  readonly onShowOnPlot: MessagesPanelProps['onShowOnPlot'];
}) {
  const { at } = news;
  return (
    <Line
      icon="programme"
      tone="event"
      when={news.start}
      says={eventNewsLine(news)}
      action={
        at ? (
          <ActionButton
            label="Show"
            name={`Show ${news.venue ?? news.label} at tile ${at.tileX}, ${at.tileZ}`}
            onClick={() => onShowOnPlot(at)}
          />
        ) : null
      }
    />
  );
}

function MessageLine({ message, ...props }: { readonly message: Message } & MessagesPanelProps) {
  if (message.kind === 'day') return <DayLine report={message.report} {...props} />;
  if (message.kind === 'event') {
    return <EventLine news={message.news} onShowOnPlot={props.onShowOnPlot} />;
  }
  return <NewsLine news={message.news} onShowOnPlot={props.onShowOnPlot} />;
}

const messageKey = (message: Message): string =>
  message.kind === 'advice' ? `${message.news.at}:${message.news.key}` : toastKey(message);

function DayLine({ report, ...props }: { readonly report: DayReport } & MessagesPanelProps) {
  return (
    <Line
      icon="report"
      tone="day"
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

function MessagesHelp() {
  return (
    <HelpTip label="How messages work">
      <p>Everything that happened, newest first.</p>
      <p>The buttons choose what pops up; the rest is still kept here.</p>
    </HelpTip>
  );
}

export function MessagesPanel(props: MessagesPanelProps) {
  const { log, prefs, onMutedChange } = props;
  return (
    <div className="ui-stack">
      <PanelSummary
        figures={[{ label: 'Messages', value: String(log.length) }]}
        help={<MessagesHelp />}
      />
      <div className="hud-message-toggles" role="group" aria-label="Toasts">
        {TOGGLES.map(({ kind, label, title }) => {
          const shown = !prefs.muted.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              className="ui-button"
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
        <p className="ui-loading">Nothing has happened yet.</p>
      ) : (
        <ul className="hud-problems">
          {log.map((message) => (
            <MessageLine key={messageKey(message)} message={message} {...props} />
          ))}
        </ul>
      )}
    </div>
  );
}
