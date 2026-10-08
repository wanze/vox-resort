import { useEffect, useState, type FocusEvent } from 'react';
import { eventNewsLine } from '../../events/components/eventWords';
import {
  isUrgentToast,
  toastKey,
  type EventNews,
  type News,
  type Toast,
  type UpdateAction,
  type UpdatePhase,
} from '../domain/news';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { adviceLabel, newsSays } from './adviceWords';
import { daySummary, trendOn } from './dayWords';
import { HireButton, type HireControls } from './HireButton';
import { PixelIcon } from './PixelIcon';

interface NewsToastsProps {
  readonly history: readonly DayReport[];
  readonly mode: GameMode | null;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly hire: HireControls;
  readonly onOpenAdvice: () => void;
  readonly onOpenReport: (day: number) => void;
  readonly onDismiss: (key: string) => void;
}

export interface ToastsProps {
  readonly toasts: readonly Toast[];
  readonly onUpdate: (action: UpdateAction) => void;
  // Null on the welcome screen, which has no resort to tell of and offers only a new version.
  readonly news: NewsToastsProps | null;
  // Told while the pointer or the keyboard is on the toasts, so none fades mid-read.
  readonly onHold?: (held: boolean) => void;
}

type ToastActionsProps = Pick<NewsToastsProps, 'onShowOnPlot' | 'hire' | 'onOpenAdvice'>;

function ToastActions({ news, ...props }: { readonly news: News } & ToastActionsProps) {
  const { advice } = news;
  const { at } = advice;
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
      <HireButton advice={advice} hire={props.hire} />
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
    <div className="hud-toast" data-severity="day">
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
    <div className="hud-toast" data-severity={news.severity}>
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
    <div className="hud-toast" data-severity="event">
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
    <div className="hud-toast" data-severity="warning">
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

function newsLineOf(
  toast: Exclude<Toast, { readonly kind: 'update' }>,
  news: NewsToastsProps,
): string {
  if (toast.kind === 'day') {
    const { report } = toast;
    return `Day report. ${daySummary(report, trendOn(news.history, report.day), news.mode)}`;
  }
  if (toast.kind === 'event') return `Programme. ${eventNewsLine(toast.news)}`;
  return `${adviceLabel(toast.news.advice.kind)}. ${newsSays(toast.news)}`;
}

function lineOf(toast: Toast, news: NewsToastsProps | null): string | null {
  if (toast.kind === 'update') return `New version. ${UPDATE_WORDS[toast.phase].line}`;
  return news === null ? null : newsLineOf(toast, news);
}

// Always in the page, so a screen reader is already listening when a line arrives; a region
// mounted with its first toast is often not heard at all.
function LiveLines(props: ToastsProps & { readonly urgent: boolean }) {
  return (
    <div className="visually-hidden" aria-live={props.urgent ? 'assertive' : 'polite'}>
      {props.toasts
        .filter((toast) => isUrgentToast(toast) === props.urgent)
        .map((toast) => {
          const line = lineOf(toast, props.news);
          return line === null ? null : <p key={toastKey(toast)}>{line}</p>;
        })}
    </div>
  );
}

function useHold(onHold: ((held: boolean) => void) | undefined) {
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const held = pointer || focus;
  useEffect(() => onHold?.(held), [onHold, held]);
  return {
    onPointerEnter: () => setPointer(true),
    onPointerLeave: () => setPointer(false),
    onFocus: () => setFocus(true),
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const to = event.relatedTarget;
      if (!(to instanceof Node && event.currentTarget.contains(to))) setFocus(false);
    },
  };
}

// Never pauses the game and never sounds: the corner is for the eye, the log keeps what
// scrolled past.
export function Toasts(props: ToastsProps) {
  const handlers = useHold(props.onHold);
  return (
    <div className="hud-toasts" {...handlers}>
      {props.toasts.map((toast) => (
        <ToastOf key={toastKey(toast)} toast={toast} {...props} />
      ))}
      <LiveLines {...props} urgent={false} />
      <LiveLines {...props} urgent />
    </div>
  );
}
