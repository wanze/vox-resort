import { RESTING } from '../../crowd/domain/crowd';
import type { StaffRole } from '../../sim/domain/staff';
import { isMoving } from './acts';
import { createCourtGame, type CourtGame, type DrawnBall } from './courts';
import { createGolfPlay, type GolfPlay } from './golf';
import type { Audience, Floor } from './shows';
import type { TagGame, Yard } from './tag';
import type { Place, VenuePlaces } from './places';
import type { SeaShore, SwimTrip } from './seaSwim';

export const SHOWN = { asCrowd: 0, placed: 1, hidden: 2 } as const;

// What somebody at work is drawn doing, by role.
export const WORK = { none: 0, show: 1, watch: 2, sweep: 3, mend: 4 } as const;

const WORK_OF: Readonly<Record<StaffRole, number>> = {
  animator: WORK.show,
  lifeguard: WORK.watch,
  cleaner: WORK.sweep,
  mechanic: WORK.mend,
};

// What the crowd field draws instead of the crowd: 0 as the crowd has them, 1 placed, 2 not drawn.
export interface DrawnAs {
  readonly shown: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  // A RESTING code or one of rendering's DRAWN_POSE, which only the figure shader reads.
  readonly pose: Float32Array;
  // 1 for somebody drawn in a wheelchair, whatever the pose says.
  readonly chair: Uint8Array;
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
  readonly staff: Range;
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
  readonly golf: readonly GolfPlay[];
  // Per person, as recast last saw them: -1 for no party.
  readonly party: Int32Array;
  readonly child: Uint8Array;
  // Triples: a parent's place, then the start and count of its venue's visitor places.
  readonly minding: Int32Array;
  // The clock last performed, for how far a parent turns in a frame.
  readonly frame: { clock: number };
  readonly tag: readonly TagGame[];
  // Per venue: 1 while an animator puts a show on there, and the act clock it began or last ended.
  readonly shows: Uint8Array;
  readonly showFrom: Float64Array;
  readonly showTo: Float64Array;
  readonly audiences: readonly Audience[];
  // Staff only: a WORK code, and where the work is done, its place's or where the sim holds them.
  readonly work: Uint8Array;
  readonly workX: Float32Array;
  readonly workY: Float32Array;
  readonly workZ: Float32Array;
  readonly workHeading: Float32Array;
  // Per person: the show they last set off for, when, and from where.
  readonly joined: Float64Array;
  readonly joinedAt: Float64Array;
  readonly fromShowX: Float32Array;
  readonly fromShowZ: Float32Array;
  // Every ball in play, the courts' and the courses', for the ball field to draw.
  readonly played: readonly { readonly ball: DrawnBall }[];
  // Per venue, as recast last saw it: its visitors, not those waiting outside.
  readonly inside: Int32Array;
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
  // Left out, nobody is anybody's parent.
  partyOf?(person: number): number;
  // Left out, nobody uses a wheelchair.
  inChair?(person: number): boolean;
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

const gathers = (place: Place): boolean => place.act === 'tag' || place.act === 'play';

const dances = (place: Place): boolean => !isMoving(place) && place.pose === RESTING.sitting;

// Somebody standing still with no game to play watches the show from where they are.
const cheers = (place: Place): boolean =>
  !isMoving(place) &&
  (place.act ?? 'still') === 'still' &&
  place.pose === RESTING.standing &&
  !('side' in place && place.side !== undefined) &&
  !('lane' in place && place.lane !== undefined);

// Who leaves off for a show: tag and the machines gather round the animator, sitters dance. Only
// a venue with a floor has a standing audience, or a minding parent would cheer at the kids club.
function audienceOf(
  flat: readonly Place[],
  { visitors, animators }: VenueRanges,
  venue: number,
  floor: Floor | undefined,
): Audience[] {
  const own = Array.from({ length: visitors.count }, (_, at) => visitors.start + at);
  const animator = animators.count > 0 ? animators.start : -1;
  const gathering = animator >= 0 ? own.filter((index) => gathers(flat[index]!)) : [];
  const dancing = floor ? own.filter((index) => dances(flat[index]!)) : [];
  const cheering = floor && animator >= 0 ? own.filter((index) => cheers(flat[index]!)) : [];
  if (gathering.length + dancing.length + cheering.length === 0) return [];
  return [
    {
      venue,
      animator,
      gathering: Int32Array.from(gathering),
      dancing: Int32Array.from(dancing),
      cheering: Int32Array.from(cheering),
      floor: floor ?? null,
    },
  ];
}

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
    staff: take(venue.staff ?? []),
  }));
  const courts = places.flatMap(({ game }, venue) => {
    if (!game) return [];
    const { visitors, watchers } = venues[venue]!;
    const players = Int32Array.from(game.players, (player) => visitors.start + player.visitor);
    const watching = Int32Array.from({ length: watchers.count }, (_, at) => watchers.start + at);
    return [createCourtGame(game, players, watching)];
  });
  const golf = places.flatMap((venue, at) => {
    if (!venue.golf) return [];
    const { start } = venues[at]!.visitors;
    const parties = venue.golf.lanes.map((lane) =>
      Int32Array.from(lane.party, (visitor) => start + visitor),
    );
    return [createGolfPlay(venue.golf, parties)];
  });
  const onSeats: number[] = [];
  const moving: number[] = [];
  for (const [index, place] of flat.entries()) {
    if (place.seat >= 0) onSeats.push(index);
    if (isMoving(place)) moving.push(index);
  }
  const tag = venues.flatMap(({ visitors }) => {
    const games = new Map<Yard, number[]>();
    for (let index = visitors.start; index < visitors.start + visitors.count; index++) {
      const place = flat[index]!;
      if (place.act !== 'tag' || !place.yard) continue;
      games.set(place.yard, [...(games.get(place.yard) ?? []), index]);
    }
    return [...games].map(([yard, indices]) => ({ yard, places: Int32Array.from(indices) }));
  });
  const audiences = places.flatMap((venue, at) => audienceOf(flat, venues[at]!, at, venue.floor));
  const minding = venues.flatMap(({ visitors }) => {
    const own = flat.slice(visitors.start, visitors.start + visitors.count);
    if (!own.some((place) => place.forChild)) return [];
    return own.flatMap((place, at) =>
      place.forChild || isMoving(place)
        ? []
        : [visitors.start + at, visitors.start, visitors.count],
    );
  });
  return {
    shown: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    pose: new Float32Array(capacity),
    chair: new Uint8Array(capacity),
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
    golf,
    party: new Int32Array(capacity).fill(-1),
    child: new Uint8Array(capacity),
    minding: Int32Array.from(minding),
    frame: { clock: 0 },
    tag,
    audiences,
    work: new Uint8Array(capacity),
    workX: new Float32Array(capacity),
    workY: new Float32Array(capacity),
    workZ: new Float32Array(capacity),
    workHeading: new Float32Array(capacity),
    joined: new Float64Array(capacity).fill(Number.NaN),
    joinedAt: new Float64Array(capacity),
    fromShowX: new Float32Array(capacity),
    fromShowZ: new Float32Array(capacity),
    shows: new Uint8Array(venues.length),
    showFrom: new Float64Array(venues.length).fill(Number.NaN),
    showTo: new Float64Array(venues.length).fill(Number.NaN),
    played: [...courts, ...golf.flatMap((play) => play.balls.map((ball) => ({ ball })))],
    inside: new Int32Array(venues.length),
  };
}

function release(cast: Cast, person: number): void {
  const place = cast.placeOf[person]!;
  if (place >= 0) cast.heldBy[place] = -1;
  cast.placeOf[person] = -1;
  cast.shown[person] = SHOWN.asCrowd;
  cast.work[person] = WORK.none;
}

function hold(cast: Cast, person: number, index: number): void {
  const place = cast.places[index]!;
  cast.heldBy[index] = person;
  cast.placeOf[person] = index;
  cast.shown[person] = SHOWN.placed;
  cast.heading[person] = place.heading;
  cast.pose[person] = place.pose;
  cast.x[person] = place.x;
  cast.y[person] = place.y;
  cast.z[person] = place.z;
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

// Somewhere to sit in the chair: a spot to stand at, then a seat, never a lounger, the water or a
// game. A venue with none of those, a pool or a court, has them watch from its edge.
const keepsStill = (place: Place): boolean =>
  !isMoving(place) && (place.act ?? 'still') === 'still' && place.pose !== RESTING.lying;

function freeStill(cast: Cast, range: Range, seatBy: Int32Array, pose: number): number {
  for (let index = range.start; index < range.start + range.count; index++) {
    const place = cast.places[index]!;
    if (place.pose === pose && keepsStill(place) && isFree(cast, index, seatBy)) return index;
  }
  return -1;
}

function chairPlace(cast: Cast, ranges: VenueRanges, seatBy: Int32Array): number {
  const standing = freeStill(cast, ranges.visitors, seatBy, RESTING.standing);
  if (standing >= 0) return standing;
  const seat = freeStill(cast, ranges.visitors, seatBy, RESTING.sitting);
  return seat >= 0 ? seat : freePlace(cast, ranges.watchers, 0, seatBy);
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

function insidePlace(
  cast: Cast,
  casting: Casting,
  person: number,
  ranges: VenueRanges,
  seatBy: Int32Array,
): number {
  if (cast.chair[person] === 1) return chairPlace(cast, ranges, seatBy);
  return freeFor(cast, ranges.visitors, casting.isChild?.(person) === true, seatBy);
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
    : insidePlace(cast, casting, person, ranges, seatBy);
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

function noteFamily(cast: Cast, casting: Casting, person: number, venue: number): void {
  const there = venue >= 0;
  cast.party[person] = there ? (casting.partyOf?.(person) ?? -1) : -1;
  cast.child[person] = Number(there && casting.isChild?.(person) === true);
  cast.chair[person] = Number(casting.inChair?.(person) === true);
}

// The beach and anybody asleep or nowhere fall outside the venues, so they count nowhere.
function noteInside(cast: Cast, venue: number, waiting: number): void {
  if (waiting === 0 && venue >= 0 && venue < cast.inside.length) cast.inside[venue]!++;
}

// Once after a frame's ticks. Every change is let go before anybody is placed, so a place given
// up this frame can be taken this frame.
export function recast(cast: Cast, casting: Casting, seatBy: Int32Array): void {
  const count = Math.min(casting.count, cast.shown.length);
  cast.bathers.count = 0;
  cast.inside.fill(0);
  for (let person = 0; person < count; person++) {
    let venue = NOWHERE;
    if (casting.isPresent(person))
      venue = casting.isAsleep(person) ? ASLEEP : casting.venueOf(person);
    if (casting.bathing) noteBather(cast, casting, casting.bathing, person, venue);
    noteFamily(cast, casting, person, venue);
    const waiting = venue >= 0 && casting.isWaiting(person) ? 1 : 0;
    noteInside(cast, venue, waiting);
    if (venue === cast.lastVenue[person] && waiting === cast.lastWaiting[person]) continue;
    release(cast, person);
    cast.lastVenue[person] = venue;
    cast.lastWaiting[person] = waiting;
  }
  for (let person = 0; person < count; person++) castOne(cast, casting, person, seatBy);
}

export const insideAt = (cast: Cast, venue: number): number => cast.inside[venue] ?? 0;

// Onto a cast built after an edit, before its first recast. A venue that still stands is laid
// out from the same art, so whoever held one of its places holds the same one again; recast lets
// go of anybody the sim did not keep there.
export function carryPlaces(from: Cast, into: Cast, venueAfter: (venue: number) => number): void {
  for (const [venue, ranges] of from.venues.entries()) {
    const next = venueAfter(venue);
    const onto = next >= 0 ? into.venues[next] : undefined;
    if (!onto) continue;
    carryRange(from, into, ranges.visitors, onto.visitors, next);
    carryRange(from, into, ranges.watchers, onto.watchers, next);
  }
}

function carryRange(from: Cast, into: Cast, range: Range, onto: Range, venue: number): void {
  if (range.count !== onto.count) return;
  for (let at = 0; at < range.count; at++) {
    const person = from.heldBy[range.start + at]!;
    if (person < 0 || person >= into.shown.length) continue;
    hold(into, person, onto.start + at);
    into.lastVenue[person] = venue;
    into.lastWaiting[person] = from.lastWaiting[person]!;
    into.chair[person] = from.chair[person]!;
  }
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

// After the staff's ticks: which venues have a show on, for their visitors to gather round.
export function noteShows(cast: Cast, performingAt: (venue: number) => boolean): void {
  for (let venue = 0; venue < cast.shows.length; venue++) {
    cast.shows[venue] = Number(performingAt(venue));
  }
}

// Where the staff crowd holds everybody, for a cleaner or a mechanic at a venue with no staff place.
export interface StaffAt {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly heading: ArrayLike<number>;
}

function startWork(cast: Cast, worker: number, work: number): void {
  cast.work[worker] = work;
  cast.workX[worker] = cast.x[worker]!;
  cast.workY[worker] = cast.y[worker]!;
  cast.workZ[worker] = cast.z[worker]!;
  cast.workHeading[worker] = cast.heading[worker]!;
}

// At the sim's position, inside the door, when the art gives the venue nowhere better.
function workWhereHeld(cast: Cast, worker: number, at: StaffAt): void {
  cast.shown[worker] = SHOWN.placed;
  cast.x[worker] = at.x[worker]!;
  cast.y[worker] = at.y[worker]!;
  cast.z[worker] = at.z[worker]!;
  cast.heading[worker] = at.heading[worker]!;
}

const rangeFor = (ranges: VenueRanges, work: number): Range => {
  if (work === WORK.show) return ranges.animators;
  return work === WORK.watch ? ranges.lifeguards : ranges.staff;
};

// Sweeping a path is no venue's work, so it stands apart from every venue index.
const SWEEPING = -3;

function castAtVenue(cast: Cast, worker: number, venue: number, work: number, at?: StaffAt) {
  const ranges = venue >= 0 ? cast.venues[venue] : undefined;
  if (!ranges) return;
  const place = freePlace(cast, rangeFor(ranges, work), 0, null);
  const anywhere = at && (work === WORK.sweep || work === WORK.mend);
  if (place >= 0) hold(cast, worker, place);
  else if (anywhere) workWhereHeld(cast, worker, at);
  else return;
  startWork(cast, worker, work);
}

// Everybody at a venue's work, on its place for their role, and a cleaner sweeping a path where
// the sim holds them on it. A room being made up or a store restocked is no venue's, so whoever
// does it stays where the sim hides them.
export function recastStaff(
  cast: Cast,
  atWork: (worker: number) => number,
  roleOf: (worker: number) => StaffRole,
  at?: StaffAt,
  sweeping?: (worker: number) => boolean,
): void {
  for (let worker = 0; worker < cast.shown.length; worker++) {
    const swept = sweeping?.(worker) === true;
    const venue = swept ? SWEEPING : atWork(worker);
    if (venue !== cast.lastVenue[worker]) {
      release(cast, worker);
      cast.lastVenue[worker] = venue;
    }
    if (cast.work[worker] !== WORK.none) continue;
    if (!swept) castAtVenue(cast, worker, venue, WORK_OF[roleOf(worker)], at);
    else if (at) {
      workWhereHeld(cast, worker, at);
      startWork(cast, worker, WORK.sweep);
    }
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
