import { describe, expect, it } from 'vitest';
import type { EventNews } from '../../hud/domain/news';
import type { DayReport } from '../../sim/domain/dayReport';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { eventNewsLine, welcomeWords } from './eventWords';

const news = (over: Partial<EventNews> = {}): EventNews => ({
  key: 'event:1:3:announce',
  kind: 'announce',
  label: 'Welcome meeting',
  venue: 'Sunset Stage',
  start: 3 * TICKS_PER_DAY + 10 * 60,
  reason: null,
  at: null,
  ...over,
});

const reportWith = (arrived: number, welcome: DayReport['welcome']): DayReport =>
  ({ arrived, ...(welcome ? { welcome } : {}) }) as DayReport;

describe('eventNewsLine', () => {
  it('announces the welcome, says where the weather moved it, and why it was called off', () => {
    expect(eventNewsLine(news())).toBe('This morning 10:00: Welcome meeting at Sunset Stage');
    const moved = news({ venue: 'Game Hall', movedFrom: 'Sunset Stage', weather: 'rain' });
    expect(eventNewsLine(moved)).toBe("Rain: this morning's Welcome meeting moves to Game Hall");
    expect(eventNewsLine({ ...moved, weather: 'storm' })).toBe(
      "Storm: this morning's Welcome meeting moves to Game Hall",
    );
    expect(eventNewsLine(news({ start: 3 * TICKS_PER_DAY + 20 * 60 }))).toBe(
      'Tonight 20:00: Welcome meeting at Sunset Stage',
    );
    expect(eventNewsLine(news({ kind: 'call-off', reason: 'no-host' }))).toBe(
      'Welcome meeting at Sunset Stage called off: no animator on duty',
    );
  });
});

describe('welcomeWords', () => {
  it('counts the welcomed against the arrivals, or says why there were none', () => {
    expect(welcomeWords(reportWith(34, { welcomed: 28, gap: null }))).toBe('28 of 34 new guests');
    expect(welcomeWords(reportWith(34, { welcomed: 0, gap: 'no-stage' }))).toBe('None: no stage');
    expect(welcomeWords(reportWith(34, { welcomed: 0, gap: 'off' }))).toBe('None: switched off');
    expect(welcomeWords(reportWith(34, { welcomed: 0, gap: 'called-off' }))).toBe(
      'None: called off',
    );
    expect(welcomeWords(reportWith(0, { welcomed: 0, gap: 'no-stage' }))).toBeNull();
    expect(welcomeWords(reportWith(34, undefined))).toBeNull();
  });
});
