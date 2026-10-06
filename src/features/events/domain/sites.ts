import { isBeach } from '../../sim/domain/beach';
import type { Venue } from '../../sim/domain/venues';
import { EVENT_KINDS, type EventKind, type EventKindId } from './catalogue';
import type { EventSite } from './programme';

// By key and not by index, so a rename or an edit elsewhere on the plot leaves the bookings put.
export function siteVenueOf(site: EventSite, venues: readonly Venue[]): number {
  // Only the router's list holds the beach, so any other list answers -1.
  if (site.kind === 'beach') return venues.findIndex(isBeach);
  return venues.findIndex((venue) => venue.key === site.venue && venue.stage === true);
}

// A bonfire is booked on the beach and lit at the first fire pit there; -1 with none.
export function heldAt(site: EventSite, kind: EventKindId, venues: readonly Venue[]): number {
  if (EVENT_KINDS[kind].hearth !== true) return siteVenueOf(site, venues);
  return site.kind === 'beach' ? venues.findIndex((venue) => venue.hearth === true) : -1;
}

export function stageKeysOf(venues: readonly Venue[]): readonly string[] {
  return venues.filter((venue) => venue.stage === true).map((venue) => venue.key);
}

export function sitesOf(
  venues: readonly Venue[],
  kinds: readonly EventKind[],
  beach: boolean,
): readonly EventSite[] {
  const stages: EventSite[] = venues
    .filter((venue) => venue.stage === true)
    .toSorted(
      (a, b) => a.label.localeCompare(b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .map((venue) => ({ kind: 'stage', venue: venue.key }));
  const onSand = beach && kinds.some((kind) => kind.sites.includes('beach'));
  return onSand ? [...stages, { kind: 'beach' }] : stages;
}
