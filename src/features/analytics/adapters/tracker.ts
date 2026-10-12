import {
  EVENTS_PATH,
  MAX_EVENTS,
  type AnalyticsEvent,
  type EventDraft,
} from '../domain/analyticsEvent';
import { campaignOf } from '../domain/campaign';
import { drained, hidden, shown, visibleFrom, type VisibleTime } from '../domain/visibleTime';

interface TrackingStart {
  readonly returning: boolean;
  readonly entry: 'direct' | 'link';
  // Asked each time the page is hidden, for the visit's latest state.
  readonly summary: (visibleMs: number) => EventDraft;
}

// Never under `pnpm dev` or the bench, which have no endpoint, nor a browser driven by a script.
const ENABLED = import.meta.env.PROD && typeof navigator !== 'undefined' && !navigator.webdriver;

const session = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
  (byte % 36).toString(36),
).join('');

let queue: AnalyticsEvent[] = [];
let summary: TrackingStart['summary'] | null = null;
let time: VisibleTime | null = null;

function send(events: readonly AnalyticsEvent[]): void {
  const body = new Blob([JSON.stringify({ session, events })], { type: 'application/json' });
  // Queued by the browser, so it survives the page closing; a refusal is simply a lost batch.
  navigator.sendBeacon(EVENTS_PATH, body);
}

function flush(): void {
  for (let at = 0; at < queue.length; at += MAX_EVENTS) send(queue.slice(at, at + MAX_EVENTS));
  queue = [];
}

export function track(draft: EventDraft): void {
  if (!ENABLED) return;
  queue.push({ ...draft, elapsedMs: Math.round(performance.now()) });
  if (queue.length >= MAX_EVENTS) flush();
}

function onHide(): void {
  if (!time || !summary) return;
  const [visibleMs, rest] = drained(hidden(time, performance.now()));
  time = rest;
  // pagehide after visibilitychange has nothing new to say.
  if (visibleMs > 0) track(summary(visibleMs));
  flush();
}

const displayOf = (): 'standalone' | 'browser' =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true
    ? 'standalone'
    : 'browser';

// Once per page; a later call only replaces the summary, as a remount brings a new one.
export function startTracking(start: TrackingStart): void {
  if (!ENABLED) return;
  summary = start.summary;
  if (time) return;
  time = visibleFrom(performance.now(), document.visibilityState === 'visible');
  track({
    name: 'session_start',
    entry: start.entry,
    returning: start.returning ? 1 : 0,
    display: displayOf(),
    ...campaignOf(location.search),
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
    else if (time) time = shown(time, performance.now());
  });
  addEventListener('pagehide', onHide);
  addEventListener('appinstalled', () => track({ name: 'app_installed' }));
}
