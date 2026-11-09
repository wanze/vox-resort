import { describe, expect, it } from 'vitest';
import { book, EMPTY_PROGRAMME, type BookingDraft, type Programme } from './programme';
import { posterWeek } from './poster';
import { tickAt } from './week';

const HOUR = 60;

const CORAL = 'beach-club#0';

const LABELS = new Map([
  [CORAL, 'Coral Stage'],
  ['beach', 'Beach'],
]);

const booked = (...drafts: Partial<BookingDraft>[]): Programme =>
  drafts.reduce(
    (programme, over) =>
      book(
        programme,
        {
          kind: 'live-music',
          site: { kind: 'stage', venue: CORAL },
          repeat: { every: 'day' },
          start: 20 * HOUR,
          ...over,
        },
        0,
      ).programme,
    EMPTY_PROGRAMME,
  );

const NOW = tickAt(3, 21 * HOUR);

describe('the week poster', () => {
  it('runs a column a day from today, with its weekday, date and weather', () => {
    const week = posterWeek(
      EMPTY_PROGRAMME,
      NOW,
      7,
      [{ day: 4, weather: 'rain', pinned: true }],
      LABELS,
    );
    expect(week.map((day) => day.day)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(week[0]).toMatchObject({ weekday: 'Thu', date: 4, today: true, weather: null });
    expect(week[1]).toMatchObject({ weekday: 'Fri', today: false, weather: 'rain', pinned: true });
  });

  it('lists every stage on its day in time order, named by its size and its stage', () => {
    const programme = booked(
      { kind: 'quiz-night', start: 19 * HOUR, repeat: { every: 'once', day: 4 } },
      {
        kind: 'fireworks',
        site: { kind: 'beach' },
        start: 22 * HOUR,
        tier: 'grand',
        repeat: { every: 'week', weekday: 4 },
      },
    );
    const [, friday] = posterWeek(programme, NOW, 7, [], LABELS);
    expect(friday!.events.map(({ time, label, site }) => ({ time, label, site }))).toEqual([
      { time: '19:00', label: 'Quiz night', site: 'Coral Stage' },
      { time: '22:00', label: 'Grand fireworks', site: 'Beach' },
    ]);
  });

  it('strikes off what is already over today, and leaves out what is switched off', () => {
    const programme = booked({ start: 18 * HOUR }, { kind: 'quiz-night', start: 21 * HOUR });
    const [today] = posterWeek(programme, NOW, 1, [], LABELS);
    expect(today!.events.map((each) => [each.time, each.over])).toEqual([
      ['18:00', true],
      ['21:00', false],
    ]);
    const [music, quiz] = programme.bookings;
    const quiet: Programme = { ...programme, bookings: [music!, { ...quiz!, off: true }] };
    expect(posterWeek(quiet, NOW, 1, [], LABELS)[0]!.events.map((each) => each.time)).toEqual([
      '18:00',
    ]);
  });
});
