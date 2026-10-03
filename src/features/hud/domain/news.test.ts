import { describe, expect, it } from 'vitest';
import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { startDay, reportOf, type DayReport } from '../../sim/domain/dayReport';
import { createLedger } from '../../sim/domain/ledger';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  adviceKey,
  expireToasts,
  logNews,
  newDayIn,
  newsFrom,
  severityOf,
  showDay,
  showToasts,
  withoutResolved,
  withUpdate,
  type Message,
  type News,
  type Severity,
  type Toast,
  type ToastKind,
} from './news';

const advice = (kind: AdviceKind, weight = 0.9, tileX = 0): Advice => ({
  kind,
  weight,
  subject: kind,
  count: 1,
  at: { tileX, tileZ: 0 },
  need: null,
});

const newsOf = (kind: AdviceKind, severity: Severity, tileX = 0): News => ({
  key: adviceKey(advice(kind, 0.9, tileX)),
  severity,
  advice: advice(kind, 0.9, tileX),
  count: 1,
  at: 0,
});

const NOTHING_HEARD: ReadonlyMap<string, number> = new Map();

const normally = { speed: 'normal', muted: new Set<ToastKind>(), nowMs: 1000 } as const;

const adviceOf = (message: Message | Toast): Advice | null =>
  message.kind === 'advice' ? message.news.advice : null;

const kindOf = (toast: Toast): string => adviceOf(toast)?.kind ?? toast.kind;

const severityOfToast = (toast: Toast): string =>
  toast.kind === 'advice' ? toast.news.severity : toast.kind;

const reportOn = (day: number): DayReport =>
  reportOf({
    counts: startDay(day),
    rating: { stars: 3.8, happiness: 0.7, housed: 0.9, cleanliness: 0.8 },
    present: 42,
    beds: { total: 60, taken: 40 },
    ledger: createLedger('tycoon', 1000),
    thoughts: new Map(),
  });

const toastOf = (news: News, until: number | null): Toast => ({ kind: 'advice', news, until });

describe('severityOf', () => {
  it('toasts a breakdown as urgent and a missing need as a warning', () => {
    expect(severityOf(advice('broken', 0.3))).toBe('urgent');
    expect(severityOf(advice('unserved-need', 0.05))).toBe('warning');
  });

  it('leaves the quiet kinds and the soft lines to the panel', () => {
    expect(severityOf(advice('unvisited'))).toBeNull();
    expect(severityOf(advice('far-from-home'))).toBeNull();
    expect(severityOf(advice('dirty', 0.3))).toBeNull();
    expect(severityOf(advice('hurt', 0.4))).toBeNull();
    expect(severityOf(advice('hurt', 0.5))).toBe('urgent');
  });
});

describe('adviceKey', () => {
  it('follows the venue, not its name, so a rename is not news', () => {
    const named = { ...advice('broken'), subject: 'Casa Marina', key: 'restaurant#2' };
    const renamed = { ...named, subject: 'The Salty Spoon' };
    expect(adviceKey(renamed)).toBe(adviceKey(named));
    expect(newsFrom([named], [renamed], NOTHING_HEARD, 100).news).toEqual([]);
  });
});

describe('newsFrom', () => {
  it('takes a first look as a baseline, and puts what it saw on cooldown', () => {
    const broken = [advice('broken')];
    const first = newsFrom(null, broken, NOTHING_HEARD, 100);
    expect(first.news).toEqual([]);
    expect(first.heard.get(adviceKey(broken[0]!))).toBe(100);
    expect(newsFrom([], broken, first.heard, 160).news).toEqual([]);
  });

  it('makes news of a new urgent problem and a new warning, but not of a quiet kind', () => {
    const after = [advice('broken'), advice('no-beds'), advice('unvisited')];
    const { news, heard } = newsFrom([], after, NOTHING_HEARD, 100);
    expect(news.map((each) => [each.advice.kind, each.severity])).toEqual([
      ['broken', 'urgent'],
      ['no-beds', 'warning'],
    ]);
    expect(heard.get(adviceKey(after[0]!))).toBe(100);
    expect(heard.has(adviceKey(after[2]!))).toBe(false);
  });

  it('says nothing of a line below its threshold', () => {
    expect(newsFrom([], [advice('littered', 0.2)], NOTHING_HEARD, 100).news).toEqual([]);
  });

  it('says nothing of a problem that was already there', () => {
    const broken = [advice('broken')];
    expect(newsFrom(broken, broken, NOTHING_HEARD, 100).news).toEqual([]);
  });

  it('waits a whole day before saying the same thing again', () => {
    const broken = advice('broken');
    const lately = new Map([[adviceKey(broken), 90]]);
    expect(newsFrom([], [broken], lately, 100).news).toEqual([]);
    const long = new Map([[adviceKey(broken), 100 - TICKS_PER_DAY - 1]]);
    const { news, heard } = newsFrom([], [broken], long, 100);
    expect(news).toHaveLength(1);
    expect(heard.get(adviceKey(broken))).toBe(100);
  });

  it('forgets what it heard longer ago than the cooldown', () => {
    const old = new Map([['broken:Pool Bar:', 0]]);
    expect(newsFrom([], [], old, TICKS_PER_DAY + 1).heard.size).toBe(0);
  });

  it('merges one kind of trouble into one piece of news, led by the loudest', () => {
    const after = [advice('broken', 0.9, 1), advice('broken', 0.6, 2), advice('broken', 0.3, 3)];
    const { news, heard } = newsFrom([], after, NOTHING_HEARD, 100);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ count: 3, key: adviceKey(after[0]!), advice: after[0] });
    expect(heard.size).toBe(3);
  });
});

describe('showToasts', () => {
  it('never shows more than three', () => {
    const news = [1, 2, 3, 4, 5].map((tileX) => newsOf('broken', 'urgent', tileX));
    expect(showToasts([], news, normally)).toHaveLength(3);
  });

  it('pushes out the oldest warning for an urgent toast', () => {
    const shown = showToasts(
      [],
      [newsOf('no-beds', 'warning'), newsOf('dirty', 'warning'), newsOf('broken', 'urgent')],
      normally,
    );
    const next = showToasts(shown, [newsOf('unreachable', 'urgent')], normally);
    expect(next.map(kindOf)).toEqual(['dirty', 'broken', 'unreachable']);
  });

  it('pushes out the oldest urgent toast when every one shown is urgent', () => {
    const shown = showToasts(
      [],
      [1, 2, 3].map((tileX) => newsOf('broken', 'urgent', tileX)),
      normally,
    );
    const next = showToasts(shown, [newsOf('unreachable', 'urgent')], normally);
    expect(next.map((toast) => adviceOf(toast)?.at?.tileX)).toEqual([2, 3, 0]);
  });

  it('never pushes out an urgent toast for a warning', () => {
    const shown = showToasts(
      [],
      [1, 2, 3].map((tileX) => newsOf('broken', 'urgent', tileX)),
      normally,
    );
    expect(showToasts(shown, [newsOf('no-beds', 'warning')], normally)).toEqual(shown);
  });

  it('keeps warnings out of the corner at fast and rush', () => {
    const news = [newsOf('no-beds', 'warning'), newsOf('broken', 'urgent')];
    for (const speed of ['fast', 'rush'] as const) {
      const shown = showToasts([], news, { ...normally, speed });
      expect(shown.map(severityOfToast)).toEqual(['urgent']);
    }
  });

  it('shows nothing of a muted severity', () => {
    const news = [newsOf('no-beds', 'warning'), newsOf('broken', 'urgent')];
    const muted = new Set<Severity>(['urgent']);
    const shown = showToasts([], news, { ...normally, muted });
    expect(shown.map(severityOfToast)).toEqual(['warning']);
  });

  it('lets a warning fade and keeps an urgent toast until it is dealt with', () => {
    const shown = showToasts(
      [],
      [newsOf('no-beds', 'warning'), newsOf('broken', 'urgent')],
      normally,
    );
    expect(shown.map((toast) => toast.until)).toEqual([13_000, null]);
  });
});

describe('showDay', () => {
  it('replaces the day before, so only one day is ever shown', () => {
    const first = showDay([], reportOn(3), normally);
    const second = showDay(first, reportOn(4), normally);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ kind: 'day', report: { day: 4 }, until: 11_000 });
  });

  it('pushes out no advice, and takes none of its three places', () => {
    const urgent = [1, 2, 3].map((tileX) => newsOf('broken', 'urgent', tileX));
    const withDay = showDay(showToasts([], urgent, normally), reportOn(3), normally);
    expect(withDay.map(kindOf)).toEqual(['day', 'broken', 'broken', 'broken']);
    const next = showToasts(withDay, [newsOf('unreachable', 'urgent')], normally);
    expect(next.map(kindOf)).toEqual(['day', 'broken', 'broken', 'unreachable']);
  });

  it('shows the day at rush, where warnings are kept out of the corner', () => {
    const rush = { ...normally, speed: 'rush' } as const;
    expect(showDay([], reportOn(3), rush)).toHaveLength(1);
    expect(showDay([], reportOn(3), { ...rush, muted: new Set<ToastKind>(['day']) })).toEqual([]);
  });
});

describe('withUpdate', () => {
  const urgent = [1, 2, 3].map((tileX) => newsOf('broken', 'urgent', tileX));

  it('adds one update toast at the front', () => {
    const shown = withUpdate(showToasts([], urgent, normally), 'ready');
    expect(shown.map(kindOf)).toEqual(['update', 'broken', 'broken', 'broken']);
    expect(shown[0]).toEqual({ kind: 'update', phase: 'ready', until: null });
  });

  it('replaces the phase rather than adding another', () => {
    const shown = withUpdate(withUpdate([], 'ready'), 'saving');
    expect(shown).toEqual([{ kind: 'update', phase: 'saving', until: null }]);
  });

  it('removes it with null and keeps the rest', () => {
    const shown = showToasts([], urgent, normally);
    expect(withUpdate(withUpdate(shown, 'unsaved'), null)).toEqual(shown);
  });

  it('takes none of the three places', () => {
    const shown = withUpdate(showToasts([], urgent, normally), 'ready');
    const next = showToasts(shown, [newsOf('unreachable', 'urgent')], normally);
    expect(next.map(kindOf)).toEqual(['update', 'broken', 'broken', 'unreachable']);
  });

  it('never expires', () => {
    const shown = withUpdate(showToasts([], [newsOf('no-beds', 'warning')], normally), 'ready');
    expect(expireToasts(shown, 1e12).map(kindOf)).toEqual(['update']);
  });
});

describe('newDayIn', () => {
  it('hears a report closed since the last history, and nothing in a baseline', () => {
    const history = [reportOn(3), reportOn(4)];
    expect(newDayIn(history, undefined)).toBeNull();
    expect(newDayIn(history, 4)).toBeNull();
    expect(newDayIn(history, 3)?.day).toBe(4);
    expect(newDayIn([reportOn(0)], null)?.day).toBe(0);
    expect(newDayIn([], null)).toBeNull();
  });
});

describe('expireToasts', () => {
  it('drops a faded warning and keeps a toast with no end', () => {
    const shown: readonly Toast[] = [
      toastOf(newsOf('no-beds', 'warning'), 5000),
      toastOf(newsOf('broken', 'urgent'), null),
    ];
    expect(expireToasts(shown, 4999)).toBe(shown);
    expect(expireToasts(shown, 5000).map((toast) => toast.until)).toEqual([null]);
  });
});

describe('withoutResolved', () => {
  it('takes down the toast of a problem the advice no longer has', () => {
    const shown: readonly Toast[] = [
      toastOf(newsOf('broken', 'urgent', 1), null),
      toastOf(newsOf('broken', 'urgent', 2), null),
    ];
    const left = withoutResolved(shown, [advice('broken', 0.9, 2)]);
    expect(left.map((toast) => adviceOf(toast)?.at?.tileX)).toEqual([2]);
  });
});

describe('logNews', () => {
  it('puts the newest first and keeps fifty', () => {
    let log: readonly Message[] = [];
    for (let tileX = 0; tileX < 60; tileX++)
      log = logNews(log, [newsOf('broken', 'urgent', tileX)]);
    expect(log).toHaveLength(50);
    expect(adviceOf(log[0]!)?.at?.tileX).toBe(59);
    expect(adviceOf(log.at(-1)!)?.at?.tileX).toBe(10);
  });
});
