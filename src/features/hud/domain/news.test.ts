import { describe, expect, it } from 'vitest';
import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  adviceKey,
  expireToasts,
  logNews,
  newsFrom,
  severityOf,
  showToasts,
  withoutResolved,
  type News,
  type Severity,
  type Toast,
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

const normally = { speed: 'normal', muted: new Set<Severity>(), nowMs: 1000 } as const;

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
    expect(next.map((toast) => toast.news.advice.kind)).toEqual(['dirty', 'broken', 'unreachable']);
  });

  it('pushes out the oldest urgent toast when every one shown is urgent', () => {
    const shown = showToasts(
      [],
      [1, 2, 3].map((tileX) => newsOf('broken', 'urgent', tileX)),
      normally,
    );
    const next = showToasts(shown, [newsOf('unreachable', 'urgent')], normally);
    expect(next.map((toast) => toast.news.advice.at?.tileX)).toEqual([2, 3, 0]);
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
      expect(shown.map((toast) => toast.news.severity)).toEqual(['urgent']);
    }
  });

  it('shows nothing of a muted severity', () => {
    const news = [newsOf('no-beds', 'warning'), newsOf('broken', 'urgent')];
    const muted = new Set<Severity>(['urgent']);
    const shown = showToasts([], news, { ...normally, muted });
    expect(shown.map((toast) => toast.news.severity)).toEqual(['warning']);
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

describe('expireToasts', () => {
  it('drops a faded warning and keeps a toast with no end', () => {
    const shown: readonly Toast[] = [
      { news: newsOf('no-beds', 'warning'), until: 5000 },
      { news: newsOf('broken', 'urgent'), until: null },
    ];
    expect(expireToasts(shown, 4999)).toBe(shown);
    expect(expireToasts(shown, 5000).map((toast) => toast.until)).toEqual([null]);
  });
});

describe('withoutResolved', () => {
  it('takes down the toast of a problem the advice no longer has', () => {
    const shown: readonly Toast[] = [
      { news: newsOf('broken', 'urgent', 1), until: null },
      { news: newsOf('broken', 'urgent', 2), until: null },
    ];
    const left = withoutResolved(shown, [advice('broken', 0.9, 2)]);
    expect(left.map((toast) => toast.news.advice.at?.tileX)).toEqual([2]);
  });
});

describe('logNews', () => {
  it('puts the newest first and keeps fifty', () => {
    let log: readonly News[] = [];
    for (let tileX = 0; tileX < 60; tileX++)
      log = logNews(log, [newsOf('broken', 'urgent', tileX)]);
    expect(log).toHaveLength(50);
    expect(log[0]!.advice.at?.tileX).toBe(59);
    expect(log.at(-1)!.advice.at?.tileX).toBe(10);
  });
});
