import { describe, expect, it } from 'vitest';
import type { Venue } from '../../sim/domain/venues';
import type { PartyMix } from './audience';
import { book, EMPTY_PROGRAMME, type BookingDraft, type Programme } from './programme';
import { programmeView, repeatWords, type ProgrammeFacts } from './programmeView';
import { tickAt } from './week';

const HOUR = 60;

const stage = (key: string, label: string, capacity: number): Venue => ({
  key,
  id: key.split('#')[0]!,
  label,
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.5 }],
  capacity,
  dwellSeconds: { min: 60, max: 120 },
  stage: true,
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 2,
  tilesZ: 2,
  doors: [],
});

const STAGES = [stage('kids-club#0', 'Kids club', 20), stage('beach-club#0', 'Coral Stage', 25)];

const MIX: PartyMix = {
  family: { people: 40, withChildren: 40 },
  couple: { people: 30, withChildren: 0 },
  friends: { people: 20, withChildren: 0 },
  solo: { people: 10, withChildren: 0 },
};

const booked = (...drafts: Partial<BookingDraft>[]): Programme =>
  drafts.reduce(
    (programme, over) =>
      book(
        programme,
        {
          kind: 'live-music',
          site: { kind: 'stage', venue: 'beach-club#0' },
          repeat: { every: 'day' },
          start: 20 * HOUR,
          ...over,
        },
        0,
      ).programme,
    EMPTY_PROGRAMME,
  );

const facts = (over: Partial<ProgrammeFacts> = {}): ProgrammeFacts => ({
  programme: EMPTY_PROGRAMME,
  stages: STAGES,
  now: tickAt(3, 10 * HOUR),
  mode: 'tycoon',
  balance: 1_000,
  forecast: [{ day: 3, weather: 'rain', pinned: false }],
  mix: MIX,
  animators: 1,
  ...over,
});

describe('programmeView', () => {
  it('shows seven days from today, on the chosen stage or the first by name', () => {
    const view = programmeView(facts(), null);
    expect(view.days.map((day) => day.name)).toEqual([
      'Thu 3',
      'Fri 4',
      'Sat 5',
      'Sun 6',
      'Mon 7',
      'Tue 8',
      'Wed 9',
    ]);
    expect(view.days[0]).toMatchObject({ weather: 'rain', pinned: false });
    expect(view.days[1]!.weather).toBeNull();
    expect(view.site?.label).toBe('Coral Stage');
    expect(programmeView(facts(), 'kids-club#0').site?.label).toBe('Kids club');
    expect(programmeView(facts(), 'gone#1').site?.label).toBe('Coral Stage');
    expect(programmeView(facts({ stages: [] }), null).site).toBeNull();
  });

  it('puts a weekly chip on its weekday only, in its part of the day', () => {
    const programme = booked({
      repeat: { every: 'week', weekday: 4 },
      kind: 'kids-show',
      start: 15 * HOUR,
    });
    const view = programmeView(facts({ programme }), 'beach-club#0');
    const shown = view.days.map((day) => [day.parts.afternoon.length, day.parts.evening.length]);
    expect(shown).toEqual([
      [0, 0],
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(view.days[1]!.parts.afternoon[0]).toMatchObject({
      time: '15:00',
      label: 'Magic show',
      repeat: 'Every Fri',
    });
    expect(programmeView(facts({ programme }), 'kids-club#0').days[1]!.parts.afternoon).toEqual([]);
  });

  it('puts a daily chip on every day, and lists the next five events', () => {
    const view = programmeView(facts({ programme: booked({}) }), null);
    expect(view.days.every((day) => day.parts.evening.length === 1)).toBe(true);
    expect(view.upcoming.map((each) => each.when)).toEqual([
      'Thu 3 20:00',
      'Fri 4 20:00',
      'Sat 5 20:00',
      'Sun 6 20:00',
      'Mon 7 20:00',
    ]);
    expect(view.upcoming[0]).toMatchObject({ label: 'Live music', site: 'Coral Stage' });
  });

  it('offers only the starts inside the part of the day', () => {
    const { cards } = programmeView(facts(), null);
    const starts = (part: 'afternoon' | 'evening', kind: string) =>
      cards[part].find((card) => card.kind === kind)?.starts.map((start) => start.words);
    expect(starts('afternoon', 'kids-show')).toEqual([
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
      '17:30',
    ]);
    expect(starts('evening', 'kids-show')).toEqual(['18:00']);
    expect(starts('afternoon', 'cinema')).toBeUndefined();
    expect(starts('evening', 'cinema')).toEqual(['21:30', '22:00']);
  });

  it('reads every fee as free in free play, and guesses the audience from the stage', () => {
    const tycoon = programmeView(facts(), null).cards.evening.find(
      (card) => card.kind === 'musical',
    )!;
    expect(tycoon.fee).toBe('300 a show');
    const free = programmeView(facts({ mode: 'sandbox', balance: 0 }), null).cards.evening;
    expect(free.every((card) => card.fee === 'Free' && card.warning === null)).toBe(true);
    expect(tycoon.audience).toBeLessThanOrEqual(25);
    expect(tycoon.audience).toBeGreaterThan(0);
  });

  it('warns of an animator show with nobody on duty, and of a fee the money cannot meet', () => {
    const cards = programmeView(facts({ animators: 0, balance: 200 }), null).cards.evening;
    const warning = (kind: string) => cards.find((card) => card.kind === kind)?.warning;
    expect(warning('dance-night')).toBe('No animator on duty');
    expect(warning('musical')).toBe('Not enough money');
    expect(warning('live-music')).toBeNull();
    expect(repeatWords({ every: 'once', day: 3 })).toBe('Once');
  });
});
