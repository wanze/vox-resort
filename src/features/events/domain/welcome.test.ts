import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import type { Venue } from '../../sim/domain/venues';
import { EVENT_KINDS } from './catalogue';
import { createEvents, inviteAudience, type EventRun, type Invitation } from './eventRuns';
import { BUILT_INS, EMPTY_PROGRAMME, switchBuiltIn, withBuiltIns } from './programme';
import { tickAt } from './week';
import {
  LATE_CALL_CUTOFF,
  latecomersFor,
  stageRank,
  stagesByPreference,
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

describe('the stage the welcome prefers', () => {
  it('puts the biggest stage first, and breaks ties by key', () => {
    const venues = [
      stage('playground#0', 25),
      stage('open-air-stage#0', 80),
      stage('beach-club#0', 25),
    ];
    expect(stagesByPreference(venues)).toEqual([
      { kind: 'stage', venue: 'open-air-stage#0' },
      { kind: 'stage', venue: 'beach-club#0' },
      { kind: 'stage', venue: 'playground#0' },
    ]);
    const rank = stageRank(venues);
    expect([rank('open-air-stage#0'), rank('beach-club#0'), rank('gone#0')]).toEqual([
      -80, -25, -0,
    ]);
  });
});

describe('welcomeGapOf', () => {
  it('names why no welcome was held, and nothing when one was', () => {
    const programme = withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, ['beach-club#0']);
    const off = switchBuiltIn(programme, 1, false);
    const day = { programme, stages: 1, held: false, called: false };
    expect(welcomeGapOf({ ...day, held: true })).toBeNull();
    expect(welcomeGapOf({ ...day, stages: 0 })).toBe('no-stage');
    expect(welcomeGapOf({ ...day, programme: off })).toBe('off');
    expect(welcomeGapOf({ ...day, called: true })).toBe('called-off');
    expect(withoutBuiltIns(programme).bookings).toEqual([]);
    expect(withoutBuiltIns(EMPTY_PROGRAMME)).toBe(EMPTY_PROGRAMME);
  });
});
