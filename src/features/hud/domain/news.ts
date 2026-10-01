import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { TICKS_PER_DAY, type SimSpeed } from '../../sim/domain/simClock';

export type Severity = 'urgent' | 'warning';

export interface News {
  // adviceKey of the first advice; merged news keep the first one's key.
  readonly key: string;
  readonly severity: Severity;
  readonly advice: Advice;
  // More than one when several buildings had the same kind of trouble in one refresh.
  readonly count: number;
  readonly at: number;
}

export interface Toast {
  readonly news: News;
  // Wall-clock ms; null stays until dismissed.
  readonly until: number | null;
}

// Unique per building, not per model: two idle Changing Cabins are two rows.
export const adviceKey = (advice: Advice): string =>
  `${advice.kind}:${advice.subject}:${advice.at ? `${advice.at.tileX},${advice.at.tileZ}` : ''}`;

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
  'short-staffed': ['warning', 0],
  broken: ['urgent', 0],
  dirty: ['warning', 0.4],
  unwatched: ['warning', 0.4],
  littered: ['warning', 0.4],
  'far-from-home': null,
  'no-depot': null,
  unvisited: null,
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
  readonly muted: ReadonlySet<Severity>;
  readonly nowMs: number;
}

// At fast and rush a warning lasts a fifth of a day or less, stale before it is read.
const toasted = ({ severity }: News, { speed, muted }: ToastOptions): boolean =>
  !muted.has(severity) && (severity === 'urgent' || (speed !== 'fast' && speed !== 'rush'));

// Only toasts from before this call make room, so one loud refresh cannot push out its own
// loudest news for its quietest. A warning never makes room: it is still logged.
function roomFor(older: readonly Toast[], { severity }: News): readonly Toast[] | null {
  if (severity !== 'urgent') return null;
  const victim = older.find((toast) => toast.news.severity === 'warning') ?? older[0];
  return victim ? older.filter((toast) => toast !== victim) : null;
}

const toastOf = (news: News, nowMs: number): Toast => ({
  news,
  until: news.severity === 'urgent' ? null : nowMs + WARNING_MS,
});

export function showToasts(
  shown: readonly Toast[],
  news: readonly News[],
  options: ToastOptions,
): readonly Toast[] {
  let older = shown;
  const added: Toast[] = [];
  for (const each of news.filter((one) => toasted(one, options))) {
    older = older.filter((toast) => toast.news.key !== each.key);
    const room = older.length + added.length < MAX_TOASTS ? older : roomFor(older, each);
    if (room === null) continue;
    older = room;
    added.push(toastOf(each, options.nowMs));
  }
  return [...older, ...added];
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
  const kept = shown.filter((toast) => current.has(toast.news.key));
  return kept.length === shown.length ? shown : kept;
}

export function logNews(log: readonly News[], news: readonly News[]): readonly News[] {
  return news.length === 0 ? log : [...news, ...log].slice(0, MESSAGES_KEPT);
}
