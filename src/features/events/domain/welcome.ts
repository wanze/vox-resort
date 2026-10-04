import type { Guests } from '../../guests/domain/guests';
import type { WelcomeGap } from '../../sim/domain/dayReport';
import type { Venue } from '../../sim/domain/venues';
import { partiesAmong } from './audience';
import type { AudienceParty, EventKind } from './catalogue';
import type { EventRun } from './eventRuns';
import { siteKey, type EventSite, type Programme } from './programme';
import { sitesOf } from './sites';

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

const capacityOf = (venues: readonly Venue[], key: string): number =>
  venues.find((venue) => venue.key === key && venue.stage === true)?.capacity ?? 0;

// For withBuiltIns: the biggest stage first, which seats the most of a day's arrivals.
export const stageRank =
  (venues: readonly Venue[]) =>
  (key: string): number =>
    -capacityOf(venues, key);

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function stagesByPreference(venues: readonly Venue[]): readonly EventSite[] {
  return sitesOf(venues, [], false).toSorted((a, b) => {
    const [first, second] = [siteKey(a), siteKey(b)];
    return capacityOf(venues, second) - capacityOf(venues, first) || byKey(first, second);
  });
}

export function withoutBuiltIns(programme: Programme): Programme {
  const bookings = programme.bookings.filter((each) => each.builtIn === undefined);
  return bookings.length === programme.bookings.length ? programme : { ...programme, bookings };
}

export interface WelcomeDay {
  readonly programme: Programme;
  readonly stages: number;
  readonly held: boolean;
  readonly called: boolean;
}

export function welcomeGapOf(day: WelcomeDay): WelcomeGap | null {
  if (day.held) return null;
  if (day.stages === 0) return 'no-stage';
  const welcome = day.programme.bookings.find((each) => each.builtIn === 'welcome');
  if (welcome?.off === true) return 'off';
  return day.called ? 'called-off' : null;
}
