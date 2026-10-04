import { eventNewsLine } from '../../events/components/eventWords';
import {
  toastKey,
  type EventNews,
  type News,
  type Toast,
  type UpdateAction,
  type UpdatePhase,
} from '../domain/news';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { isStaffRole, type StaffRole } from '../../sim/domain/staff';
import { adviceLabel, newsSays } from './adviceWords';
import { daySummary, trendOn } from './dayWords';
import { PixelIcon } from './PixelIcon';

interface NewsToastsProps {
  readonly history: readonly DayReport[];
  readonly mode: GameMode | null;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onHire: (role: StaffRole) => void;
  readonly onOpenAdvice: () => void;
  readonly onOpenReport: (day: number) => void;
  readonly onDismiss: (key: string) => void;
}

export interface ToastsProps {
  readonly toasts: readonly Toast[];
  readonly onUpdate: (action: UpdateAction) => void;
  // Null on the welcome screen, which has no resort to tell of and offers only a new version.
  readonly news: NewsToastsProps | null;
}

type ToastActionsProps = Pick<NewsToastsProps, 'onShowOnPlot' | 'onHire' | 'onOpenAdvice'>;

function ToastActions({ news, ...props }: { readonly news: News } & ToastActionsProps) {
  const { advice } = news;
  const { at } = advice;
  const role = advice.subject;
  return (
    <div className="hud-toast-actions">
      {at ? (
        <button
          type="button"
          className="hud-camera-mode hud-advice-show"
          aria-label={`Show ${advice.subject} at tile ${at.tileX}, ${at.tileZ}`}
          onClick={() => props.onShowOnPlot(at)}
        >
          Show
        </button>
      ) : null}
      {advice.kind === 'short-staffed' && isStaffRole(role) ? (
        <button
          type="button"
          className="hud-camera-mode hud-advice-show"
          onClick={() => props.onHire(role)}
        >
          Hire
        </button>
      ) : null}
      <button
        type="button"
        className="hud-camera-mode hud-advice-show"
        onClick={props.onOpenAdvice}
      >
        Advice
      </button>
    </div>
  );
}

function DismissButton({
  label,
  onDismiss,
}: {
  readonly label: string;
  readonly onDismiss: () => void;
}) {
  return (
    <button
      type="button"
      className="hud-window-close"
      aria-label={`Dismiss ${label}`}
      title="Dismiss"
      onClick={onDismiss}
    >
      <PixelIcon name="close" scale={1} />
    </button>
  );
}

function DayPlate({ report, ...props }: { readonly report: DayReport } & NewsToastsProps) {
  const label = `Day ${report.day} report`;
  return (
    <div className="hud-toast" data-severity="day" role="status">
      <PixelIcon name="overview" />
      <div className="hud-toast-body">
        <strong>Day report</strong>
        <p>{daySummary(report, trendOn(props.history, report.day), props.mode)}</p>
        <div className="hud-toast-actions">
          <button
            type="button"
            className="hud-camera-mode hud-advice-show"
            onClick={() => props.onOpenReport(report.day)}
          >
            Summary
          </button>
        </div>
      </div>
      <DismissButton
        label={label}
        onDismiss={() => props.onDismiss(toastKey({ kind: 'day', report }))}
      />
    </div>
  );
}

function ToastPlate({
  news,
  onDismiss,
  ...props
}: { readonly news: News } & Pick<NewsToastsProps, 'onDismiss'> & ToastActionsProps) {
  const urgent = news.severity === 'urgent';
  const label = adviceLabel(news.advice.kind);
  return (
    <div className="hud-toast" data-severity={news.severity} role={urgent ? 'alert' : 'status'}>
      <PixelIcon name={urgent ? 'alert' : 'advice'} />
      <div className="hud-toast-body">
        <strong>{label}</strong>
        <p>{newsSays(news)}</p>
        <ToastActions news={news} {...props} />
      </div>
      <DismissButton label={label} onDismiss={() => onDismiss(news.key)} />
    </div>
  );
}

function EventPlate({
  news,
  onDismiss,
  onShowOnPlot,
}: { readonly news: EventNews } & Pick<NewsToastsProps, 'onDismiss' | 'onShowOnPlot'>) {
  const { at } = news;
  return (
    <div className="hud-toast" data-severity="event" role="status">
      <PixelIcon name="programme" />
      <div className="hud-toast-body">
        <strong>Programme</strong>
        <p>{eventNewsLine(news)}</p>
        {at ? (
          <div className="hud-toast-actions">
            <button
              type="button"
              className="hud-camera-mode hud-advice-show"
              aria-label={`Show ${news.venue ?? news.label} at tile ${at.tileX}, ${at.tileZ}`}
              onClick={() => onShowOnPlot(at)}
            >
              Show
            </button>
          </div>
        ) : null}
      </div>
      <DismissButton label="Programme" onDismiss={() => onDismiss(news.key)} />
    </div>
  );
}

const UPDATE_WORDS: {
  readonly [phase in UpdatePhase]: {
    readonly line: string;
    readonly actions: readonly (readonly [string, UpdateAction])[];
  };
} = {
  ready: {
    line: 'A new version of Vox Resort is ready.',
    actions: [
      ['Reload', 'reload'],
      ['Later', 'later'],
    ],
  },
  saving: {
    line: 'Saving your game…',
    actions: [
      ['Reload', 'reload'],
      ['Later', 'later'],
    ],
  },
  unsaved: {
    line: 'Your game could not be saved. Reload anyway, and lose what changed since the last save?',
    actions: [
      ['Reload anyway', 'reload-anyway'],
      ['Later', 'later'],
    ],
  },
};

// No dismiss cross: Later is the dismissal, and it is the one choice that keeps this version.
function UpdatePlate({
  phase,
  onUpdate,
}: {
  readonly phase: UpdatePhase;
  readonly onUpdate: (action: UpdateAction) => void;
}) {
  const { line, actions } = UPDATE_WORDS[phase];
  return (
    <div
      className="hud-toast"
      data-severity="warning"
      role={phase === 'unsaved' ? 'alert' : 'status'}
    >
      <PixelIcon name="refresh" />
      <div className="hud-toast-body">
        <strong>New version</strong>
        <p>{line}</p>
        <div className="hud-toast-actions">
          {actions.map(([label, action]) => (
            <button
              key={action}
              type="button"
              className="hud-camera-mode hud-advice-show"
              disabled={phase === 'saving'}
              onClick={() => onUpdate(action)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewsToast({
  toast,
  ...props
}: { readonly toast: Exclude<Toast, { readonly kind: 'update' }> } & NewsToastsProps) {
  if (toast.kind === 'day') return <DayPlate report={toast.report} {...props} />;
  if (toast.kind === 'event') return <EventPlate news={toast.news} {...props} />;
  return <ToastPlate news={toast.news} {...props} />;
}

function ToastOf({ toast, ...props }: { readonly toast: Toast } & ToastsProps) {
  if (toast.kind === 'update') return <UpdatePlate phase={toast.phase} onUpdate={props.onUpdate} />;
  return props.news ? <NewsToast toast={toast} {...props.news} /> : null;
}

// Never pauses and never sounds: the corner is for the eye, the log keeps what scrolled past.
export function Toasts(props: ToastsProps) {
  if (props.toasts.length === 0) return null;
  return (
    <div className="hud-toasts">
      {props.toasts.map((toast) => (
        <ToastOf key={toastKey(toast)} toast={toast} {...props} />
      ))}
    </div>
  );
}
