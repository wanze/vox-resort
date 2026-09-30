import type { StaffRole } from '../../sim/domain/staff';
import type { Place, VenuePlaces } from './places';

export const SHOWN = { asCrowd: 0, placed: 1, hidden: 2 } as const;

// What the crowd field draws instead of the crowd: 0 as the crowd has them, 1 placed, 2 not drawn.
export interface DrawnAs {
  readonly shown: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  // A RESTING code or one of rendering's DRAWN_POSE, which only the figure shader reads.
  readonly pose: Float32Array;
}

interface Range {
  readonly start: number;
  readonly count: number;
}

interface VenueRanges {
  readonly visitors: Range;
  readonly watchers: Range;
  readonly animators: Range;
  readonly lifeguards: Range;
}

// Visual state only, rebuilt from what the router reports: nothing here is ever saved.
export interface Cast extends DrawnAs {
  // A flat index into `places`, or -1.
  readonly placeOf: Int32Array;
  // What the person was doing at the last recast, so a change gives their place up.
  readonly lastVenue: Int32Array;
  readonly lastWaiting: Uint8Array;
  readonly places: readonly Place[];
  readonly heldBy: Int32Array;
  readonly venues: readonly VenueRanges[];
  // The flat indices of the places on a network seat, the only ones a passer-by can take.
  readonly onSeats: Int32Array;
}

export interface Casting {
  readonly count: number;
  venueOf(person: number): number;
  isWaiting(person: number): boolean;
  queuePlace(person: number): number;
  isAsleep(person: number): boolean;
  isPresent(person: number): boolean;
}

const NOWHERE = -1;
const ASLEEP = -2;

export function createCast(capacity: number, places: readonly VenuePlaces[]): Cast {
  const flat: Place[] = [];
  const take = (list: readonly Place[]): Range => {
    const range = { start: flat.length, count: list.length };
    flat.push(...list);
    return range;
  };
  const venues = places.map((venue) => ({
    visitors: take(venue.visitors),
    watchers: take(venue.watchers),
    animators: take(venue.animators),
    lifeguards: take(venue.lifeguards),
  }));
  const onSeats: number[] = [];
  for (const [index, place] of flat.entries()) if (place.seat >= 0) onSeats.push(index);
  return {
    shown: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    pose: new Float32Array(capacity),
    placeOf: new Int32Array(capacity).fill(-1),
    lastVenue: new Int32Array(capacity).fill(NOWHERE),
    lastWaiting: new Uint8Array(capacity),
    places: flat,
    heldBy: new Int32Array(flat.length).fill(-1),
    venues,
    onSeats: Int32Array.from(onSeats),
  };
}

function release(cast: Cast, person: number): void {
  const place = cast.placeOf[person]!;
  if (place >= 0) cast.heldBy[place] = -1;
  cast.placeOf[person] = -1;
  cast.shown[person] = SHOWN.asCrowd;
}

function hold(cast: Cast, person: number, index: number): void {
  const place = cast.places[index]!;
  cast.heldBy[index] = person;
  cast.placeOf[person] = index;
  cast.shown[person] = SHOWN.placed;
  cast.x[person] = place.x;
  cast.y[person] = place.y;
  cast.z[person] = place.z;
  cast.heading[person] = place.heading;
  cast.pose[person] = place.pose;
}

function isFree(cast: Cast, index: number, seatBy: Int32Array | null): boolean {
  if (cast.heldBy[index] !== -1) return false;
  const seat = cast.places[index]!.seat;
  return seat < 0 || seatBy === null || seatBy[seat] === -1;
}

// The place at `rank` when it is free, so a line admitted together sits in line order; the
// first free one otherwise.
function freePlace(cast: Cast, range: Range, rank: number, seatBy: Int32Array | null): number {
  if (rank >= 0 && rank < range.count && isFree(cast, range.start + rank, seatBy)) {
    return range.start + rank;
  }
  for (let index = range.start; index < range.start + range.count; index++) {
    if (isFree(cast, index, seatBy)) return index;
  }
  return -1;
}

function castOne(cast: Cast, casting: Casting, person: number, seatBy: Int32Array): void {
  const venue = cast.lastVenue[person]!;
  if (venue === ASLEEP) {
    cast.shown[person] = SHOWN.hidden;
    return;
  }
  const ranges = venue >= 0 ? cast.venues[venue] : undefined;
  if (!ranges) {
    cast.shown[person] = SHOWN.asCrowd;
    return;
  }
  if (cast.placeOf[person]! >= 0) return;
  const waiting = cast.lastWaiting[person] === 1;
  const range = waiting ? ranges.watchers : ranges.visitors;
  const place = freePlace(cast, range, waiting ? casting.queuePlace(person) : 0, seatBy);
  if (place >= 0) hold(cast, person, place);
  // Waiting with no bench is left to the lane; inside with no place is out of sight indoors.
  else cast.shown[person] = waiting ? SHOWN.asCrowd : SHOWN.hidden;
}

// Once after a frame's ticks. Every change is let go before anybody is placed, so a place given
// up this frame can be taken this frame.
export function recast(cast: Cast, casting: Casting, seatBy: Int32Array): void {
  const count = Math.min(casting.count, cast.shown.length);
  for (let person = 0; person < count; person++) {
    let venue = NOWHERE;
    if (casting.isPresent(person))
      venue = casting.isAsleep(person) ? ASLEEP : casting.venueOf(person);
    const waiting = venue >= 0 && casting.isWaiting(person) ? 1 : 0;
    if (venue === cast.lastVenue[person] && waiting === cast.lastWaiting[person]) continue;
    release(cast, person);
    cast.lastVenue[person] = venue;
    cast.lastWaiting[person] = waiting;
  }
  for (let person = 0; person < count; person++) castOne(cast, casting, person, seatBy);
}

// Every frame: a passer-by keeps sitting down on venue seats, and whoever was drawn there moves.
export function keepSeats(cast: Cast, casting: Casting, seatBy: Int32Array): void {
  for (const index of cast.onSeats) {
    const person = cast.heldBy[index]!;
    if (person < 0 || seatBy[cast.places[index]!.seat] === -1) continue;
    release(cast, person);
    castOne(cast, casting, person, seatBy);
  }
}

// Only an animator on a stage and a lifeguard at a pool: everybody else at work is drawn where
// the staff router holds them.
export function recastStaff(
  cast: Cast,
  atWork: (worker: number) => number,
  roleOf: (worker: number) => StaffRole,
): void {
  for (let worker = 0; worker < cast.shown.length; worker++) {
    const role = roleOf(worker);
    const placed = role === 'animator' || role === 'lifeguard';
    const venue = placed ? atWork(worker) : NOWHERE;
    if (venue !== cast.lastVenue[worker]) {
      release(cast, worker);
      cast.lastVenue[worker] = venue;
    }
    const ranges = venue >= 0 ? cast.venues[venue] : undefined;
    if (!ranges || cast.placeOf[worker]! >= 0) continue;
    const range = role === 'animator' ? ranges.animators : ranges.lifeguards;
    const place = freePlace(cast, range, 0, null);
    if (place >= 0) hold(cast, worker, place);
  }
}

interface Positions {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
}

// Where everybody is drawn, for a click to pick from. NaN for the hidden, which no distance
// comparison ever picks: somebody out of sight indoors must not be clicked through the roof.
export function whereDrawn(people: Positions, drawnAs: DrawnAs, into: Positions): Positions {
  const count = Math.min(people.count, into.x.length);
  for (let person = 0; person < count; person++) {
    const shown = drawnAs.shown[person] ?? SHOWN.asCrowd;
    const from = shown === SHOWN.placed ? drawnAs : people;
    const hidden = shown === SHOWN.hidden;
    into.x[person] = hidden ? Number.NaN : from.x[person]!;
    into.y[person] = hidden ? Number.NaN : from.y[person]!;
    into.z[person] = hidden ? Number.NaN : from.z[person]!;
  }
  return { count, x: into.x, y: into.y, z: into.z };
}
