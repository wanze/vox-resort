import { describe, expect, it } from 'vitest';
import type { Venue } from '../../sim/domain/venues';
import type { PartyMix } from './audience';
import {
  book,
  BUILT_INS,
  EMPTY_PROGRAMME,
  rebook,
  switchBuiltIn,
  withBuiltIns,
  type BookingDraft,
  type Programme,
} from './programme';
import {
  cardsAt,
  filterUpcoming,
  programmeView,
  repeatWords,
  upcomingByDay,
  upcomingKinds,
  upcomingSites,
  type DayPart,
  type ProgrammeFacts,
} from './programmeView';
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
  beachRoom: 0,
  ...over,
});

// Today, as facts() has it, unless another day is asked for.
const cardsOf = (from: ProgrammeFacts, chosen: string | null, part: DayPart, day = 3) =>
  cardsAt(from, programmeView(from, chosen).site!, day, part);

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

  it('puts a daily chip on every day, and lists a week of events', () => {
    const view = programmeView(facts({ programme: booked({}) }), null);
    expect(view.days.every((day) => day.parts.evening.length === 1)).toBe(true);
    expect(view.upcoming.map((each) => `${each.dayName} ${each.time}`)).toEqual([
      'Thu 3 20:00',
      'Fri 4 20:00',
      'Sat 5 20:00',
      'Sun 6 20:00',
      'Mon 7 20:00',
      'Tue 8 20:00',
      'Wed 9 20:00',
      'Thu 10 20:00',
    ]);
    expect(view.upcoming[0]).toMatchObject({ label: 'Live music', site: 'Coral Stage' });
  });

  it('shows the welcome in the morning, where nothing else can be booked', () => {
    const welcome = withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, ['beach-club#0']);
    const earlier = rebook(welcome, 1, { start: 8 * HOUR }).programme;
    const view = programmeView(facts({ programme: earlier }), null);
    expect(view.days[0]!.parts.morning.map((chip) => [chip.time, chip.label])).toEqual([
      ['08:00', 'Welcome meeting'],
    ]);
    expect(view.days[0]!.parts.afternoon).toEqual([]);
    expect(cardsOf(facts({ programme: earlier }), null, 'morning')).toEqual([]);
    expect(view.days[0]!.open).toEqual({ morning: false, afternoon: true, evening: true });
    expect(rebook(welcome, 1, { start: 10.5 * HOUR }).refusal).toBe('hours');
    const off = switchBuiltIn(welcome, 1, false);
    expect(programmeView(facts({ programme: off }), null).days[0]!.parts.morning[0]!.off).toBe(
      true,
    );
  });

  it('offers only the starts inside the part of the day', () => {
    const starts = (part: 'afternoon' | 'evening', kind: string) =>
      cardsOf(facts(), null, part)
        .find((card) => card.kind === kind)
        ?.starts.map((start) => start.words);
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
    const tycoon = cardsOf(facts(), null, 'evening').find((card) => card.kind === 'musical')!;
    expect(tycoon.fee).toBe('300 a show');
    const free = cardsOf(facts({ mode: 'sandbox', balance: 0 }), null, 'evening');
    expect(free.every((card) => card.fee === 'Free' && card.warning === null)).toBe(true);
    expect(tycoon.audience).toBeLessThanOrEqual(25);
    expect(tycoon.audience).toBeGreaterThan(0);
  });

  it('warns of an animator show with nobody on duty, and of a fee the money cannot meet', () => {
    const cards = cardsOf(facts({ animators: 0, balance: 200 }), null, 'evening');
    const warning = (kind: string) => cards.find((card) => card.kind === kind)?.warning;
    expect(warning('dance-night')).toBe('No animator on duty');
    expect(warning('musical')).toBe('Not enough money');
    expect(warning('live-music')).toBeNull();
    expect(repeatWords({ every: 'once', day: 3 })).toBe('Once');
  });
});

describe('booking only what can be booked', () => {
  it('leaves out the starts a booking already holds, and says which repeats clash', () => {
    const weekly = booked({ repeat: { every: 'week', weekday: 4 }, start: 20 * HOUR });
    const friday = cardsOf(facts({ programme: weekly }), 'beach-club#0', 'evening', 4);
    const music = friday.find((card) => card.kind === 'live-music')!;
    const fridayStarts = music.starts.map((start) => start.words);
    expect(fridayStarts).toContain('18:00');
    expect(fridayStarts).not.toContain('20:00');
    const thursday = cardsOf(facts({ programme: weekly }), 'beach-club#0', 'evening', 3);
    const atEight = thursday
      .find((card) => card.kind === 'live-music')!
      .starts.find((start) => start.words === '20:00')!;
    expect(atEight.repeats.map((choice) => [choice.words, choice.refusal])).toEqual([
      ['Once', null],
      ['Every Thu', null],
      ['Every day', 'overlap'],
    ]);
  });

  it('puts a kind with no free start last, and shuts a cell with nothing left in it', () => {
    const late = facts({ now: tickAt(3, 23 * HOUR) });
    const tonight = cardsOf(late, 'beach-club#0', 'evening');
    expect(tonight.every((card) => card.starts.every((start) => start.repeats[0]!.refusal))).toBe(
      true,
    );
    const full = booked({ start: 18 * HOUR, kind: 'musical' });
    const cards = cardsOf(facts({ programme: full }), 'beach-club#0', 'evening');
    const firstFull = cards.findIndex((card) => card.starts.length === 0);
    expect(firstFull).toBeGreaterThan(0);
    expect(cards.slice(firstFull).every((card) => card.starts.length === 0)).toBe(true);
  });

  it('says whether a booked chip can move either way', () => {
    const programme = booked({ start: 18 * HOUR, kind: 'musical' });
    const [chip] = programmeView(facts({ programme }), null).days[0]!.parts.evening;
    expect(chip).toMatchObject({ earlier: false, later: true, canSwitch: false });
  });

  it('lets a built-in be switched off, and back on', () => {
    const welcome = withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, ['beach-club#0']);
    const off = switchBuiltIn(welcome, 1, false);
    const morning = (programme: Programme) =>
      programmeView(facts({ programme }), null).days[0]!.parts.morning[0]!;
    expect(morning(welcome).canSwitch).toBe(true);
    expect(morning(off).canSwitch).toBe(true);
  });
});

describe('stage kinds', () => {
  it('groups the stages by what they are, the beach on its own at the end', () => {
    const stages = [...STAGES, stage('kids-club#1', 'Little Pirates', 30)];
    const view = programmeView(facts({ stages, beachRoom: 80 }), null);
    expect(view.types.map((type) => [type.key, type.sites.map((site) => site.label)])).toEqual([
      ['beach-club', ['Coral Stage']],
      ['kids-club', ['Kids club', 'Little Pirates']],
      ['beach', ['Beach']],
    ]);
    expect(view.types.at(-1)!.sign).toBeNull();
    expect(view.types[0]!.sign).not.toBeNull();
  });
});

describe('the list of what is coming up', () => {
  const programme = booked(
    { start: 20 * HOUR },
    { kind: 'kids-show', site: { kind: 'stage', venue: 'kids-club#0' }, start: 15 * HOUR },
  );
  const { upcoming } = programmeView(facts({ programme }), null);

  it('narrows to one kind of event or one stage', () => {
    const kids = filterUpcoming(upcoming, { kind: 'kids-show', site: null });
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.every((each) => each.site === 'Kids club')).toBe(true);
    const coral = filterUpcoming(upcoming, { kind: null, site: 'beach-club#0' });
    expect(coral.every((each) => each.label === 'Live music')).toBe(true);
    expect(filterUpcoming(upcoming, { kind: null, site: null })).toEqual(upcoming);
  });

  it('offers only the kinds and stages that have something on', () => {
    expect(upcomingKinds(upcoming).map((kind) => kind.id)).toEqual(['live-music', 'kids-show']);
    expect(upcomingSites(upcoming)).toEqual([
      { id: 'kids-club#0', label: 'Kids club' },
      { id: 'beach-club#0', label: 'Coral Stage' },
    ]);
  });

  it('gathers the events under their day', () => {
    const days = upcomingByDay(upcoming);
    expect(days[0]).toMatchObject({ day: 3, name: 'Thu 3' });
    expect(days[0]!.events.map((each) => each.time)).toEqual(['15:00', '20:00']);
    expect(days.map((day) => day.day)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('the beach in the programme', () => {
  const onSand = facts({ beachRoom: 160 });
  const beachView = programmeView(onSand, 'beach');

  it('opens a beach tab after the stages, with only the fireworks on it', () => {
    expect(programmeView(facts(), null).sites.map((site) => site.label)).toEqual([
      'Coral Stage',
      'Kids club',
    ]);
    expect(beachView.sites.map((site) => site.label)).toEqual([
      'Coral Stage',
      'Kids club',
      'Beach',
    ]);
    expect(beachView.site).toMatchObject({ key: 'beach', capacity: 160 });
    expect(cardsOf(onSand, 'beach', 'morning')).toEqual([]);
    expect(cardsOf(onSand, 'beach', 'afternoon')).toEqual([]);
    expect(cardsOf(onSand, 'beach', 'evening').map((card) => card.kind)).toEqual(['fireworks']);
    const onStage = cardsOf(onSand, 'kids-club#0', 'evening').map((card) => card.kind);
    expect(onStage).not.toContain('fireworks');
  });

  it('offers three sizes at rising fees, free in sandbox, and says which the money will not reach', () => {
    const [fireworks] = cardsOf(onSand, 'beach', 'evening');
    expect(fireworks!.tiers!.map((tier) => [tier.label, tier.fee, tier.warning])).toEqual([
      ['Small', '400 a show', null],
      ['Medium', '900 a show', null],
      ['Grand', '1,800 a show', 'Not enough money'],
    ]);
    const audiences = fireworks!.tiers!.map((tier) => tier.audience);
    expect(audiences).toEqual(audiences.toSorted((a, b) => a - b));
    const free = cardsOf({ ...onSand, mode: 'sandbox' }, 'beach', 'evening')[0]!;
    expect(free.tiers!.map((tier) => tier.fee)).toEqual(['Free', 'Free', 'Free']);
  });

  it('names a booked show by its size', () => {
    const programme = booked({
      kind: 'fireworks',
      site: { kind: 'beach' },
      start: 22 * HOUR,
      tier: 'grand',
    });
    const view = programmeView({ ...onSand, programme }, 'beach');
    expect(view.days[0]!.parts.evening.map((chip) => chip.label)).toEqual(['Grand fireworks']);
    expect(view.upcoming[0]).toMatchObject({ label: 'Grand fireworks', site: 'Beach' });
  });
});
