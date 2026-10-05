import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { createNeeds } from '../../sim/domain/needs';
import { shelterOf, type Venue } from '../../sim/domain/venues';
import { isOpenIn, weatherEffect, type Weather } from '../../sim/domain/weather';
import { EVENT_KINDS } from './catalogue';
import {
  advanceEvents,
  bookedVenues,
  callOffRun,
  createEvents,
  createPartyRuns,
  endRun,
  entertain,
  indexParties,
  inviteAudience,
  isUpLate,
  markParty,
  peopleThere,
  QUIET_BEFORE,
  runOfVisit,
  saltOf,
  stayOf,
  visitLitter,
  type EventFacts,
  type EventRun,
  type EventsState,
} from './eventRuns';
import {
  book,
  BUILT_INS,
  EMPTY_PROGRAMME,
  siteKey,
  withBuiltIns,
  type BookingDraft,
  type EventSite,
} from './programme';
import { siteVenueOf } from './sites';
import { partiesOf } from './audience';
import { tickAt } from './week';

const HOUR = 60;
const STAGE: EventSite = { kind: 'stage', venue: 'beach-club#0' };

const stage = (key: string, shelter: 'open' | 'covered'): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.5 }],
  capacity: 25,
  dwellSeconds: { min: 60, max: 120 },
  shelter,
  stage: true,
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 2,
  tilesZ: 2,
  doors: [],
});

const VENUES = [stage('kids-club#0', 'covered'), stage('beach-club#0', 'open')];

const facts = (over: Partial<EventFacts> = {}): EventFacts => ({
  mode: 'tycoon',
  weatherOn: () => 'clear',
  hasSite: (site) => siteVenueOf(site, VENUES) >= 0,
  siteOpen: (site, weather) =>
    siteVenueOf(site, VENUES) >= 0 &&
    !(site.kind === 'stage' && site.venue === STAGE.venue && weather === 'rain'),
  hostOnDuty: true,
  canPay: () => true,
  ...over,
});

const stateWith = (...drafts: Partial<BookingDraft>[]): EventsState => {
  const state = createEvents(40);
  for (const over of drafts) {
    const draft: BookingDraft = {
      kind: 'live-music',
      site: STAGE,
      repeat: { every: 'day' },
      start: 20 * HOUR,
      ...over,
    };
    state.programme = book(state.programme, draft, 0).programme;
  }
  return state;
};

const run = (state: EventsState, from: number, to: number, given = facts()) => {
  const advance = advanceEvents(state, from, to, given);
  state.programme = advance.programme;
  state.runs = advance.runs;
  return advance.steps;
};

const kinds = (steps: readonly { kind: string }[]) => steps.map((step) => step.kind);

const start = tickAt(2, 20 * HOUR);

describe('advanceEvents', () => {
  it('announces an hour before the start', () => {
    const state = stateWith({});
    expect(run(state, start - 72, start - 61)).toEqual([]);
    const steps = run(state, start - 60, start - 49);
    expect(kinds(steps)).toEqual(['announce']);
    expect(state.runs[0]!.phase).toBe('announced');
    expect(run(state, start - 48, start - 37)).toEqual([]);
  });

  it('salts a run by its occurrence alone, so its audience can be told before it is announced', () => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    const [announced] = state.runs;
    expect(announced!.salt).toBe(saltOf(announced!.occurrence));
    expect(saltOf({ ...announced!.occurrence, day: 3 })).not.toBe(announced!.salt);
  });

  it('puts fireworks off to tomorrow when the open beach is shut, and holds them in a heatwave', () => {
    const beach = { ...stage('beach', 'open'), stage: false };
    const sand = [...VENUES, beach];
    const onSand = facts({
      hasSite: (site) => siteVenueOf(site, sand) >= 0,
      siteOpen: (site, weather) => {
        const venue = sand[siteVenueOf(site, sand)];
        return venue !== undefined && isOpenIn(shelterOf(venue), weatherEffect(weather));
      },
    });
    const booked = { kind: 'fireworks', site: { kind: 'beach' }, start: 22 * HOUR } as const;
    const night = tickAt(2, 22 * HOUR);
    for (const weather of ['rain', 'storm'] as const) {
      const state = stateWith(booked);
      const steps = run(state, night - 60, night - 60, { ...onSand, weatherOn: () => weather });
      expect(steps).toMatchObject([{ kind: 'postpone', day: 3 }]);
    }
    const hot = stateWith(booked);
    expect(
      kinds(run(hot, night - 60, night - 60, { ...onSand, weatherOn: () => 'heatwave' })),
    ).toEqual(['announce']);
  });

  it('charges the fee at the start', () => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    const steps = run(state, start - 5, start + 6);
    expect(steps).toEqual([{ kind: 'start', run: state.runs[0], fee: 150 }]);
    expect(state.runs[0]!.paid).toBe(150);
  });

  it('ends after the duration', () => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    run(state, start, start);
    expect(run(state, start + 1, start + 88)).toEqual([]);
    expect(kinds(run(state, start + 89, start + 90))).toEqual(['end']);
    expect(state.runs).toEqual([]);
  });

  it('calls off in the rain, refunding only what was paid', () => {
    const before = stateWith({});
    expect(run(before, start - 60, start - 60, facts({ weatherOn: () => 'rain' }))).toMatchObject([
      { kind: 'call-off', reason: 'weather', run: null, refund: 0 },
    ]);
    const during = stateWith({});
    run(during, start - 60, start - 60);
    run(during, start, start);
    const steps = run(during, start + 30, start + 30, facts({ weatherOn: () => 'rain' }));
    expect(steps).toMatchObject([{ kind: 'call-off', reason: 'weather', refund: 150 }]);
    expect(during.runs).toEqual([]);
  });

  it('calls an open-air kind off in rain even on a covered stage', () => {
    const state = stateWith({
      kind: 'cinema',
      site: { kind: 'stage', venue: 'kids-club#0' },
      start: 21.5 * HOUR,
    });
    const announce = tickAt(2, 20.5 * HOUR);
    expect(
      kinds(run(state, announce, announce, facts({ weatherOn: () => 'storm' as Weather }))),
    ).toEqual(['call-off']);
  });

  it('postpones a kind whose rule is to postpone', () => {
    const state = stateWith({ repeat: { every: 'once', day: 2 } });
    const original = EVENT_KINDS['live-music'].weather;
    (EVENT_KINDS['live-music'] as { weather: string }).weather = 'postpone';
    try {
      const steps = run(
        state,
        start - 60,
        start - 60,
        facts({ weatherOn: (day) => (day === 2 ? 'rain' : 'clear') }),
      );
      expect(steps).toMatchObject([{ kind: 'postpone', day: 3 }]);
      expect(state.programme.bookings[0]!.repeat).toEqual({ every: 'once', day: 3 });
    } finally {
      (EVENT_KINDS['live-music'] as { weather: string }).weather = original;
    }
  });

  it('calls an animator kind off with nobody on duty', () => {
    const state = stateWith({ kind: 'dance-night', start: 21 * HOUR });
    const announce = tickAt(2, 20 * HOUR);
    expect(run(state, announce, announce, facts({ hostOnDuty: false }))).toMatchObject([
      { kind: 'call-off', reason: 'no-host' },
    ]);
  });

  it('calls off an act the resort cannot pay, but never in free play', () => {
    const broke = stateWith({});
    run(broke, start - 60, start - 60);
    expect(run(broke, start, start, facts({ canPay: () => false }))).toMatchObject([
      { kind: 'call-off', reason: 'unpaid', refund: 0 },
    ]);
    const free = stateWith({});
    const sandbox = facts({ mode: 'sandbox', canPay: (fee) => fee <= 0 });
    run(free, start - 60, start - 60, sandbox);
    expect(run(free, start, start, sandbox)).toMatchObject([{ kind: 'start', fee: 0 }]);
  });

  it('ends an event the clock jumped right past, without starting it', () => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    expect(kinds(run(state, start + 100, start + 100))).toEqual(['end']);
  });

  it('calls off a running event whose stage is gone', () => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    run(state, start, start);
    const gone = facts({ hasSite: () => false, siteOpen: () => false });
    expect(run(state, start + 1, start + 1, gone)).toMatchObject([
      { kind: 'call-off', reason: 'no-site', refund: 0 },
    ]);
  });
});

describe('a welcome in the weather', () => {
  const KIDS: EventSite = { kind: 'stage', venue: 'kids-club#0' };
  const HALL: EventSite = { kind: 'stage', venue: 'game-hall#0' };
  const venues = [...VENUES, stage(HALL.venue, 'covered')];
  const rainy = (over: Partial<EventFacts> = {}): EventFacts =>
    facts({
      weatherOn: () => 'rain',
      hasSite: (site) => siteVenueOf(site, venues) >= 0,
      siteOpen: (site, weather) =>
        siteVenueOf(site, venues) >= 0 && !(siteKey(site) === STAGE.venue && weather === 'rain'),
      stages: [STAGE, KIDS, HALL],
      ...over,
    });
  const welcomed = (...drafts: Partial<BookingDraft>[]): EventsState => {
    const state = stateWith(...drafts);
    state.programme = withBuiltIns(state.programme, BUILT_INS, [STAGE.venue]);
    return state;
  };
  const announce = tickAt(2, 9 * HOUR);

  it('moves to the first covered stage, says where from, and plays there', () => {
    const state = welcomed();
    const steps = run(state, announce, announce, rainy());
    expect(steps).toMatchObject([{ kind: 'announce', movedFrom: STAGE }]);
    expect(state.runs[0]!.occurrence.site).toEqual(KIDS);
    expect(state.programme.bookings[0]!.site).toEqual(STAGE);
    expect(kinds(run(state, announce + 60, announce + 60, rainy()))).toEqual(['start']);
  });

  // No booked kind starts this early, so a run held over on that stage stands in for one.
  it('skips a stage with something on it too close to the meeting', () => {
    const state = welcomed();
    const held = tickAt(2, 11 * HOUR);
    state.runs.push({
      occurrence: { booking: 9, kind: 'bingo', site: KIDS, day: 2, start: held, end: held + 60 },
      phase: 'announced',
      parties: [],
      attended: new Set(),
      paid: 0,
      salt: 1,
    });
    run(state, announce, announce, rainy());
    expect(state.runs.find((each) => each.occurrence.kind === 'welcome')?.occurrence.site).toEqual(
      HALL,
    );
  });

  it('is called off for the weather with no stage free', () => {
    const state = welcomed();
    const steps = run(state, announce, announce, rainy({ stages: [STAGE] }));
    expect(steps).toMatchObject([{ kind: 'call-off', reason: 'weather', run: null }]);
    expect(state.runs).toEqual([]);
  });

  it('is called off as having no site when its stage is gone', () => {
    const state = welcomed();
    const gone = rainy({
      weatherOn: () => 'clear',
      hasSite: (site) => siteKey(site) !== STAGE.venue,
    });
    expect(run(state, announce, announce, gone)).toMatchObject([
      { kind: 'call-off', reason: 'no-site' },
    ]);
  });

  it('never moves a kind whose rule is to cancel', () => {
    const state = stateWith({});
    expect(run(state, start - 60, start - 60, rainy())).toMatchObject([
      { kind: 'call-off', reason: 'weather' },
    ]);
  });
});

describe('bookedVenues', () => {
  it('keeps the stage quiet from before the start to the end', () => {
    const state = stateWith({});
    const into = new Uint8Array(VENUES.length);
    bookedVenues(state.runs, state.programme, VENUES, start - QUIET_BEFORE - 1, into);
    expect([...into]).toEqual([0, 0]);
    bookedVenues(state.runs, state.programme, VENUES, start - QUIET_BEFORE, into);
    expect([...into]).toEqual([0, 1]);
    bookedVenues(state.runs, state.programme, VENUES, start + 89, into);
    expect([...into]).toEqual([0, 1]);
    bookedVenues(state.runs, state.programme, VENUES, start + 90, into);
    expect([...into]).toEqual([0, 0]);
  });
});

describe('the audience', () => {
  const homes: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 100 }];
  const guests = createGuests({ count: 20, homes, variants: 4, childVariant: 3, seed: 3 });

  const running = (): { state: EventsState; current: EventRun } => {
    const state = stateWith({});
    run(state, start - 60, start - 60);
    run(state, start, start);
    const current = state.runs[0]!;
    current.parties.push(0, 1);
    return { state, current };
  };

  it('cheers only those inside, and remembers them', () => {
    const { state, current } = running();
    const needs = createNeeds(guests, 1);
    const inside = guests.parties[0]!.members[0]!;
    const outside = guests.parties[1]!.members[0]!;
    const before = [needs.level.fun[inside]!, needs.level.fun[outside]!];
    needs.level.fun[inside] = 0.2;
    entertain(
      state,
      needs,
      guests,
      (person, venue) => person === inside && venue === 1,
      () => 1,
      0.5,
    );
    expect(needs.level.fun[inside]).toBeCloseTo(0.2 + 0.4 * 0.5);
    expect(needs.level.fun[outside]).toBe(before[1]);
    expect([...current.attended]).toEqual([inside]);
  });

  it('keeps the invited up and inside until the end', () => {
    const { state } = running();
    const venueOf = (each: EventRun) => siteVenueOf(each.occurrence.site, VENUES);
    expect(stayOf(state, 0, 1, venueOf)).toBe(start + 90);
    expect(stayOf(state, 0, 0, venueOf)).toBe(-1);
    expect(stayOf(state, 2, 1, venueOf)).toBe(-1);
    expect(isUpLate(state, 1)).toBe(true);
    expect(isUpLate(state, 2)).toBe(false);
    expect(isUpLate(createEvents(1), 0)).toBe(false);
    expect(EMPTY_PROGRAMME.bookings).toEqual([]);
  });

  it('indexes by party what stayOf and isUpLate answer', () => {
    const { state } = running();
    const venueOf = (each: EventRun) => siteVenueOf(each.occurrence.site, VENUES);
    const index = createPartyRuns(4);
    index.end[3] = 7;
    indexParties(state.runs, venueOf, index);
    for (let party = 0; party < 4; party++) {
      expect(index.end[party]! >= 0).toBe(isUpLate(state, party));
      for (const venue of [0, 1]) {
        const stay = index.venue[party] === venue ? index.end[party] : -1;
        expect(stay).toBe(stayOf(state, party, venue, venueOf));
      }
    }
    markParty(index, 9, 100, 1);
    expect(index.end).toHaveLength(4);
  });
});

describe('a run from start to end', () => {
  const homes: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 100 }];
  const guests = createGuests({ count: 30, homes, variants: 4, childVariant: 3, seed: 3 });
  const venueOf = (each: EventRun) => siteVenueOf(each.occurrence.site, VENUES);

  const announced = (): { state: EventsState; current: EventRun } => {
    const state = stateWith({ kind: 'dance-night', start: 21 * HOUR });
    run(state, tickAt(2, 20 * HOUR), tickAt(2, 20 * HOUR));
    return { state, current: state.runs[0]! };
  };

  const ask = (
    room: number,
    invited: number[],
    there: (person: number) => boolean = () => false,
  ) => ({
    guests,
    room,
    free: () =>
      partiesOf(
        guests,
        () => true,
        () => 0,
      ),
    isThere: there,
    invite: (person: number) => {
      invited.push(person);
      return true;
    },
  });

  it('invites whole parties into the room, and counts those already on their way', () => {
    const { state, current } = announced();
    const invited: number[] = [];
    inviteAudience(state, current, ask(12, invited));
    const people = current.parties.reduce(
      (sum, party) => sum + guests.parties[party]!.members.length,
      0,
    );
    expect(current.parties.length).toBeGreaterThan(0);
    expect(people).toBeLessThanOrEqual(12);
    expect(invited).toHaveLength(current.parties.length);
    const before = [...current.parties];
    inviteAudience(state, current, ask(people, invited));
    expect(current.parties).toEqual(before);
    inviteAudience(
      state,
      current,
      ask(people + 20, invited, () => true),
    );
    expect(current.parties.length).toBeGreaterThan(before.length);
    expect(new Set(current.parties).size).toBe(current.parties.length);
    const other = { ...current, parties: [], salt: current.salt + 1 };
    state.runs.push(other);
    inviteAudience(state, other, ask(1000, invited));
    expect(other.parties.some((party) => current.parties.includes(party))).toBe(false);
  });

  it('lifts and tires the audience of a late show, praising only those who watched', () => {
    const { state, current } = announced();
    run(state, tickAt(2, 21 * HOUR), tickAt(2, 21 * HOUR));
    current.parties.push(0, 1);
    const watcher = guests.parties[1]!.members[0]!;
    current.attended.add(watcher);
    const ended = endRun(state, current, guests, () => 0);
    expect(ended.people).toEqual([watcher]);
    expect(ended.tally).toEqual({ held: 1, audience: 1, called: 0 });
    expect(state.glow[watcher]).toBeCloseTo(EVENT_KINDS['dance-night'].lift);
    expect([...state.tired]).toEqual([1]);
    expect(current.parties).toEqual([]);
  });

  it('has fireworks remembered by their watchers, less for a second show, and counted', () => {
    const state = createEvents(guests.count);
    const first = guests.parties[1]!.members[0]!;
    const again = guests.parties[2]!.members[0]!;
    const fireworks: EventRun = {
      occurrence: {
        booking: 4,
        kind: 'fireworks',
        site: { kind: 'beach' },
        day: 2,
        start: tickAt(2, 22 * HOUR),
        end: tickAt(2, 22.5 * HOUR),
        tier: 'grand',
      },
      phase: 'running',
      parties: [1, 2],
      attended: new Set([first, again]),
      paid: 1_800,
      salt: 1,
    };
    const remembered = new Map<number, number>();
    const ended = endRun(
      state,
      fireworks,
      guests,
      (person) => (person === again ? 1 : 0),
      (person, amount) => remembered.set(person, amount),
    );
    expect(ended.tally).toEqual({ held: 1, audience: 2, called: 0, fireworks: 1 });
    expect(remembered.get(first)).toBeCloseTo(0.08);
    expect(remembered.get(again)).toBeCloseTo(0.032);
  });

  it('counts the invited already there', () => {
    const { current } = announced();
    current.parties.push(1, 2);
    const there = new Set([guests.parties[1]!.members[0]!, guests.parties[2]!.members[0]!, 59]);
    expect(peopleThere(current, guests, (person) => there.has(person))).toBe(2);
  });

  it('holds nothing for a show that never started, and tells the invited when it is off', () => {
    const { state, current } = announced();
    current.parties.push(2);
    expect(endRun(state, { ...current, parties: [2] }, guests, () => 0).tally.held).toBe(0);
    const told = callOffRun(
      {
        kind: 'call-off',
        occurrence: current.occurrence,
        reason: 'weather',
        run: current,
        refund: 0,
      },
      guests,
    );
    expect(told.people).toEqual(guests.parties[2]!.members);
    expect(told.tally).toEqual({ held: 0, audience: 0, called: 1 });
    expect(current.parties).toEqual([]);
  });

  it('knows the event a visit was made to, and lets its litter fall', () => {
    const { state, current } = announced();
    current.parties.push(4);
    current.attended.add(29);
    expect(runOfVisit(state, 4, 0, 1, venueOf)).toBe(current);
    expect(runOfVisit(state, 5, 29, 1, venueOf)).toBe(current);
    expect(runOfVisit(state, 5, 0, 1, venueOf)).toBeNull();
    expect(runOfVisit(state, 4, 0, 0, venueOf)).toBeNull();
    expect(visitLitter(current, 0.1)).toBe(EVENT_KINDS['dance-night'].litter);
    expect(visitLitter(current, 0.9)).toBe(0.9);
    expect(visitLitter(null, 0.1)).toBe(0.1);
  });
});
