import type { HudPrefs } from '../domain/hudPrefs';
import type { News, Severity } from '../domain/news';
import { stampOf } from '../../sim/domain/simClock';
import { adviceLabel, newsSays } from './adviceWords';
import { StatRow } from './StatRow';

export interface MessagesPanelProps {
  readonly log: readonly News[];
  readonly prefs: HudPrefs;
  readonly onMutedChange: (severity: Severity, muted: boolean) => void;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
}

const TOGGLES: readonly { readonly severity: Severity; readonly label: string }[] = [
  { severity: 'urgent', label: 'Toast urgent problems' },
  { severity: 'warning', label: 'Toast warnings' },
];

const whenOf = (ticks: number): string => {
  const { day, hour } = stampOf(ticks);
  return `day ${day}, ${String(hour).padStart(2, '0')}:00`;
};

function MessageRow({
  news,
  onShowOnPlot,
}: {
  readonly news: News;
  readonly onShowOnPlot: MessagesPanelProps['onShowOnPlot'];
}) {
  const { at } = news.advice;
  return (
    <StatRow label={adviceLabel(news.advice.kind)} note={whenOf(news.at)}>
      {newsSays(news)}
      {at ? (
        <button
          type="button"
          className="hud-camera-mode hud-advice-show"
          aria-label={`Show ${news.advice.subject} at tile ${at.tileX}, ${at.tileZ}`}
          onClick={() => onShowOnPlot(at)}
        >
          Show
        </button>
      ) : null}
    </StatRow>
  );
}

export function MessagesPanel({ log, prefs, onMutedChange, onShowOnPlot }: MessagesPanelProps) {
  return (
    <div className="hud-messages">
      <div className="hud-camera-modes" role="group" aria-label="Toasts">
        {TOGGLES.map(({ severity, label }) => {
          const shown = !prefs.muted.includes(severity);
          return (
            <button
              key={severity}
              type="button"
              className="hud-camera-mode"
              aria-pressed={shown}
              onClick={() => onMutedChange(severity, shown)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {log.length === 0 ? (
        <p className="hud-loading">Nothing has happened yet.</p>
      ) : (
        <dl className="hud-stats hud-advice">
          {log.map((news) => (
            <MessageRow key={`${news.at}:${news.key}`} news={news} onShowOnPlot={onShowOnPlot} />
          ))}
        </dl>
      )}
    </div>
  );
}
