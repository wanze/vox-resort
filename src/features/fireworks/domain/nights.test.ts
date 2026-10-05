import { describe, expect, it } from 'vitest';
import {
  book,
  EMPTY_PROGRAMME,
  occurrencesOn,
  type Programme,
} from '../../events/domain/programme';
import { HISTORY_DAYS, startDay, reportOf, type DayReport } from '../../sim/domain/dayReport';
import { createLedger } from '../../sim/domain/ledger';
import { createDay } from '../../sim/domain/thoughts';
import { fireworksDrought, isFireworksNight } from './nights';

const weekly: Programme = book(
  EMPTY_PROGRAMME,
  {
    kind: 'fireworks',
    site: { kind: 'beach' },
    repeat: { every: 'week', weekday: 5 },
    start: 22 * 60,
    tier: 'small',
  },
  0,
).programme;

const reportOn = (day: number, fireworks = 0): DayReport => ({
  ...reportOf({
    counts: startDay(day),
    rating: { stars: 4, happiness: 0.8, housed: 1, cleanliness: 1 },
    present: 10,
    beds: { total: 10, taken: 10 },
    ledger: createLedger('tycoon', 1000),
    thoughts: createDay(),
  }),
  ...(fireworks > 0 ? { events: { held: 1, audience: 50, called: 0, fireworks } } : {}),
});

const quiet = Array.from({ length: HISTORY_DAYS }, (_, day) => reportOn(day));

describe('isFireworksNight', () => {
  it('holds on the weekday the show is booked for, and no other', () => {
    expect(isFireworksNight(weekly, 5)).toBe(true);
    expect(isFireworksNight(weekly, 12)).toBe(true);
    expect(isFireworksNight(weekly, 6)).toBe(false);
    expect(isFireworksNight(EMPTY_PROGRAMME, 5)).toBe(false);
  });
});

describe('fireworksDrought', () => {
  it('holds after two weeks without fireworks and none booked', () => {
    expect(fireworksDrought(quiet, [])).toBe(true);
  });

  it('waits for two full weeks of reports', () => {
    expect(fireworksDrought(quiet.slice(1), [])).toBe(false);
  });

  it('ends with a show held in those weeks', () => {
    expect(fireworksDrought([...quiet.slice(1), reportOn(20, 1)], [])).toBe(false);
  });

  it('ends with a show booked', () => {
    expect(fireworksDrought(quiet, occurrencesOn(weekly, 5))).toBe(false);
  });
});
