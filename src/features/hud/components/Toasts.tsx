import type { News, Toast } from '../domain/news';
import { isStaffRole, type StaffRole } from '../../sim/domain/staff';
import { adviceLabel, newsSays } from './adviceWords';
import { PixelIcon } from './PixelIcon';

export interface ToastsProps {
  readonly toasts: readonly Toast[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onHire: (role: StaffRole) => void;
  readonly onOpenAdvice: () => void;
  readonly onDismiss: (key: string) => void;
}

type ToastActionsProps = Omit<ToastsProps, 'toasts' | 'onDismiss'>;

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

function ToastPlate({
  news,
  onDismiss,
  ...props
}: { readonly news: News } & Omit<ToastsProps, 'toasts'>) {
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
      <button
        type="button"
        className="hud-window-close"
        aria-label={`Dismiss ${label}`}
        title="Dismiss"
        onClick={() => onDismiss(news.key)}
      >
        <PixelIcon name="close" scale={1} />
      </button>
    </div>
  );
}

// Never pauses and never sounds: the corner is for the eye, the log keeps what scrolled past.
export function Toasts({ toasts, ...props }: ToastsProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="hud-toasts">
      {toasts.map((toast) => (
        <ToastPlate key={toast.news.key} news={toast.news} {...props} />
      ))}
    </div>
  );
}
