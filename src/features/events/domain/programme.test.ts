import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  ANNOUNCE_LEAD,
  book,
  bookingRefusal,
  EMPTY_PROGRAMME,
  eventOn,
  eventsDue,
  keepStanding,
  nextEvents,
  occurrencesOn,
  postponed,
  rebook,
  switchBuiltIn,
  toNewStage,
  unbook,
  withBuiltIns,
  type BookingDraft,
  type BuiltIn,
  type EventSite,
  type Programme,
} from './programme';
import { tickAt } from './week';

const STAGE: EventSite = { kind: 'stage', venue: 'beach-club#0' };
const OTHER: EventSite = { kind: 'stage', venue: 'kids-club#0' };
const HOUR = 60;

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  kind: 'live-music',
  site: STAGE,
  repeat: { every: 'day' },
  start: 20 * HOUR,
  ...over,
});

const booked = (...drafts: BookingDraft[]): Programme =>
  drafts.reduce((programme, each) => {
    const result = book(programme, each, 0);
    expect(result.refusal).toBeNull();
    return result.programme;
  }, EMPTY_PROGRAMME);

const WELCOME: BuiltIn = {
  id: 'welcome',
  kind: 'quiz-night',
  repeat: { every: 'day' },
  start: 19 * HOUR,
};

describe('book', () => {
  it('books a free slot and numbers it', () => {
    const programme = booked(draft(), draft({ site: OTHER }));
    expect(programme.bookings.map((each) => each.id)).toEqual([1, 2]);
    expect(programme.nextId).toBe(3);
  });

  it('refuses a start outside the hours, off the half hour, on the wrong site or already past', () => {
    expect(book(EMPTY_PROGRAMME, draft({ start: 17 * HOUR }), 0).refusal).toBe('hours');
    expect(book(EMPTY_PROGRAMME, draft({ start: 20 * HOUR + 15 }), 0).refusal).toBe('hours');
    expect(book(EMPTY_PROGRAMME, draft({ site: { kind: 'beach' } }), 0).refusal).toBe('site');
    const tonight = draft({ repeat: { every: 'once', day: 2 } });
    expect(book(EMPTY_PROGRAMME, tonight, tickAt(2, 19 * HOUR)).refusal).toBeNull();
    expect(book(EMPTY_PROGRAMME, tonight, tickAt(2, 19 * HOUR) + 1).refusal).toBe('past');
    expect(book(EMPTY_PROGRAMME, draft({ builtIn: 'welcome' }), 0).refusal).toBe('built-in');
  });

  it('answers as book would without booking anything', () => {
    const programme = booked(draft());
    expect(bookingRefusal(programme, draft(), 0)).toBe('overlap');
    expect(bookingRefusal(programme, draft({ site: OTHER }), 0)).toBeNull();
    expect(programme.bookings).toHaveLength(1);
  });

  it('refuses a daily booking over a weekly one on the same stage, but not on another', () => {
    const programme = booked(draft({ repeat: { every: 'week', weekday: 4 } }));
    expect(book(programme, draft({ kind: 'dance-night', start: 21 * HOUR }), 0).refusal).toBe(
      'overlap',
    );
    expect(book(programme, draft({ site: OTHER }), 0).refusal).toBeNull();
  });

  it('meets a weekly booking with a one-off only on its weekday', () => {
    const programme = booked(draft({ repeat: { every: 'week', weekday: 4 } }));
    expect(book(programme, draft({ repeat: { every: 'once', day: 4 } }), 0).refusal).toBe(
      'overlap',
    );
    expect(book(programme, draft({ repeat: { every: 'once', day: 11 } }), 0).refusal).toBe(
      'overlap',
    );
    expect(book(programme, draft({ repeat: { every: 'once', day: 5 } }), 0).refusal).toBeNull();
  });

  it('keeps half an hour free after each event', () => {
    const programme = booked(draft({ kind: 'musical', start: 18 * HOUR }));
    expect(book(programme, draft({ start: 20 * HOUR }), 0).refusal).toBe('overlap');
    expect(book(programme, draft({ start: 20.5 * HOUR }), 0).refusal).toBeNull();
  });

  it('lets a switched-off built-in not block the stage', () => {
    const withWelcome = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [STAGE.venue]);
    const off = switchBuiltIn(withWelcome, 1, false);
    expect(book(withWelcome, draft({ start: 19.5 * HOUR }), 0).refusal).toBe('overlap');
    expect(book(off, draft({ start: 19.5 * HOUR }), 0).refusal).toBeNull();
    const busy = book(off, draft({ start: 19.5 * HOUR }), 0).programme;
    expect(switchBuiltIn(busy, 1, true)).toBe(busy);
    expect(switchBuiltIn(off, 1, true).bookings[0]!.off).toBeUndefined();
  });
});

describe('unbook', () => {
  it('removes a booking but keeps a built-in', () => {
    const programme = booked(draft());
    expect(unbook(programme, 1).bookings).toEqual([]);
    const withWelcome = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [STAGE.venue]);
    expect(unbook(withWelcome, 1)).toBe(withWelcome);
  });
});

describe('rebook', () => {
  it('moves a booking, and refuses to move it onto another', () => {
    const programme = booked(draft(), draft({ site: OTHER }));
    const later = rebook(programme, 1, { start: 21 * HOUR });
    expect(later.refusal).toBeNull();
    expect(later.programme.bookings[0]!.start).toBe(21 * HOUR);
    const clash = rebook(programme, 2, { site: STAGE });
    expect(clash.refusal).toBe('overlap');
    expect(clash.programme).toBe(programme);
  });
});

const rank = (key: string): number => (key === STAGE.venue ? -25 : -20);

describe('withBuiltIns', () => {
  it('adds a missing built-in on the first stage, re-sites it when that is gone, and is idempotent', () => {
    const added = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], ['kids-club#0', 'beach-club#0']);
    expect(added.bookings).toEqual([
      {
        id: 1,
        kind: 'quiz-night',
        repeat: { every: 'day' },
        start: 19 * HOUR,
        site: STAGE,
        builtIn: 'welcome',
      },
    ]);
    expect(withBuiltIns(added, [WELCOME], ['kids-club#0', 'beach-club#0'])).toBe(added);
    const moved = withBuiltIns(added, [WELCOME], ['kids-club#0']);
    expect(moved.bookings[0]!.site).toEqual(OTHER);
    expect(withBuiltIns(added, [WELCOME], [])).toBe(added);
  });

  it('puts a new built-in on the lowest-ranked stage', () => {
    const added = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], ['kids-club#0', 'beach-club#0'], rank);
    expect(added.bookings[0]!.site).toEqual(STAGE);
    const sameRank = withBuiltIns(
      EMPTY_PROGRAMME,
      [WELCOME],
      ['kids-club#0', 'beach-club#0'],
      () => 0,
    );
    expect(sameRank.bookings[0]!.site).toEqual(STAGE);
  });

  it('puts a built-in kept from before its hours moved back to its kind’s start', () => {
    const added = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [STAGE.venue]);
    const stale: Programme = {
      ...added,
      bookings: [{ ...added.bookings[0]!, start: 12 * HOUR }],
    };
    expect(withBuiltIns(stale, [WELCOME], [STAGE.venue]).bookings[0]!.start).toBe(20 * HOUR);
    expect(withBuiltIns(stale, [WELCOME], []).bookings[0]!.start).toBe(20 * HOUR);
  });

  it('leaves a built-in the player moved to another standing stage where it is', () => {
    const added = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [STAGE.venue, OTHER.venue], rank);
    const moved = rebook(added, 1, { site: OTHER }).programme;
    expect(withBuiltIns(moved, [WELCOME], [STAGE.venue, OTHER.venue], rank)).toBe(moved);
  });
});

describe('toNewStage', () => {
  const onOther = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [OTHER.venue], rank);

  it('moves a built-in to a bigger stage just built', () => {
    const moved = toNewStage(onOther, [STAGE.venue], rank);
    expect(moved.bookings[0]!.site).toEqual(STAGE);
  });

  it('leaves it put with nothing built, or nothing bigger', () => {
    expect(toNewStage(onOther, [], rank)).toBe(onOther);
    const onStage = withBuiltIns(EMPTY_PROGRAMME, [WELCOME], [STAGE.venue], rank);
    expect(toNewStage(onStage, [OTHER.venue], rank)).toBe(onStage);
  });

  it('leaves the bookings that are not built-ins where they are', () => {
    const programme = booked(draft({ site: OTHER }));
    expect(toNewStage(programme, [STAGE.venue], rank)).toBe(programme);
  });
});

describe('keepStanding', () => {
  it('drops a demolished stage’s bookings and keeps the built-ins', () => {
    const programme = withBuiltIns(
      booked(draft(), draft({ site: OTHER })),
      [WELCOME],
      [STAGE.venue],
    );
    const kept = keepStanding(programme, new Set([OTHER.venue]));
    expect(kept.bookings.map((each) => each.id)).toEqual([2, 3]);
  });
});

describe('eventsDue', () => {
  const programme = booked(draft());
  const announce = tickAt(3, 20 * HOUR) - ANNOUNCE_LEAD;

  it('finds an announcement inside a frame of twelve ticks', () => {
    const due = eventsDue(programme, announce - 5, announce + 6, ANNOUNCE_LEAD);
    expect(due.map((each) => [each.booking, each.day])).toEqual([[1, 3]]);
    expect(eventsDue(programme, announce + 1, announce + 12, ANNOUNCE_LEAD)).toEqual([]);
  });

  it('looks across midnight to the next day', () => {
    const late = booked(draft({ kind: 'kids-show', start: 14 * HOUR }));
    const midnight = tickAt(4, 0);
    const lead = 14 * HOUR + 2;
    const due = eventsDue(late, midnight - 6, midnight + 5, lead);
    expect(due.map((each) => each.day)).toEqual([4]);
    const crossing = eventsDue(late, tickAt(3, 23 * HOUR), midnight, lead);
    expect(crossing.map((each) => each.day)).toEqual([4]);
  });

  it('never hands one occurrence over twice across adjacent spans', () => {
    let seen = 0;
    for (let from = 0; from < 3 * TICKS_PER_DAY; from += 12) {
      seen += eventsDue(programme, from, from + 11, ANNOUNCE_LEAD).length;
    }
    expect(seen).toBe(3);
  });
});

describe('eventOn', () => {
  it('holds from the first minute to the last', () => {
    const programme = booked(draft());
    const start = tickAt(1, 20 * HOUR);
    expect(eventOn(programme, STAGE, start - 1)).toBeNull();
    expect(eventOn(programme, STAGE, start)?.booking).toBe(1);
    expect(eventOn(programme, STAGE, start + 89)?.booking).toBe(1);
    expect(eventOn(programme, STAGE, start + 90)).toBeNull();
    expect(eventOn(programme, OTHER, start)).toBeNull();
  });
});

describe('nextEvents', () => {
  it('runs on past the end of the week', () => {
    const programme = booked(draft({ repeat: { every: 'week', weekday: 0 } }));
    expect(nextEvents(programme, tickAt(5, 0), 3).map((each) => each.day)).toEqual([7]);
    expect(nextEvents(programme, tickAt(7, 21 * HOUR), 3).map((each) => each.day)).toEqual([14]);
    expect(nextEvents(EMPTY_PROGRAMME, 0, 5)).toEqual([]);
  });
});

describe('postponed', () => {
  it('moves a one-off to the next day, or drops it when that is taken', () => {
    const once = booked(draft({ repeat: { every: 'once', day: 2 } }));
    const [occurrence] = occurrencesOn(once, 2);
    expect(postponed(once, occurrence!).bookings[0]!.repeat).toEqual({ every: 'once', day: 3 });
    const taken = book(once, draft({ repeat: { every: 'once', day: 3 } }), 0).programme;
    expect(postponed(taken, occurrence!).bookings.map((each) => each.id)).toEqual([2]);
  });

  it('adds a one-off the day after a weekly occurrence, and nothing after a daily one', () => {
    const weekly = booked(draft({ repeat: { every: 'week', weekday: 2 } }));
    const [occurrence] = occurrencesOn(weekly, 2);
    const after = postponed(weekly, occurrence!);
    expect(after.bookings.map((each) => each.repeat)).toEqual([
      { every: 'week', weekday: 2 },
      { every: 'once', day: 3 },
    ]);
    const daily = booked(draft());
    expect(postponed(daily, occurrencesOn(daily, 2)[0]!)).toBe(daily);
  });
});
