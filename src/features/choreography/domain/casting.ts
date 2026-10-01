import type { StaffRole } from '../../sim/domain/staff';
import { isMoving } from './acts';
import { createCourtGame, type CourtGame } from './courts';
import type { Place, VenuePlaces } from './places';
import type { SeaShore, SwimTrip } from './seaSwim';

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

// The resting beach guests, rebuilt by recast: only they are visited for a swim each frame.
export interface Bathers {
  readonly sea: SeaShore | null;
  readonly people: Int32Array;
  count: number;
  // Per person, as recast last saw them: the pitch the crowd holds them at.
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly child: Uint8Array;
  readonly onLounger: Uint8Array;
  // Ticks.
  readonly until: Float64Array;
  // The window a trip was last decided for, NaN to decide afresh.
  readonly window: Float64Array;
  readonly trips: (SwimTrip | null)[];
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
  // The flat indices of the area and loop places: the only people perform draws.
  readonly moving: Int32Array;
  // The leg an act has somebody on, cached so a frame does not replay every leg since the cast.
  readonly fromX: Float32Array;
  readonly fromZ: Float32Array;
  readonly toX: Float32Array;
  readonly toZ: Float32Array;
  // The clock grows all day, past where a float32 still resolves a frame.
  readonly legStart: Float64Array;
  readonly legSeconds: Float64Array;
  // -1 until perform starts the first leg.
  readonly legNo: Int32Array;
  readonly bathers: Bathers;
  // One for each venue with a game, in venue order.
  readonly courts: readonly CourtGame[];
}

export interface Casting {
  readonly count: number;
  venueOf(person: number): number;
  isWaiting(person: number): boolean;
  queuePlace(person: number): number;
  isAsleep(person: number): boolean;
  isPresent(person: number): boolean;
  // Left out, everybody is an adult.
  isChild?(person: number): boolean;
  // Left out, nobody goes for a swim.
  readonly bathing?: Bathing;
}

export interface Bathing {
  // Ticks; NaN for anybody not resting on the beach.
  restingUntil(person: number): number;
  // Where the crowd holds a resting guest, which a swim sets off from and comes back to.
  readonly crowd: {
    readonly x: ArrayLike<number>;
    readonly z: ArrayLike<number>;
    readonly seat: ArrayLike<number>;
  };
}

const NOWHERE = -1;
const ASLEEP = -2;

export function createCast(
  capacity: number,
  places: readonly VenuePlaces[],
  sea: SeaShore | null = null,
): Cast {
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
  const courts = places.flatMap(({ game }, venue) => {
    if (!game) return [];
    const { visitors, watchers } = venues[venue]!;
    const players = Int32Array.from(game.players, (player) => visitors.start + player.visitor);
    const watching = Int32Array.from({ length: watchers.count }, (_, at) => watchers.start + at);
    return [createCourtGame(game, players, watching)];
  });
  const onSeats: number[] = [];
  const moving: number[] = [];
  for (const [index, place] of flat.entries()) {
    if (place.seat >= 0) onSeats.push(index);
    if (isMoving(place)) moving.push(index);
  }
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
    moving: Int32Array.from(moving),
    fromX: new Float32Array(capacity),
    fromZ: new Float32Array(capacity),
    toX: new Float32Array(capacity),
    toZ: new Float32Array(capacity),
    legStart: new Float64Array(capacity),
    legSeconds: new Float64Array(capacity),
    legNo: new Int32Array(capacity).fill(-1),
    bathers: {
      sea,
      people: new Int32Array(capacity),
      count: 0,
      x: new Float32Array(capacity),
      z: new Float32Array(capacity),
      child: new Uint8Array(capacity),
      onLounger: new Uint8Array(capacity),
      until: new Float64Array(capacity),
      window: new Float64Array(capacity).fill(Number.NaN),
      trips: Array.from({ length: capacity }, () => null),
    },
    courts,
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
  cast.legNo[person] = -1;
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

// The children's places to a child first, and to an adult last.
function freeFor(cast: Cast, range: Range, child: boolean, seatBy: Int32Array): number {
  let fallback = -1;
  for (let index = range.start; index < range.start + range.count; index++) {
    if (!isFree(cast, index, seatBy)) continue;
    if ((cast.places[index]!.forChild === true) === child) return index;
    if (fallback < 0) fallback = index;
  }
  return fallback;
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
  const place = waiting
    ? freePlace(cast, ranges.watchers, casting.queuePlace(person), seatBy)
    : freeFor(cast, ranges.visitors, casting.isChild?.(person) === true, seatBy);
  if (place >= 0) hold(cast, person, place);
  // Waiting with no bench is left to the lane; inside with no place is out of sight indoors.
  else cast.shown[person] = waiting ? SHOWN.asCrowd : SHOWN.hidden;
}

// The router's beach comes after the resort's own venues, so it alone has no places.
function noteBather(cast: Cast, casting: Casting, bathing: Bathing, person: number, venue: number) {
  const { bathers } = cast;
  const until = venue >= cast.venues.length ? bathing.restingUntil(person) : Number.NaN;
  if (Number.isNaN(until)) {
    bathers.window[person] = Number.NaN;
    return;
  }
  bathers.people[bathers.count++] = person;
  bathers.x[person] = bathing.crowd.x[person]!;
  bathers.z[person] = bathing.crowd.z[person]!;
  bathers.child[person] = Number(casting.isChild?.(person) === true);
  bathers.onLounger[person] = Number(bathing.crowd.seat[person]! >= 0);
  bathers.until[person] = until;
}

// Once after a frame's ticks. Every change is let go before anybody is placed, so a place given
// up this frame can be taken this frame.
export function recast(cast: Cast, casting: Casting, seatBy: Int32Array): void {
  const count = Math.min(casting.count, cast.shown.length);
  cast.bathers.count = 0;
  for (let person = 0; person < count; person++) {
    let venue = NOWHERE;
    if (casting.isPresent(person))
      venue = casting.isAsleep(person) ? ASLEEP : casting.venueOf(person);
    if (casting.bathing) noteBather(cast, casting, casting.bathing, person, venue);
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
