import { EVENT_KINDS, labelOf as eventLabelOf } from '../../events/domain/catalogue';
import type { CallOff, EventStep } from '../../events/domain/eventRuns';
import type { EventSite, Occurrence } from '../../events/domain/programme';
import { siteVenueOf } from '../../events/domain/sites';
import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { isBeach } from '../../sim/domain/beach';
import type { DayReport } from '../../sim/domain/dayReport';
import { TICKS_PER_DAY, type SimSpeed } from '../../sim/domain/simClock';
import type { Venue } from '../../sim/domain/venues';
import type { Weather } from '../../sim/domain/weather';

export type Severity = 'urgent' | 'warning';

// What the player can mute: each severity of advice, the report at check-in, and the programme.
export type ToastKind = Severity | 'day' | 'event';

export interface News {
  // adviceKey of the first advice; merged news keep the first one's key.
  readonly key: string;
  readonly severity: Severity;
  readonly advice: Advice;
  // More than one when several buildings had the same kind of trouble in one refresh.
  readonly count: number;
  readonly at: number;
}

export interface EventNews {
  // `event:<booking>:<day>:<kind>`, so an announcement and its calling off are two messages.
  readonly key: string;
  // 'tonight' is told at the morning check-in, for a show that keeps its audience up.
  readonly kind: 'announce' | 'call-off' | 'postpone' | 'tonight';
  readonly label: string;
  // The stage's name; null for a site with no venue.
  readonly venue: string | null;
  // Absolute ticks.
  readonly start: number;
  readonly reason: CallOff | null;
  readonly at: { readonly tileX: number; readonly tileZ: number } | null;
  // The stage it was booked on, set when the weather moved it; null for a site with no venue.
  readonly movedFrom?: string | null;
  readonly weather?: Weather;
  // Logged and not toasted: a built-in's daily announcement would be a toast every evening.
  readonly quiet?: boolean;
}

export type Message =
  | { readonly kind: 'advice'; readonly news: News }
  | { readonly kind: 'day'; readonly report: DayReport }
  | { readonly kind: 'event'; readonly news: EventNews };

export type UpdatePhase = 'ready' | 'saving' | 'unsaved';

export type UpdateAction = 'reload' | 'reload-anyway' | 'later';

// Wall-clock ms; null stays until dismissed. A new version is not news about the resort, so it
// is never logged and has no message.
export type Toast =
  | (Message & { readonly until: number | null })
  | { readonly kind: 'update'; readonly phase: UpdatePhase; readonly until: null };

type AdviceToast = Extract<Toast, { readonly kind: 'advice' }>;

const isAdvice = (toast: Toast): toast is AdviceToast => toast.kind === 'advice';

export const toastKey = (shown: Message | Toast): string => {
  if (shown.kind === 'update') return 'update';
  if (shown.kind === 'day') return `day:${shown.report.day}`;
  return shown.news.key;
};

export const eventKey = (booking: number, day: number, kind: EventNews['kind']): string =>
  `event:${booking}:${day}:${kind}`;

type TellingStep = Extract<EventStep, { readonly kind: EventNews['kind'] }>;

// A built-in with no stage left is the advice's to tell, once, and not the toasts' every day.
const isTelling = (step: EventStep): step is TellingStep =>
  step.kind !== 'start' &&
  step.kind !== 'end' &&
  !(
    step.kind === 'call-off' &&
    step.reason === 'no-site' &&
    EVENT_KINDS[step.occurrence.kind].builtIn === true
  );

const occurrenceOf = (step: TellingStep): Occurrence =>
  step.kind === 'announce' ? step.run.occurrence : step.occurrence;

// A show is only ever put off for the weather.
const reasonOf = (step: TellingStep): CallOff | null => {
  if (step.kind === 'announce') return null;
  return step.kind === 'call-off' ? step.reason : 'weather';
};

const venueWords = (venue: Venue | undefined): string | null => {
  if (!venue) return null;
  return isBeach(venue) ? 'the beach' : venue.label;
};

const labelOf = (site: EventSite, venues: readonly Venue[]): string | null =>
  venueWords(venues[siteVenueOf(site, venues)]);

const showLabelOf = (occurrence: Occurrence): string =>
  eventLabelOf(EVENT_KINDS[occurrence.kind], occurrence.tier);

function announceExtras(
  step: TellingStep,
  venues: readonly Venue[],
  weather: Weather,
): Pick<EventNews, 'movedFrom' | 'weather' | 'quiet'> {
  if (step.kind !== 'announce') return {};
  if (step.movedFrom) return { movedFrom: labelOf(step.movedFrom, venues), weather };
  return EVENT_KINDS[step.run.occurrence.kind].builtIn === true ? { quiet: true } : {};
}

// The start and the end of a show are not news: the announcement said it all.
function newsOf(step: TellingStep, venues: readonly Venue[], weather: Weather): EventNews {
  const occurrence = occurrenceOf(step);
  const venue = venues[siteVenueOf(occurrence.site, venues)];
  return {
    key: eventKey(occurrence.booking, occurrence.day, step.kind),
    kind: step.kind,
    label: showLabelOf(occurrence),
    venue: venueWords(venue),
    start: occurrence.start,
    reason: reasonOf(step),
    at: venue ? { tileX: venue.tileX, tileZ: venue.tileZ } : null,
    ...announceExtras(step, venues, weather),
  };
}

// `weather` is today's: a move is made at the announcement, an hour before, on the day itself.
export function eventNewsFrom(
  steps: readonly EventStep[],
  venues: readonly Venue[],
  weather: Weather = 'rain',
): readonly EventNews[] {
  return steps.filter(isTelling).map((step) => newsOf(step, venues, weather));
}

export function tonightNewsOf(occurrence: Occurrence, venues: readonly Venue[]): EventNews {
  const venue = venues[siteVenueOf(occurrence.site, venues)];
  return {
    key: eventKey(occurrence.booking, occurrence.day, 'tonight'),
    kind: 'tonight',
    label: showLabelOf(occurrence),
    venue: venueWords(venue),
    start: occurrence.start,
    reason: null,
    at: venue ? { tileX: venue.tileX, tileZ: venue.tileZ } : null,
  };
}

// Unique per building, not per model: two idle Changing Cabins are two rows. By the venue's key
// where it has one, so renaming a broken bar does not toast its breakdown again.
export const adviceKey = (advice: Advice): string =>
  `${advice.kind}:${advice.key ?? advice.subject}:${advice.at ? `${advice.at.tileX},${advice.at.tileZ}` : ''}`;

// The severity and the weight it takes to reach it; null stays in the panel. The weights are
// first guesses, to be tuned by playing a few days at normal speed.
const SEVERITIES: { readonly [kind in AdviceKind]: readonly [Severity, number] | null } = {
  closed: ['urgent', 0],
  'no-entrance': ['urgent', 0],
  'no-reception': ['urgent', 0],
  'no-beds': ['warning', 0],
  unmade: ['warning', 0.4],
  hurt: ['urgent', 0.5],
  'unserved-need': ['warning', 0],
  'full-lines': ['warning', 0.4],
  unreachable: ['urgent', 0],
  // A note for the panel and the map: it counts toward nothing, so it never interrupts.
  'not-step-free': null,
  'short-staffed': ['warning', 0],
  broken: ['urgent', 0],
  dirty: ['warning', 0.4],
  unwatched: ['warning', 0.4],
  littered: ['warning', 0.4],
  'far-from-home': null,
  'no-depot': null,
  unvisited: null,
  'no-events': null,
  'no-welcome': null,
  'no-fireworks': null,
  'weather-closed': null,
};

export function severityOf(advice: Advice): Severity | null {
  const rule = SEVERITIES[advice.kind];
  return rule && advice.weight >= rule[1] ? rule[0] : null;
}

// A venue that keeps breaking and being repaired would otherwise toast every hour.
const COOLDOWN_TICKS = TICKS_PER_DAY;

const MAX_TOASTS = 3;

const WARNING_MS = 12_000;

const DAY_MS = 10_000;

const EVENT_MS = 10_000;

const MESSAGES_KEPT = 50;

// A null `before` is a baseline: a load or a new game marks what is already wrong as heard
// rather than toasting all of it at once.
export function newsFrom(
  before: readonly Advice[] | null,
  after: readonly Advice[],
  heard: ReadonlyMap<string, number>,
  now: number,
): { readonly news: readonly News[]; readonly heard: ReadonlyMap<string, number> } {
  const recent = new Map([...heard].filter(([, at]) => now - at <= COOLDOWN_TICKS));
  if (before === null) {
    for (const advice of after) recent.set(adviceKey(advice), now);
    return { news: [], heard: recent };
  }
  const known = new Set(before.map(adviceKey));
  const byKind = new Map<AdviceKind, News>();
  for (const advice of after) {
    const severity = severityOf(advice);
    const key = adviceKey(advice);
    if (severity === null || known.has(key) || recent.has(key)) continue;
    const merged = byKind.get(advice.kind);
    byKind.set(
      advice.kind,
      merged
        ? { ...merged, count: merged.count + 1 }
        : { key, severity, advice, count: 1, at: now },
    );
    recent.set(key, now);
  }
  return { news: [...byKind.values()], heard: recent };
}

interface ToastOptions {
  readonly speed: SimSpeed;
  readonly muted: ReadonlySet<ToastKind>;
  readonly nowMs: number;
}

// At fast and rush a warning lasts a fifth of a day or less, stale before it is read.
const toasted = ({ severity }: News, { speed, muted }: ToastOptions): boolean =>
  !muted.has(severity) && (severity === 'urgent' || (speed !== 'fast' && speed !== 'rush'));

// Only toasts from before this call make room, so one loud refresh cannot push out its own
// loudest news for its quietest. A warning never makes room: it is still logged.
function roomFor(older: readonly AdviceToast[], { severity }: News): readonly AdviceToast[] | null {
  if (severity !== 'urgent') return null;
  const victim = older.find((toast) => toast.news.severity === 'warning') ?? older[0];
  return victim ? older.filter((toast) => toast !== victim) : null;
}

const toastOf = (news: News, nowMs: number): AdviceToast => ({
  kind: 'advice',
  news,
  until: news.severity === 'urgent' ? null : nowMs + WARNING_MS,
});

// The day's toast is not advice, so it never takes one of the three places.
export function showToasts(
  shown: readonly Toast[],
  news: readonly News[],
  options: ToastOptions,
): readonly Toast[] {
  let older: readonly AdviceToast[] = shown.filter(isAdvice);
  const added: AdviceToast[] = [];
  for (const each of news.filter((one) => toasted(one, options))) {
    older = older.filter((toast) => toast.news.key !== each.key);
    const room = older.length + added.length < MAX_TOASTS ? older : roomFor(older, each);
    if (room === null) continue;
    older = room;
    added.push(toastOf(each, options.nowMs));
  }
  return [...shown.filter((toast) => !isAdvice(toast)), ...older, ...added];
}

// undefined for a history not yet heard, which is a baseline: the reports a load brings were
// closed long ago.
export function newDayIn(
  history: readonly DayReport[],
  heard: number | null | undefined,
): DayReport | null {
  const newest = history.at(-1);
  return heard !== undefined && newest && newest.day !== heard ? newest : null;
}

// At every speed, rush included: at thirty seconds a day, yesterday is what the player can act on.
export function showDay(
  shown: readonly Toast[],
  report: DayReport,
  { muted, nowMs }: Omit<ToastOptions, 'speed'>,
): readonly Toast[] {
  const others = shown.filter((toast) => toast.kind !== 'day');
  if (muted.has('day')) return others.length === shown.length ? shown : others;
  const update = others.filter((toast) => toast.kind === 'update');
  return [...update, { kind: 'day', report, until: nowMs + DAY_MS }, ...others.filter(isAdvice)];
}

// Like the day's toast, it takes none of the three places advice competes for.
export function showEvent(
  shown: readonly Toast[],
  news: EventNews,
  { muted, nowMs }: Omit<ToastOptions, 'speed'>,
): readonly Toast[] {
  if (muted.has('event') || news.quiet === true) return shown;
  const others = shown.filter((toast) => toastKey(toast) !== news.key);
  return [...others, { kind: 'event', news, until: nowMs + EVENT_MS }];
}

export const updateOnly = (shown: readonly Toast[]): readonly Toast[] =>
  shown.filter((toast) => toast.kind === 'update');

// Never muted and never expired, at every speed, and it takes none of the three places: the
// player may be about to lose the game to a reload.
export function withUpdate(shown: readonly Toast[], phase: UpdatePhase | null): readonly Toast[] {
  const others = shown.filter((toast) => toast.kind !== 'update');
  if (phase === null) return others.length === shown.length ? shown : others;
  return [{ kind: 'update', phase, until: null }, ...others];
}

export function expireToasts(shown: readonly Toast[], nowMs: number): readonly Toast[] {
  const kept = shown.filter((toast) => toast.until === null || toast.until > nowMs);
  return kept.length === shown.length ? shown : kept;
}

export function withoutResolved(
  shown: readonly Toast[],
  advice: readonly Advice[],
): readonly Toast[] {
  const current = new Set(advice.map(adviceKey));
  const kept = shown.filter((toast) => !isAdvice(toast) || current.has(toast.news.key));
  return kept.length === shown.length ? shown : kept;
}

const logged = (log: readonly Message[], messages: readonly Message[]): readonly Message[] =>
  messages.length === 0 ? log : [...messages, ...log].slice(0, MESSAGES_KEPT);

export function logNews(log: readonly Message[], news: readonly News[]): readonly Message[] {
  return logged(
    log,
    news.map((each) => ({ kind: 'advice', news: each })),
  );
}

export function logDay(log: readonly Message[], report: DayReport): readonly Message[] {
  return logged(log, [{ kind: 'day', report }]);
}

export function logEvent(log: readonly Message[], news: EventNews): readonly Message[] {
  return logged(log, [{ kind: 'event', news }]);
}
