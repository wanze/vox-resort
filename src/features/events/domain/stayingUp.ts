import type { Guests } from '../../guests/domain/guests';
import { isInterested, partiesOf } from './audience';
import { EVENT_KINDS, type AudienceParty } from './catalogue';
import { saltOf } from './eventRuns';
import { occurrencesOn, type EventSite, type Occurrence, type Programme } from './programme';
import { dayAt, tickAt } from './week';

export const STAY_UP_FROM = 12 * 60;

export interface ShowTonight {
  readonly programme: Programme;
  readonly now: number;
  readonly open: (site: EventSite) => boolean;
  // Today's occurrences called off or postponed, by bookingDayKey.
  readonly settled: ReadonlySet<string>;
}

export const bookingDayKey = (occurrence: Occurrence): string =>
  `${occurrence.booking}:${occurrence.day}`;

export function tonightsShow(ask: ShowTonight): Occurrence | null {
  const { now } = ask;
  const day = dayAt(now);
  if (now < tickAt(day, STAY_UP_FROM)) return null;
  return (
    occurrencesOn(ask.programme, day).find(
      (occurrence) =>
        EVENT_KINDS[occurrence.kind].keepsUp === true &&
        now < occurrence.end &&
        ask.open(occurrence.site) &&
        !ask.settled.has(bookingDayKey(occurrence)),
    ) ?? null
  );
}

// The show the morning tells of: tonight's, as it stands at the check-in.
export function showToTell(ask: Omit<ShowTonight, 'now'> & { readonly day: number }) {
  return tonightsShow({ ...ask, now: tickAt(ask.day, STAY_UP_FROM) });
}

// Grown to the parties there are now: check-in adds parties.
export function keenParties(guests: Guests, show: Occurrence | null, keen: Uint8Array): Uint8Array {
  const into = keen.length < guests.parties.length ? new Uint8Array(guests.parties.length) : keen;
  if (!show) {
    into.fill(0);
    return into;
  }
  const everyone = partiesOf(
    guests,
    () => true,
    () => 0,
  );
  markKeen(everyone, show, into);
  return into;
}

// The run's own salt, worked out before the run exists, so the keen are the ones it will pick.
export function markKeen(
  parties: readonly AudienceParty[],
  occurrence: Occurrence,
  into: Uint8Array,
): void {
  into.fill(0);
  const kind = EVENT_KINDS[occurrence.kind];
  const salt = saltOf(occurrence);
  for (const party of parties) {
    if (party.party >= into.length) continue;
    if (isInterested(party, kind, occurrence.tier, occurrence.day, salt)) into[party.party] = 1;
  }
}
