import type { Venue } from '../../sim/domain/venues';
import type { EventKind } from './catalogue';
import type { EventSite } from './programme';

// By key and not by index, so a rename or an edit elsewhere on the plot leaves the bookings put.
export function siteVenueOf(site: EventSite, venues: readonly Venue[]): number {
  if (site.kind === 'beach') return -1;
  return venues.findIndex((venue) => venue.key === site.venue && venue.stage === true);
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
