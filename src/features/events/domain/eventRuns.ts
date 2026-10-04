import type { Guests } from '../../guests/domain/guests';
import type { EventTally } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { cheer, type Needs } from '../../sim/domain/needs';
import { SHOW_TICKS } from '../../sim/domain/staffRouter';
import type { Venue } from '../../sim/domain/venues';
import { isOpenIn, weatherEffect, type Weather } from '../../sim/domain/weather';
import { mix } from '../../sim/domain/night';
import { pickAudience } from './audience';
import {
  EVENT_KINDS,
  feeOf,
  liftFor,
  runsLate,
  type AudienceParty,
  type EventKind,
} from './catalogue';
import { glowOn } from './glow';
import {
  ANNOUNCE_LEAD,
  CHANGEOVER,
  dropPast,
  EMPTY_PROGRAMME,
  eventsDue,
  occurrencesOn,
  postponed,
  siteKey,
  type EventSite,
  type Occurrence,
  type Programme,
} from './programme';
import { siteVenueOf } from './sites';
import { dayAt, minuteOf } from './week';

// No spontaneous show begins on a booked stage this long before the start: the longest show
// would still be on when the booked one begins.
export const QUIET_BEFORE = SHOW_TICKS.max;

export interface EventRun {
  readonly occurrence: Occurrence;
  phase: 'announced' | 'running';
  readonly parties: number[];
  readonly attended: Set<number>;
  paid: number;
  readonly salt: number;
}

export interface EventsState {
  programme: Programme;
  runs: EventRun[];
  // Per person: the happiness an event lifts the target by, fading over the next day.
  readonly glow: Float32Array;
  // Parties kept up past ten, who wake the worse for it.
  readonly tired: Set<number>;
}

export type CallOff = 'weather' | 'no-host' | 'unpaid' | 'no-site';

export type EventStep =
  | { readonly kind: 'announce'; readonly run: EventRun; readonly movedFrom?: EventSite }
  | { readonly kind: 'start'; readonly run: EventRun; readonly fee: number }
  | { readonly kind: 'end'; readonly run: EventRun }
  | {
      readonly kind: 'call-off';
      readonly occurrence: Occurrence;
      readonly reason: CallOff;
      readonly run: EventRun | null;
      readonly refund: number;
    }
  | { readonly kind: 'postpone'; readonly occurrence: Occurrence; readonly day: number };

export interface EventFacts {
  readonly mode: GameMode;
  weatherOn(day: number): Weather;
  hasSite(site: EventSite): boolean;
  // False for a site with no venue.
  siteOpen(site: EventSite, weather: Weather): boolean;
  readonly hostOnDuty: boolean;
  canPay(fee: number): boolean;
  // In order of preference, for a kind that shelters from the weather.
  readonly stages?: readonly EventSite[];
}

export interface EventAdvance {
  readonly programme: Programme;
  readonly runs: EventRun[];
  readonly steps: readonly EventStep[];
}

export function createEvents(people: number): EventsState {
  return { programme: EMPTY_PROGRAMME, runs: [], glow: new Float32Array(people), tired: new Set() };
}

export const kindOf = (occurrence: Occurrence): EventKind => EVENT_KINDS[occurrence.kind];

function saltOf(occurrence: Occurrence): number {
  return mix(
    Math.imul(occurrence.booking, 0x2545_f491) ^ Math.imul(occurrence.day + 1, 0x9e37_79b1),
  );
}

const rains = (weather: Weather): boolean => !isOpenIn('open', weatherEffect(weather));

function playable(occurrence: Occurrence, facts: EventFacts): boolean {
  const weather = facts.weatherOn(occurrence.day);
  return (
    facts.siteOpen(occurrence.site, weather) && !(kindOf(occurrence).openAir && rains(weather))
  );
}

const sameOccurrence = (a: Occurrence, b: Occurrence): boolean =>
  a.booking === b.booking && a.day === b.day;

function callOff(
  occurrence: Occurrence,
  reason: CallOff,
  run: EventRun | null,
  refund = 0,
): EventStep {
  return { kind: 'call-off', occurrence, reason, run, refund };
}

// Null keeps the run going with nothing to say this frame.
function stepOf(run: EventRun, to: number, facts: EventFacts): EventStep | null {
  const { occurrence } = run;
  if (!facts.hasSite(occurrence.site)) return callOff(occurrence, 'no-site', run);
  if (!playable(occurrence, facts)) return callOff(occurrence, 'weather', run, run.paid);
  if (occurrence.end <= to) return { kind: 'end', run };
  if (run.phase !== 'announced' || occurrence.start > to) return null;
  const fee = feeOf(kindOf(occurrence), occurrence.tier, facts.mode);
  if (!facts.canPay(fee)) return callOff(occurrence, 'unpaid', run);
  run.phase = 'running';
  run.paid = fee;
  return { kind: 'start', run, fee };
}

const meets = (a: Occurrence, b: Occurrence): boolean =>
  a.start < b.end + CHANGEOVER && b.start < a.end + CHANGEOVER;

// Neither a booking nor a run may be on the stage then, as the booking's own overlap rule.
function shelterSite(
  occurrence: Occurrence,
  programme: Programme,
  runs: readonly EventRun[],
  facts: EventFacts,
): EventSite | null {
  const booked = siteKey(occurrence.site);
  const others = [
    ...occurrencesOn(programme, occurrence.day),
    ...runs.map((run) => run.occurrence),
  ];
  const free = (site: EventSite): boolean => {
    const key = siteKey(site);
    return (
      key !== booked &&
      facts.hasSite(site) &&
      playable({ ...occurrence, site }, facts) &&
      !others.some((other) => siteKey(other.site) === key && meets(other, occurrence))
    );
  };
  return (facts.stages ?? []).find(free) ?? null;
}

function newRun(occurrence: Occurrence): EventRun {
  return {
    occurrence,
    phase: 'announced',
    parties: [],
    attended: new Set(),
    paid: 0,
    salt: saltOf(occurrence),
  };
}

// The occurrence as it will be held, or the step that says why it will not.
function weathered(
  occurrence: Occurrence,
  programme: Programme,
  runs: readonly EventRun[],
  facts: EventFacts,
): Occurrence | EventStep {
  if (playable(occurrence, facts)) return occurrence;
  const { weather } = kindOf(occurrence);
  if (weather === 'postpone') return { kind: 'postpone', occurrence, day: occurrence.day + 1 };
  const site = weather === 'shelter' ? shelterSite(occurrence, programme, runs, facts) : null;
  return site ? { ...occurrence, site } : callOff(occurrence, 'weather', null);
}

function announced(
  occurrence: Occurrence,
  programme: Programme,
  runs: readonly EventRun[],
  facts: EventFacts,
): EventStep {
  if (!facts.hasSite(occurrence.site)) return callOff(occurrence, 'no-site', null);
  const held = weathered(occurrence, programme, runs, facts);
  if (!('booking' in held)) return held;
  const kind = kindOf(occurrence);
  if (kind.host === 'animator' && !facts.hostOnDuty) return callOff(occurrence, 'no-host', null);
  const run = newRun(held);
  return held.site === occurrence.site
    ? { kind: 'announce', run }
    : { kind: 'announce', run, movedFrom: occurrence.site };
}

export function advanceEvents(
  state: EventsState,
  from: number,
  to: number,
  facts: EventFacts,
): EventAdvance {
  const steps: EventStep[] = [];
  const runs: EventRun[] = [];
  for (const run of state.runs) {
    const step = stepOf(run, to, facts);
    if (step) steps.push(step);
    if (step === null || step.kind === 'start') runs.push(run);
  }

  let programme = dropPast(state.programme, dayAt(from));
  for (const occurrence of eventsDue(programme, from, to, ANNOUNCE_LEAD)) {
    if (state.runs.some((run) => sameOccurrence(run.occurrence, occurrence))) continue;
    const step = announced(occurrence, programme, runs, facts);
    if (step.kind === 'announce') runs.push(step.run);
    if (step.kind === 'postpone') programme = postponed(programme, occurrence);
    steps.push(step);
  }
  return { programme, runs, steps };
}

export function bookedVenues(
  runs: readonly EventRun[],
  programme: Programme,
  venues: readonly Venue[],
  now: number,
  into: Uint8Array,
): void {
  into.fill(0);
  const mark = (site: EventSite): void => {
    const venue = siteVenueOf(site, venues);
    if (venue >= 0 && venue < into.length) into[venue] = 1;
  };
  for (const run of runs) mark(run.occurrence.site);
  for (let day = dayAt(now); day <= dayAt(now + QUIET_BEFORE); day++) {
    for (const occurrence of occurrencesOn(programme, day)) {
      if (occurrence.start - QUIET_BEFORE <= now && now < occurrence.end) mark(occurrence.site);
    }
  }
}

export function showingVenues(
  runs: readonly EventRun[],
  venues: readonly Venue[],
  into: Uint8Array,
): void {
  into.fill(0);
  for (const run of runs) {
    if (run.phase !== 'running') continue;
    const venue = siteVenueOf(run.occurrence.site, venues);
    if (venue >= 0 && venue < into.length) into[venue] = 1;
  }
}

export function hostedShows(
  runs: readonly EventRun[],
  venues: readonly Venue[],
): readonly { readonly venue: number; readonly until: number }[] {
  const hosted: { venue: number; until: number }[] = [];
  for (const run of runs) {
    if (kindOf(run.occurrence).host !== 'animator') continue;
    const venue = siteVenueOf(run.occurrence.site, venues);
    if (venue >= 0) hosted.push({ venue, until: run.occurrence.end });
  }
  return hosted;
}

function cheerInside(
  run: EventRun,
  needs: Needs,
  guests: Guests,
  inside: (person: number) => boolean,
  amount: number,
): void {
  for (const party of run.parties) {
    for (const person of guests.parties[party]?.members ?? []) {
      if (guests.party[person] !== party || !inside(person)) continue;
      cheer(needs, person, amount);
      run.attended.add(person);
    }
  }
}

export function entertain(
  state: EventsState,
  needs: Needs,
  guests: Guests,
  insideAt: (person: number, venue: number) => boolean,
  venueOf: (run: EventRun) => number,
  hours: number,
): void {
  for (const run of state.runs) {
    const venue = run.phase === 'running' ? venueOf(run) : -1;
    if (venue < 0) continue;
    const amount = kindOf(run.occurrence).fun * hours;
    cheerInside(run, needs, guests, (person) => insideAt(person, venue), amount);
  }
}

export function stayOf(
  state: EventsState,
  party: number,
  venue: number,
  venueOf: (run: EventRun) => number,
): number {
  for (const run of state.runs) {
    if (run.parties.includes(party) && venueOf(run) === venue) return run.occurrence.end;
  }
  return -1;
}

export function isUpLate(state: EventsState, party: number): boolean {
  return state.runs.some((run) => run.parties.includes(party));
}

export type CallOffStep = Extract<EventStep, { readonly kind: 'call-off' }>;

export interface Invitation {
  readonly guests: Guests;
  // People, once those inside and in the line are counted.
  readonly room: number;
  // partiesOf, asked once however many shows are announced in a frame.
  readonly free: () => readonly AudienceParty[];
  readonly isThere: (person: number) => boolean;
  readonly invite: (person: number) => boolean;
}

export interface RunOutcome {
  // Who hears of it: the audience praising it, or the invited told it is off.
  readonly people: readonly number[];
  readonly tally: EventTally;
}

const NONE_HELD: EventTally = { held: 0, audience: 0, called: 0 };

const CALLED_OFF: EventTally = { held: 0, audience: 0, called: 1 };

const membersOf = (guests: Guests, party: number): readonly number[] =>
  (guests.parties[party]?.members ?? []).filter(
    (person) => guests.present[person] === 1 && guests.party[person] === party,
  );

const onTheWay = (run: EventRun, invitation: Invitation): number =>
  run.parties.reduce(
    (coming, party) =>
      coming +
      membersOf(invitation.guests, party).filter((person) => !invitation.isThere(person)).length,
    0,
  );

// At the announcement and topped up at the start. A party invited to any show is never asked
// again: it would be sent to the second and still be kept up for the first.
export function inviteAudience(state: EventsState, run: EventRun, invitation: Invitation): void {
  const { guests } = invitation;
  const room = invitation.room - onTheWay(run, invitation);
  if (room <= 0) return;
  const invited = new Set(state.runs.flatMap((each) => each.parties));
  const free = invitation.free().filter((party) => !invited.has(party.party));
  const { occurrence } = run;
  const picked = pickAudience({
    parties: free,
    kind: kindOf(occurrence),
    tier: occurrence.tier,
    day: occurrence.day,
    room,
    salt: run.salt,
  });
  for (const party of picked) {
    const [member] = membersOf(guests, party);
    if (member !== undefined && invitation.invite(member)) run.parties.push(party);
  }
}

// `timesBefore` is asked before anybody hears of this one, so a novelty counts the shows before it.
export function endRun(
  state: EventsState,
  run: EventRun,
  guests: Guests,
  timesBefore: (person: number) => number,
): RunOutcome {
  run.parties.length = 0;
  if (run.phase !== 'running') return { people: [], tally: NONE_HELD };
  const { occurrence } = run;
  const kind = kindOf(occurrence);
  const late = runsLate(kind, minuteOf(occurrence.start));
  const people = [...run.attended].filter((person) => guests.present[person] === 1);
  for (const person of people) {
    glowOn(state.glow, person, liftFor(kind, occurrence.tier, timesBefore(person)));
    if (late) state.tired.add(guests.party[person]!);
  }
  return { people, tally: { held: 1, audience: run.attended.size, called: 0 } };
}

export function callOffRun(step: CallOffStep, guests: Guests): RunOutcome {
  const people = (step.run?.parties ?? []).flatMap((party) => membersOf(guests, party));
  if (step.run) step.run.parties.length = 0;
  return { people, tally: CALLED_OFF };
}

export function runOfVisit(
  state: EventsState,
  party: number,
  person: number,
  venue: number,
  venueOf: (run: EventRun) => number,
): EventRun | null {
  return (
    state.runs.find(
      (run) => venueOf(run) === venue && (run.parties.includes(party) || run.attended.has(person)),
    ) ?? null
  );
}

// The visit to an event leaves its litter where that is more than the venue's.
export const visitLitter = (run: EventRun | null, litter: number): number =>
  run ? Math.max(litter, kindOf(run.occurrence).litter) : litter;
