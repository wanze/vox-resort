import { toastKey, type News, type Toast } from '../domain/news';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { isStaffRole, type StaffRole } from '../../sim/domain/staff';
import { adviceLabel, newsSays } from './adviceWords';
import { daySummary, trendOn } from './dayWords';
import { PixelIcon } from './PixelIcon';

export interface ToastsProps {
  readonly toasts: readonly Toast[];
  readonly history: readonly DayReport[];
  readonly mode: GameMode | null;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onHire: (role: StaffRole) => void;
  readonly onOpenAdvice: () => void;
  readonly onOpenReport: (day: number) => void;
  readonly onDismiss: (key: string) => void;
}

type ToastActionsProps = Pick<ToastsProps, 'onShowOnPlot' | 'onHire' | 'onOpenAdvice'>;

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

function DayPlate({ report, ...props }: { readonly report: DayReport } & ToastsProps) {
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
}: { readonly news: News } & Pick<ToastsProps, 'onDismiss'> & ToastActionsProps) {
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

// Never pauses and never sounds: the corner is for the eye, the log keeps what scrolled past.
export function Toasts(props: ToastsProps) {
  if (props.toasts.length === 0) return null;
  return (
    <div className="hud-toasts">
      {props.toasts.map((toast) =>
        toast.kind === 'day' ? (
          <DayPlate key={toastKey(toast)} report={toast.report} {...props} />
        ) : (
          <ToastPlate key={toastKey(toast)} news={toast.news} {...props} />
        ),
      )}
    </div>
  );
}
