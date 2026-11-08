import { isBeach } from '../../sim/domain/beach';
import { eventRoomOf, type Venue } from '../../sim/domain/venues';
import { EVENT_KINDS, type EventKind, type EventKindId } from './catalogue';
import type { BookingChange, EventSite, Programme } from './programme';

const isLobby = (venue: Venue): boolean => venue.receives === true && (venue.lobby ?? 0) > 0;

// By key and not by index, so a rename or an edit elsewhere on the plot leaves the bookings put.
export function siteVenueOf(site: EventSite, venues: readonly Venue[]): number {
  // Only the router's list holds the beach, so any other list answers -1.
  if (site.kind === 'beach') return venues.findIndex(isBeach);
  if (site.kind === 'lobby') {
    return venues.findIndex((venue) => venue.key === site.venue && isLobby(venue));
  }
  return venues.findIndex((venue) => venue.key === site.venue && venue.stage === true);
}

// A bonfire is booked on the beach and lit at the first fire pit there; -1 with none. A greeting
// is held only where it is welcome, and nothing else ever goes to a lobby.
export function heldAt(site: EventSite, kind: EventKindId, venues: readonly Venue[]): number {
  const held = EVENT_KINDS[kind];
  if (held.hearth === true) {
    return site.kind === 'beach' ? venues.findIndex((venue) => venue.hearth === true) : -1;
  }
  if (site.kind === 'lobby' && held.greeting === undefined) return -1;
  const venue = siteVenueOf(site, venues);
  if (held.greeting === undefined || site.kind !== 'stage') return venue;
  return venues[venue]?.welcomes === true ? venue : -1;
}

// The view offers only fitting sites, but a playground must never take the welcome by any path.
export function unwelcomeMove(
  programme: Programme,
  id: number,
  change: BookingChange,
  venues: readonly Venue[],
): boolean {
  const booking = programme.bookings.find((each) => each.id === id);
  if (!booking || !change.site || EVENT_KINDS[booking.kind].greeting === undefined) return false;
  return heldAt(change.site, booking.kind, venues) < 0;
}

export function stageKeysOf(venues: readonly Venue[]): readonly string[] {
  return venues.filter((venue) => venue.stage === true).map((venue) => venue.key);
}

// Biggest first, as that holds the most of a day's arrivals; ties by key, so the order is stable.
export const byEventRoom = (a: Venue, b: Venue): number =>
  eventRoomOf(b) - eventRoomOf(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// Stages that welcome before any lobby: a glass at the desk only for want of a stage.
export function welcomeSitesOf(venues: readonly Venue[]): readonly EventSite[] {
  const stages = venues.filter((venue) => venue.stage === true && venue.welcomes === true);
  const lobbies = venues.filter(isLobby);
  return [
    ...stages
      .toSorted(byEventRoom)
      .map((venue): EventSite => ({ kind: 'stage', venue: venue.key })),
    ...lobbies
      .toSorted(byEventRoom)
      .map((venue): EventSite => ({ kind: 'lobby', venue: venue.key })),
  ];
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
