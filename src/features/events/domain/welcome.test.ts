import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { Venue } from '../../sim/domain/venues';
import { EVENT_KINDS } from './catalogue';
import { createEvents, inviteAudience, type EventRun, type Invitation } from './eventRuns';
import { partiesOf } from './audience';
import {
  BUILT_INS,
  EMPTY_PROGRAMME,
  switchBuiltIn,
  withBuiltIns,
  withCeremony,
  type Occurrence,
} from './programme';
import { tickAt } from './week';
import {
  groupCallFor,
  LATE_CALL_CUTOFF,
  latecomersFor,
  shelterSitesOf,
  welcomeGapOf,
  withoutBuiltIns,
  type LateCall,
} from './welcome';

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 200 }];
const guests = createGuests({ count: 80, homes: HOMES, variants: 4, childVariant: 3, seed: 4 });
const NEWCOMERS = Array.from({ length: guests.parties.length }, (_, index) => index).filter(
  (index) => index % 2 === 0,
);
const START = tickAt(3, 10 * 60);
for (const party of NEWCOMERS) {
  for (const person of guests.parties[party]!.members) guests.arrivedOn[person] = 2;
}

const runOf = (): EventRun => ({
  occurrence: {
    booking: 1,
    kind: 'welcome',
    site: { kind: 'stage', venue: 'beach-club#0' },
    day: 3,
    start: START,
    end: START + 60,
  },
  phase: 'running',
  parties: [],
  attended: new Set(),
  paid: 0,
  salt: 1234,
});

const call = (over: Partial<LateCall> = {}): LateCall => ({
  run: runOf(),
  kind: EVENT_KINDS.welcome,
  newcomers: NEWCOMERS,
  guests,
  isFree: () => true,
  urgency: () => 0,
  now: START + 10,
  ...over,
});

const invitation = (free: Invitation['free'], room: number): Invitation => ({
  guests,
  room,
  free,
  isThere: () => false,
  invite: () => true,
});

const stage = (key: string, capacity: number): Venue =>
  ({ key, label: key, capacity, stage: true }) as Venue;

describe('latecomersFor', () => {
  it('offers the newcomers not yet on the run', () => {
    const run = runOf();
    run.parties.push(NEWCOMERS[0]!, NEWCOMERS[1]!);
    const offered = latecomersFor(call({ run })).map((party) => party.party);
    expect(offered).toEqual(NEWCOMERS.slice(2));
  });

  it('offers nobody once it is too late to walk over', () => {
    const run = runOf();
    expect(
      latecomersFor(call({ run, now: run.occurrence.end - LATE_CALL_CUTOFF - 1 })),
    ).not.toEqual([]);
    expect(latecomersFor(call({ run, now: run.occurrence.end - LATE_CALL_CUTOFF }))).toEqual([]);
  });

  it('offers nobody for a kind that does not call latecomers', () => {
    expect(latecomersFor(call({ kind: EVENT_KINDS['dance-night'] }))).toEqual([]);
  });

  it('never invites more than the room', () => {
    const state = createEvents(guests.party.length);
    const run = runOf();
    state.runs.push(run);
    inviteAudience(
      state,
      run,
      invitation(() => latecomersFor(call({ run })), 9),
    );
    const people = run.parties.reduce(
      (sum, party) => sum + guests.parties[party]!.members.length,
      0,
    );
    expect(run.parties.length).toBeGreaterThan(0);
    expect(people).toBeLessThanOrEqual(9);
  });

  it('answers the same on the next frame, so a party that was not keen stays away', () => {
    const state = createEvents(guests.party.length);
    const run = runOf();
    state.runs.push(run);
    inviteAudience(
      state,
      run,
      invitation(() => latecomersFor(call({ run })), 1000),
    );
    const first = [...run.parties];
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(NEWCOMERS.length);
    inviteAudience(
      state,
      run,
      invitation(() => latecomersFor(call({ run, now: START + 20 })), 1000),
    );
    expect(run.parties).toEqual(first);
  });
});

describe('where the weather moves a show', () => {
  it('tries every stage, the biggest first and ties by key, then the lobbies', () => {
    const venues = [
      stage('playground#0', 25),
      { ...stage('reception#0', 12), stage: false, receives: true, lobby: 24 },
      stage('open-air-stage#0', 80),
      stage('beach-club#0', 25),
    ];
    expect(shelterSitesOf(venues)).toEqual([
      { kind: 'stage', venue: 'open-air-stage#0' },
      { kind: 'stage', venue: 'beach-club#0' },
      { kind: 'stage', venue: 'playground#0' },
      { kind: 'lobby', venue: 'reception#0' },
    ]);
  });
});

describe('welcomeGapOf', () => {
  it('names why no welcome was held, and nothing when one was', () => {
    const programme = withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, [
      { kind: 'stage', venue: 'beach-club#0' },
    ]);
    const off = switchBuiltIn(programme, 1, false);
    const day = { programme, sites: 1, held: false, called: false };
    expect(welcomeGapOf({ ...day, held: true })).toBeNull();
    expect(welcomeGapOf({ ...day, sites: 0 })).toBe('no-stage');
    expect(welcomeGapOf({ ...day, programme: off })).toBe('off');
    expect(welcomeGapOf({ ...day, called: true })).toBe('called-off');
    expect(withoutBuiltIns(programme).bookings).toEqual([]);
    expect(withoutBuiltIns(EMPTY_PROGRAMME)).toBe(EMPTY_PROGRAMME);
  });
});

const runOn = (occurrence: Occurrence): EventRun => ({
  occurrence,
  phase: 'announced',
  parties: [],
  attended: new Set(),
  paid: 0,
  salt: 99,
});

describe('a group’s ceremony', () => {
  const GROUP = [0, 1, 2, 3];
  const groupOf = (party: number): number | undefined => (GROUP.includes(party) ? 7 : undefined);
  const free = () =>
    partiesOf(
      guests,
      () => true,
      () => 0,
      groupOf,
    );
  const START_AT = tickAt(3, 15 * 60);
  const ceremony: Occurrence = {
    booking: 1,
    kind: 'wedding',
    site: { kind: 'stage', venue: 'stage-plaza#0' },
    day: 3,
    start: START_AT,
    end: START_AT + 60,
    group: 7,
  };
  const { group: _group, ...open } = ceremony;

  it('invites its own group alone, every party while there is room', () => {
    const state = createEvents(guests.count);
    const run = runOn(ceremony);
    inviteAudience(state, run, invitation(free, 1000));
    expect(run.parties.toSorted((a, b) => a - b)).toEqual(GROUP);
  });

  it('keeps its group from another show then, and leaves the rest to it', () => {
    const state = createEvents(guests.count);
    state.programme = withCeremony(EMPTY_PROGRAMME, {
      group: 7,
      day: 3,
      site: ceremony.site,
      start: 15 * 60,
    });
    const ordinary: Occurrence = {
      ...open,
      booking: 2,
      kind: 'afternoon-jazz',
      site: { kind: 'stage', venue: 'beach-club#0' },
    };
    const show = runOn(ordinary);
    inviteAudience(state, show, invitation(free, 1000));
    expect(show.parties.length).toBeGreaterThan(0);
    expect(show.parties.some((party) => GROUP.includes(party))).toBe(false);
    const later = runOn({ ...ordinary, start: START_AT + 4 * 60, end: START_AT + 5 * 60 });
    inviteAudience(state, later, invitation(free, 1000));
    expect(later.parties.some((party) => GROUP.includes(party))).toBe(true);
  });

  it('calls the parties of its group not yet asked, until it is too late to walk over', () => {
    const run = runOn(ceremony);
    run.parties.push(0);
    const asked = (now: number) =>
      groupCallFor({ run, parties: GROUP, guests, isFree: () => true, urgency: () => 0, now }).map(
        (party) => [party.party, party.group],
      );
    expect(asked(START_AT)).toEqual([
      [1, 7],
      [2, 7],
      [3, 7],
    ]);
    expect(asked(ceremony.end - LATE_CALL_CUTOFF)).toEqual([]);
    expect(
      groupCallFor({
        run: runOn(open),
        parties: GROUP,
        guests,
        isFree: () => true,
        urgency: () => 0,
        now: START_AT,
      }),
    ).toEqual([]);
  });
});
