import { describe, expect, it } from 'vitest';
import type { EventNews } from '../../hud/domain/news';
import type { DayReport } from '../../sim/domain/dayReport';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { eventNewsLine, tallyWords, welcomeWords } from './eventWords';

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

describe('eventNewsLine for fireworks', () => {
  it('tells of them by size, at the beach', () => {
    const grand = news({
      label: 'Grand fireworks',
      venue: 'the beach',
      start: 3 * TICKS_PER_DAY + 22 * 60,
    });
    expect(eventNewsLine(grand)).toBe('Tonight 22:00: Grand fireworks at the beach');
    expect(eventNewsLine({ ...grand, kind: 'tonight' })).toBe('Grand fireworks tonight at 22:00');
    expect(eventNewsLine({ ...grand, kind: 'postpone', reason: 'weather' })).toBe(
      'Grand fireworks moved to tomorrow: rain',
    );
  });
});

describe('tallyWords', () => {
  it('tells of the fireworks and the shows moved only on a day that had some', () => {
    expect(tallyWords({ held: 2, audience: 61, called: 0 })).toBe(
      '2 held · 61 guests · 0 called off',
    );
    expect(tallyWords({ held: 1, audience: 140, called: 0, fireworks: 1, postponed: 1 })).toBe(
      '1 held · 1 fireworks · 140 guests · 0 called off · 1 moved',
    );
    expect(tallyWords({ held: 0, audience: 0, called: 0, postponed: 1 })).toBe(
      '0 held · 0 guests · 0 called off · 1 moved',
    );
    expect(tallyWords({ held: 0, audience: 0, called: 0 })).toBeNull();
    expect(tallyWords(undefined)).toBeNull();
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
