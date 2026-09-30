import type { ModelSeat, ModelSpot } from '../../../../voxel-gen/voxelgen.ts';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import { seatSpotsFor, type SeatSite, type SeatSpot } from '../../crowd/domain/seating';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Placement } from '../../layout/domain/resortLayout';
import type { Venue } from '../../sim/domain/venues';

export type PlaceKind = 'visitor' | 'watcher' | 'animator' | 'lifeguard';

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  // RESTING.standing, .sitting or .lying.
  readonly pose: number;
  readonly kind: PlaceKind;
  // Into network.seats, or -1: a seat the network dropped is still somewhere to be drawn.
  readonly seat: number;
}

export interface VenuePlaces {
  readonly visitors: readonly Place[];
  readonly watchers: readonly Place[];
  readonly animators: readonly Place[];
  readonly lifeguards: readonly Place[];
}

const NO_PLACES: VenuePlaces = { visitors: [], watchers: [], animators: [], lifeguards: [] };

const positionKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

const poseOf = (pose: ModelSpot['pose']): number => {
  if (pose === 'sit') return RESTING.sitting;
  if (pose === 'lie') return RESTING.lying;
  return RESTING.standing;
};

// Handed to seatSpotsFor as seats so a spot turns by the very arithmetic a seat does.
const asSeat = (spot: ModelSpot): ModelSeat => ({
  x: spot.x,
  y: spot.y,
  z: spot.z,
  facing: spot.facing,
});

const placeAt = (at: SeatSpot, pose: number, kind: PlaceKind, seat: number): Place => ({
  x: at.x,
  y: at.y,
  z: at.z,
  heading: at.heading,
  pose,
  kind,
  seat,
});

type PlacesByKind = Record<PlaceKind, Place[]>;

function addSpots(places: PlacesByKind, site: SeatSite, spots: readonly ModelSpot[]): void {
  const spotsAt = seatSpotsFor([{ ...site, seats: spots.map(asSeat) }]);
  for (const [index, spot] of spots.entries()) {
    const kind = spot.for ?? 'visitor';
    places[kind].push(placeAt(spotsAt[index]!, poseOf(spot.pose), kind, -1));
  }
}

function addSeats(
  places: PlacesByKind,
  site: SeatSite,
  seatIndex: ReadonlyMap<string, number>,
): void {
  const seatsAt = seatSpotsFor([site]);
  for (const [index, seat] of site.seats.entries()) {
    // A post belongs to the tower and to the staff router, which sends a lifeguard to sit on it.
    if (seat.post) continue;
    const at = seatsAt[index]!;
    const kind = seat.watches ? 'watcher' : 'visitor';
    const onNetwork = seatIndex.get(positionKey(at.x, at.y, at.z)) ?? -1;
    places[kind].push(placeAt(at, poseOf(at.pose), kind, onNetwork));
  }
}

// Visitor spots come before the seats: the art lists what the venue is for first, and the
// benches of the parents and the waiting are filled last.
function placesOf(placement: Placement, seatIndex: ReadonlyMap<string, number>): VenuePlaces {
  const site = seatSiteOf(placement);
  const spots = objectTypeById(placement.id).model.venue?.spots ?? [];
  if (site.seats.length === 0 && spots.length === 0) return NO_PLACES;
  const places: PlacesByKind = { visitor: [], watcher: [], animator: [], lifeguard: [] };
  addSpots(places, site, spots);
  addSeats(places, site, seatIndex);
  return {
    visitors: places.visitor,
    watchers: places.watcher,
    animators: places.animator,
    lifeguards: places.lifeguard,
  };
}

// Index-aligned with `venues`, which is the resort's own list: the router's beach comes after it.
export function placesFor(
  venues: readonly Venue[],
  placements: ReadonlyMap<string, Placement>,
  network: Pick<WalkNetwork, 'seats'>,
): readonly VenuePlaces[] {
  // By position: the network files seats by node and drops the unreachable, so no index lines up.
  const seatIndex = new Map<string, number>();
  for (const [index, seat] of network.seats.entries()) {
    const key = positionKey(seat.x, seat.y, seat.z);
    if (!seatIndex.has(key)) seatIndex.set(key, index);
  }
  return venues.map((venue) => {
    const placement = placements.get(venue.key);
    return placement ? placesOf(placement, seatIndex) : NO_PLACES;
  });
}
