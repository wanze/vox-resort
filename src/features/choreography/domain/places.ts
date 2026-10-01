import type {
  ModelArea,
  ModelLoop,
  ModelSeat,
  ModelSpot,
  ModelVenue,
  PlaceGroup,
} from '../../../../voxel-gen/voxelgen.ts';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { RESTING } from '../../crowd/domain/crowd';
import { seatSpotsFor, type SeatSite, type SeatSpot } from '../../crowd/domain/seating';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotatePoint } from '../../layout/domain/rotation';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import type { Venue } from '../../sim/domain/venues';
import { rideLoop, SWIM_SINK, type AreaAct, type RideLoop, type WaterArea } from './acts';
import type { CourtFrame, Game } from './games';

export type PlaceKind = 'visitor' | 'watcher' | 'animator' | 'lifeguard';

interface PlaceAt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  // RESTING.standing, .sitting or .lying, or where an act starts.
  readonly pose: number;
  readonly kind: PlaceKind;
  // Into network.seats, or -1: a seat the network dropped is still somewhere to be drawn.
  readonly seat: number;
  readonly forChild?: true;
}

// Left out on a seat or a spot, which is where 044 placed everybody.
export interface StillPlace extends PlaceAt {
  readonly act?: 'still';
  // A player's, on the half of the court that is theirs.
  readonly side?: 0 | 1;
}

export interface AreaPlace extends PlaceAt {
  readonly act: AreaAct;
  readonly area: WaterArea;
}

export interface LoopPlace extends PlaceAt {
  readonly act: 'loop';
  readonly loop: RideLoop;
  // Which rider: the loop spaces its riders by it.
  readonly index: number;
}

export type Place = StillPlace | AreaPlace | LoopPlace;

export interface VenuePlaces {
  readonly visitors: readonly Place[];
  readonly watchers: readonly Place[];
  readonly animators: readonly Place[];
  readonly lifeguards: readonly Place[];
  readonly game?: Game;
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

const placeAt = (at: SeatSpot, pose: number, kind: PlaceKind, seat: number): StillPlace => ({
  x: at.x,
  y: at.y,
  z: at.z,
  heading: at.heading,
  pose,
  kind,
  seat,
});

type PlacesByKind = Record<PlaceKind, Place[]>;

const byKind = (): PlacesByKind => ({ visitor: [], watcher: [], animator: [], lifeguard: [] });

function addSpots(places: PlacesByKind, site: SeatSite, spots: readonly ModelSpot[]): void {
  const spotsAt = seatSpotsFor([{ ...site, seats: spots.map(asSeat) }]);
  for (const [index, spot] of spots.entries()) {
    const kind = spot.for ?? 'visitor';
    const place = placeAt(spotsAt[index]!, poseOf(spot.pose), kind, -1);
    places[kind].push(spot.game && spot.side !== undefined ? { ...place, side: spot.side } : place);
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

// Turned as a point, not as a seat's column: a rectangle's corners are edges, a stop a centre.
const turned = (site: SeatSite, x: number, z: number) => {
  const at = rotatePoint({ x, z }, site.width, site.depth, site.rotation);
  return { x: site.x + at.x, z: site.z + at.z };
};

function waterArea(site: SeatSite, area: ModelArea): WaterArea {
  const a = turned(site, area.x, area.z);
  const b = turned(site, area.x + area.w, area.z + area.d);
  const minX = Math.min(a.x, b.x);
  const minZ = Math.min(a.z, b.z);
  return {
    minX,
    maxX: Math.max(a.x, b.x),
    minZ,
    maxZ: Math.max(a.z, b.z),
    round: area.round === true,
    surface: site.y + area.surface,
    salt: mix(mix(Math.round(minX)) + Math.round(minZ)),
  };
}

function areaPlaces(site: SeatSite, areas: readonly ModelArea[]): Place[] {
  return areas.flatMap((declared) => {
    const area = waterArea(site, declared);
    const act: AreaAct = declared.kind === 'wade' ? 'wade' : declared.laps ? 'laps' : 'swim';
    const place: AreaPlace = {
      x: (area.minX + area.maxX) / 2,
      y: area.surface,
      z: (area.minZ + area.maxZ) / 2,
      heading: 0,
      pose: act === 'wade' ? DRAWN_POSE.wade : DRAWN_POSE.swim,
      kind: 'visitor',
      seat: -1,
      ...(declared.for === 'child' ? { forChild: true } : {}),
      act,
      area,
    };
    return Array.from({ length: declared.places }, () => place);
  });
}

function loopPlaces(site: SeatSite, loops: readonly ModelLoop[]): Place[] {
  return loops.flatMap((declared) => {
    const stops = declared.points.map((point) => ({
      ...turned(site, point.x + 0.5, point.z + 0.5),
      y: site.y + point.y - (point.pose === 'swim' ? SWIM_SINK : 0),
      pose: point.pose,
    }));
    const loop = rideLoop(stops, declared.places);
    const first = stops[0]!;
    return Array.from({ length: declared.places }, (_, index): LoopPlace => ({
      x: first.x,
      y: first.y,
      z: first.z,
      heading: loop.headings[0]!,
      pose: RESTING.standing,
      kind: 'visitor',
      seat: -1,
      act: 'loop',
      loop,
      index,
    }));
  });
}

// The court's middle and its two axes, turned with the venue as the places are.
function frameOf(site: SeatSite, venue: ModelVenue, ground: number): CourtFrame {
  const { x0, x1, z0, z1 } = venue.court!;
  const middleX = (x0 + x1 + 1) / 2;
  const middleZ = (z0 + z1 + 1) / 2;
  const at = turned(site, middleX, middleZ);
  const along = turned(site, middleX + 1, middleZ);
  const across = turned(site, middleX, middleZ + 1);
  return {
    x: at.x,
    z: at.z,
    ground,
    alongX: along.x - at.x,
    alongZ: along.z - at.z,
    acrossX: across.x - at.x,
    acrossZ: across.z - at.z,
  };
}

function gameOf(site: SeatSite, venue: ModelVenue, visitors: readonly Place[]): Game | undefined {
  const { court, ball } = venue;
  const kind = venue.spots?.find((spot) => spot.game)?.game;
  const playing = visitors.flatMap((place, visitor) =>
    'side' in place && place.side !== undefined ? [{ place, visitor, side: place.side }] : [],
  );
  if (!court || !ball || !kind || playing.length === 0) return undefined;
  const ground = Math.min(...playing.map(({ place }) => place.y));
  const frame = frameOf(site, venue, ground);
  const middleX = (court.x0 + court.x1 + 1) / 2;
  const middleZ = (court.z0 + court.z1 + 1) / 2;
  const above = (y: number): number => site.y + y - ground;
  return {
    kind,
    frame,
    court: {
      halfLength: (court.x1 + 1 - court.x0) / 2,
      halfWidth: (court.z1 + 1 - court.z0) / 2,
      net: court.net ? { u: court.net.x + 0.5 - middleX, top: above(court.net.top) } : null,
      hoops: (court.hoops ?? []).map((hoop) => ({
        u: hoop.x - middleX,
        v: hoop.z - middleZ,
        y: above(hoop.y),
      })),
    },
    players: playing.map(({ place, visitor, side }) => ({
      visitor,
      side,
      u: (place.x - frame.x) * frame.alongX + (place.z - frame.z) * frame.alongZ,
      v: (place.x - frame.x) * frame.acrossX + (place.z - frame.z) * frame.acrossZ,
    })),
    strike: above(ball.y),
    ball: ball.model,
    salt: mix(mix(Math.round(frame.x)) + Math.round(frame.z)),
  };
}

// Spots before seats unless the art says otherwise: what the venue is for comes first, and the
// benches of the parents and the waiting are filled last. A group the order leaves out follows.
const ORDER: readonly PlaceGroup[] = ['spots', 'seats', 'areas', 'loops'];

function placesOf(placement: Placement, seatIndex: ReadonlyMap<string, number>): VenuePlaces {
  const site = seatSiteOf(placement);
  const venue = objectTypeById(placement.id).model.venue;
  const { spots = [], areas = [], loops = [], order = [] } = venue ?? {};
  if (site.seats.length + spots.length + areas.length + loops.length === 0) return NO_PLACES;
  const fromSpots = byKind();
  addSpots(fromSpots, site, spots);
  const fromSeats = byKind();
  addSeats(fromSeats, site, seatIndex);
  const groups: Record<PlaceGroup, readonly Place[]> = {
    spots: fromSpots.visitor,
    seats: fromSeats.visitor,
    areas: areaPlaces(site, areas),
    loops: loopPlaces(site, loops),
  };
  const visitors = [...new Set([...order, ...ORDER])].flatMap((group) => groups[group]);
  const game = venue ? gameOf(site, venue, visitors) : undefined;
  return {
    visitors,
    watchers: [...fromSpots.watcher, ...fromSeats.watcher],
    animators: fromSpots.animator,
    lifeguards: fromSpots.lifeguard,
    ...(game ? { game } : {}),
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
