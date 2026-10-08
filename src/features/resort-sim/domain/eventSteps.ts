import { partiesOf } from '../../events/domain/audience';
import { type AudienceParty, labelOf as eventLabelOf } from '../../events/domain/catalogue';
import {
  type CallOffStep,
  type EventFacts,
  type EventRun,
  type EventStep,
  advanceEvents,
  bookedVenues,
  callOffRun,
  createPartyRuns,
  endRun,
  entertain,
  kindOf as eventKindOf,
  hostedShows,
  indexParties,
  inviteAudience,
  markParty,
  peopleThere,
  showingVenues,
} from '../../events/domain/eventRuns';
import { fadeGlow } from '../../events/domain/glow';
import { heldAt, stageKeysOf } from '../../events/domain/sites';
import { bookingDayKey, keenParties, tonightsShow } from '../../events/domain/stayingUp';
import { latecomersFor } from '../../events/domain/welcome';
import { watchRoom } from '../../fireworks/domain/launch';
import { isFireworksNight } from '../../fireworks/domain/nights';
import { countEvent, countWelcomed, noteWelcomeGap } from '../../sim/domain/dayReport';
import { remember } from '../../sim/domain/happiness';
import { canAfford, record } from '../../sim/domain/ledger';
import { strongestNeed } from '../../sim/domain/needs';
import { stayCount } from '../../sim/domain/thoughts';
import { shelterOf } from '../../sim/domain/venues';
import { type Weather, isOpenIn, weatherEffect, weatherOn } from '../../sim/domain/weather';
import { TICKS_PER_HOUR, type SimNow } from './simNow';
import type { SimState } from './simState';
import { hear, runVenueOf } from './visits';

export const NO_HOSTED: readonly { readonly venue: number; readonly until: number }[] = [];

// 13 because it opens on three clear days; 10 opened day 0, and so every bench run, on rain.
export const WEATHER_SEED = 13;

export const beachIndexOf = (resort: SimState): number =>
  resort.siteVenues.length > resort.venues.length ? resort.venues.length : -1;

// Today's weather is the clock's, which may be pinned; a pinned weather holds every day ahead too.
export function weatherOnDay(clock: SimNow, day: number): Weather {
  if (day === clock.day) return clock.weather;
  return clock.forcedWeather ?? weatherOn(day, WEATHER_SEED);
}

export function eventFactsOf(resort: SimState, clock: SimNow): EventFacts {
  const venues = resort.siteVenues;
  return {
    mode: resort.ledger.mode,
    weatherOn: (day) => weatherOnDay(clock, day),
    hasSite: (site, kind) => heldAt(site, kind, venues) >= 0,
    // The router's own door rule, so an event is called off exactly when its stage is shut.
    siteOpen: (site, weather, kind) => {
      const venue = venues[heldAt(site, kind, venues)];
      return venue !== undefined && isOpenIn(shelterOf(venue), weatherEffect(weather));
    },
    hostOnDuty: resort.roster.animator > 0,
    canPay: (fee) => canAfford(resort.ledger, fee),
    stages: resort.stages,
  };
}

export function refreshEventVenues(resort: SimState, now: number): void {
  const { events, venues } = resort;
  if (resort.eventBooked.length !== venues.length) {
    resort.eventBooked = new Uint8Array(venues.length);
    resort.eventShowing = new Uint8Array(venues.length);
  }
  bookedVenues(events.runs, events.programme, venues, now, resort.eventBooked);
  showingVenues(events.runs, venues, resort.eventShowing);
  resort.hosted = events.runs.length === 0 ? NO_HOSTED : hostedShows(events.runs, venues);
}

function urgencyBesidesFun(resort: SimState, person: number): number {
  const want = strongestNeed(resort.needs, resort.guests, person);
  return want && want.need !== 'fun' ? want.urgency : 0;
}

function freePartiesOf(resort: SimState): () => readonly AudienceParty[] {
  let free: readonly AudienceParty[] | null = null;
  return () =>
    (free ??= partiesOf(
      resort.guests,
      (person) => resort.router.isFree(person),
      (person) => urgencyBesidesFun(resort, person),
    ));
}

// A party resting on the sand is free to watch from where it lies.
function freeOnTheSandOf(resort: SimState): () => readonly AudienceParty[] {
  const { router } = resort;
  let free: readonly AudienceParty[] | null = null;
  return () =>
    (free ??= partiesOf(
      resort.guests,
      (person) => router.isFree(person) || router.stayOf(person) === 'resting',
      (person) => urgencyBesidesFun(resort, person),
    ));
}

function stageRoomOf(resort: SimState, venue: number): number {
  const declared = resort.siteVenues[venue]!;
  const there = resort.router.occupancyOf(declared.key) ?? { inside: 0, waiting: 0 };
  return declared.capacity - there.inside - there.waiting;
}

// The sand's own room on the beach, whose capacity has no door to count at.
function roomAt(resort: SimState, run: EventRun, venue: number): number {
  if (venue !== beachIndexOf(resort)) return stageRoomOf(resort, venue);
  const there = (person: number): boolean => resort.router.venueIndexOf(person) === venue;
  return watchRoom(resort.beachTiles) - peopleThere(run, resort.guests, there);
}

// On the index before the router is asked, so a party invited where it lies is told the end.
function inviteParty(resort: SimState, run: EventRun, person: number, venue: number): boolean {
  const party = resort.guests.party[person]!;
  markParty(resort.invited, party, run.occurrence.end, venue);
  if (resort.router.invite(person, venue)) return true;
  markParty(resort.invited, party, -1, -1);
  return false;
}

function inviteTo(
  resort: SimState,
  run: EventRun,
  free: () => readonly AudienceParty[],
  sand: () => readonly AudienceParty[],
): void {
  const venue = runVenueOf(resort, run);
  if (!resort.siteVenues[venue]) return;
  const { router } = resort;
  inviteAudience(resort.events, run, {
    guests: resort.guests,
    room: roomAt(resort, run, venue),
    free: venue === beachIndexOf(resort) ? sand : free,
    isThere: (person) => router.venueIndexOf(person) === venue,
    invite: (person) => inviteParty(resort, run, person, venue),
  });
}

// Not only twice: a keen party reaching the sand after the start would lie down on a pitch of its
// own, so the sand is asked again on every tick until the end, while there is room.
function topUpTheSand(resort: SimState, sand: () => readonly AudienceParty[]): void {
  const beach = beachIndexOf(resort);
  if (beach < 0) return;
  for (const run of resort.events.runs) {
    if (runVenueOf(resort, run) === beach) inviteTo(resort, run, sand, sand);
  }
}

export function refreshInvited(resort: SimState): void {
  const parties = resort.guests.parties.length;
  if (resort.invited.end.length < parties) resort.invited = createPartyRuns(parties);
  indexParties(resort.events.runs, (run) => runVenueOf(resort, run), resort.invited);
}

// Hourly, at check-in, on a booking and on a load: the keen are those tonight's show will invite.
export function refreshKeen(resort: SimState, clock: SimNow): void {
  const { programme } = resort.events;
  const facts = eventFactsOf(resort, clock);
  resort.keenShow = tonightsShow({
    programme,
    now: clock.ticks,
    open: (site, kind) => facts.siteOpen(site, clock.weather, kind),
    settled: resort.settled,
  });
  resort.fireworksNight = isFireworksNight(programme, clock.day);
  resort.keen = keenParties(resort.guests, resort.keenShow, resort.keen);
}

// The keen go to bed with the show over, whether or not they were ever invited.
function sendTheKeenToBed(resort: SimState, now: number): void {
  if (!resort.keenShow || now < resort.keenShow.end) return;
  resort.keen.fill(0);
  resort.keenShow = null;
}

function endEvent(resort: SimState, run: EventRun, now: number): void {
  const kind = eventKindOf(run.occurrence);
  const ended = endRun(
    resort.events,
    run,
    resort.guests,
    (person) => stayCount(resort.thoughts, person, kind.praise),
    (person, amount) => remember(resort.happiness, person, amount),
  );
  const label = eventLabelOf(kind, run.occurrence.tier);
  for (const person of ended.people) hear(resort, now, person, kind.praise, label);
  resort.today = countEvent(resort.today, ended.tally);
  if (kind.id === 'welcome' && ended.tally.held > 0) {
    resort.today = countWelcomed(resort.today, ended.tally.audience);
  }
}

// Its stage gone only when no stage stands: one pulled down mid-meeting leaves others to use.
function noteWelcomeCalledOff(resort: SimState, step: CallOffStep): void {
  const gone = step.reason === 'no-site' && stageKeysOf(resort.venues).length === 0;
  resort.today = noteWelcomeGap(resort.today, gone ? 'no-stage' : 'called-off');
}

// A built-in left with no stage is the advice's to tell: it would be called off every day.
const quietCallOff = (step: CallOffStep): boolean =>
  step.reason === 'no-site' && eventKindOf(step.occurrence).builtIn === true;

function callOffEvent(resort: SimState, step: CallOffStep, now: number): void {
  const kind = eventKindOf(step.occurrence);
  const label = eventLabelOf(kind, step.occurrence.tier);
  resort.settled.add(bookingDayKey(step.occurrence));
  if (kind.id === 'welcome') noteWelcomeCalledOff(resort, step);
  if (quietCallOff(step)) return;
  resort.ledger = record(resort.ledger, 'events', step.refund);
  const called = callOffRun(step, resort.guests);
  for (const person of called.people) hear(resort, now, person, 'called-off', label);
  resort.today = countEvent(resort.today, called.tally);
}

type StepOf<Kind extends EventStep['kind']> = Extract<EventStep, { readonly kind: Kind }>;

interface StepContext {
  readonly resort: SimState;
  readonly now: number;
  readonly free: () => readonly AudienceParty[];
  readonly sand: () => readonly AudienceParty[];
}

// What each step does to the resort. The rockets are not drawn from here but from the runs, so a
// load or a dragged clock plays the same show.
const EVENT_STEPS: {
  readonly [kind in EventStep['kind']]: (step: StepOf<kind>, context: StepContext) => void;
} = {
  announce: (step, { resort, free, sand }) => inviteTo(resort, step.run, free, sand),
  start: (step, { resort, free, sand }) => {
    resort.ledger = record(resort.ledger, 'events', -step.fee);
    inviteTo(resort, step.run, free, sand);
  },
  end: (step, { resort, now }) => endEvent(resort, step.run, now),
  'call-off': (step, { resort, now }) => callOffEvent(resort, step, now),
  postpone: (step, { resort }) => {
    resort.settled.add(bookingDayKey(step.occurrence));
    resort.today = countEvent(resort.today, { held: 0, audience: 0, called: 0, postponed: 1 });
  },
};

const settles = (step: EventStep): boolean => step.kind === 'call-off' || step.kind === 'postpone';

function applyEventSteps(
  resort: SimState,
  steps: readonly EventStep[],
  now: number,
  sand: () => readonly AudienceParty[],
): void {
  const context: StepContext = { resort, now, free: freePartiesOf(resort), sand };
  for (const step of steps) {
    (EVENT_STEPS[step.kind] as (step: EventStep, context: StepContext) => void)(step, context);
  }
}

// Every frame, as a party comes off the desk free at no particular moment.
function callLatecomers(resort: SimState, now: number, sand: () => readonly AudienceParty[]): void {
  if (resort.newcomers.length === 0) return;
  for (const run of resort.events.runs) {
    const kind = eventKindOf(run.occurrence);
    if (kind.latecomers !== true) continue;
    inviteTo(
      resort,
      run,
      () =>
        latecomersFor({
          run,
          kind,
          newcomers: resort.newcomers,
          guests: resort.guests,
          isFree: (person) => resort.router.isFree(person),
          urgency: (person) => urgencyBesidesFun(resort, person),
          now,
        }),
      sand,
    );
  }
}

// After the routers' ticks: the invitations and the end of a show act on where everybody now is.
export function runEvents(
  resort: SimState,
  clock: SimNow,
  ticks: number,
  heard: (steps: readonly EventStep[]) => void,
): void {
  const { events } = resort;
  const now = clock.ticks;
  const advance = advanceEvents(events, now - ticks + 1, now, eventFactsOf(resort, clock));
  events.programme = advance.programme;
  events.runs = advance.runs;
  // One list a frame for every show on the sand, as for the stages: an invitation changes only
  // the party invited, which inviteAudience leaves out.
  const sand = freeOnTheSandOf(resort);
  applyEventSteps(resort, advance.steps, now, sand);
  callLatecomers(resort, now, sand);
  topUpTheSand(resort, sand);
  refreshInvited(resort);
  if (advance.steps.some(settles)) refreshKeen(resort, clock);
  sendTheKeenToBed(resort, now);
  if (advance.steps.length > 0) heard(advance.steps);
  refreshEventVenues(resort, now);
  const hours = ticks / TICKS_PER_HOUR;
  const { router } = resort;
  const beach = beachIndexOf(resort);
  // On the sand only once settled: somebody still walking out is not yet watching.
  entertain(
    events,
    resort.needs,
    resort.guests,
    (person, venue) =>
      router.venueIndexOf(person) === venue &&
      !router.isWaitingAt(person) &&
      (venue !== beach || router.stayOf(person) === 'resting'),
    (run) => runVenueOf(resort, run),
    hours,
  );
  fadeGlow(events.glow, hours);
}

export const runningShowOf = (resort: SimState): EventRun | null =>
  resort.events.runs.find(
    (run) => run.phase === 'running' && eventKindOf(run.occurrence).id === 'fireworks',
  ) ?? null;
