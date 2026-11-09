import type { Guests } from '../../guests/domain/guests';
import type { WelcomeGap } from '../../sim/domain/dayReport';
import type { Venue } from '../../sim/domain/venues';
import { partiesAmong } from './audience';
import type { AudienceParty, EventKind } from './catalogue';
import type { EventRun } from './eventRuns';
import type { EventSite, Programme } from './programme';
import { byEventRoom, welcomeSitesOf } from './sites';

// Later than this an invited party would walk in as the cups are cleared away.
export const LATE_CALL_CUTOFF = 15;

export interface LateCall {
  readonly run: EventRun;
  readonly kind: EventKind;
  // The parties checked in since the last morning check-in; the kind's audience picks among them.
  readonly newcomers: readonly number[];
  readonly guests: Guests;
  readonly isFree: (person: number) => boolean;
  readonly urgency: (person: number) => number;
  readonly now: number;
}

// Only the newcomers, tens rather than the whole guest list, so it is cheap to ask every frame.
export function latecomersFor(call: LateCall): readonly AudienceParty[] {
  const { run, kind, now } = call;
  if (kind.latecomers !== true || now >= run.occurrence.end - LATE_CALL_CUTOFF) return [];
  const asked = new Set(run.parties);
  const left = call.newcomers.filter((party) => !asked.has(party));
  return left.length === 0 ? [] : partiesAmong(call.guests, left, call.isFree, call.urgency);
}

export interface GroupCall {
  readonly run: EventRun;
  // The parties of the run's group still staying.
  readonly parties: readonly number[];
  readonly guests: Guests;
  readonly isFree: (person: number) => boolean;
  readonly urgency: (person: number) => number;
  readonly now: number;
}

// A group's own ceremony asks its parties every frame, not only twice: a party is free only now
// and then, and nobody else would take its seat.
export function groupCallFor(call: GroupCall): readonly AudienceParty[] {
  const { run, now } = call;
  const { group } = run.occurrence;
  if (group === undefined || now >= run.occurrence.end - LATE_CALL_CUTOFF) return [];
  const asked = new Set(run.parties);
  const left = call.parties.filter((party) => !asked.has(party));
  if (left.length === 0) return [];
  return partiesAmong(call.guests, left, call.isFree, call.urgency, () => group);
}

// For a show the weather moves: every stage, the biggest first, then the lobbies, where only a
// greeting is ever held.
export function shelterSitesOf(venues: readonly Venue[]): readonly EventSite[] {
  const stages = venues
    .filter((venue) => venue.stage === true)
    .toSorted(byEventRoom)
    .map((venue): EventSite => ({ kind: 'stage', venue: venue.key }));
  const lobbies = welcomeSitesOf(venues).filter((site) => site.kind === 'lobby');
  return [...stages, ...lobbies];
}

export function withoutBuiltIns(programme: Programme): Programme {
  const bookings = programme.bookings.filter((each) => each.builtIn === undefined);
  return bookings.length === programme.bookings.length ? programme : { ...programme, bookings };
}

export interface WelcomeDay {
  readonly programme: Programme;
  // Stages that welcome and lobbies alike.
  readonly sites: number;
  readonly held: boolean;
  readonly called: boolean;
}

export function welcomeGapOf(day: WelcomeDay): WelcomeGap | null {
  if (day.held) return null;
  if (day.sites === 0) return 'no-stage';
  const welcome = day.programme.bookings.find((each) => each.builtIn === 'welcome');
  if (welcome?.off === true) return 'off';
  return day.called ? 'called-off' : null;
}
