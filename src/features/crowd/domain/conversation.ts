import { unitAt } from '../../random/domain/hash';

// Which way a sitter would talk: to a neighbour on their own +x or -x side (the figure faces
// +z), or one across a table in front of them. The figure shader reads these codes.
export const TALK = { none: 0, plusX: 1, ahead: 2, minusX: 3 } as const;

// Covers the next seat on a bench (4 apart) or the one after, and the seat across a picnic
// table (7), but not the one diagonally across it.
export const TALK_RADIUS = 8.5;

// More than a seat's rise, less than a storey: a balcony above is not at the same table.
const TALK_RISE = 2;

// A power of two, so a cell's hash folds into the table with a mask.
const TABLE_SIZE = 4096;

export interface Sitters {
  readonly count: number;
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly heading: ArrayLike<number>;
  readonly sitting: ArrayLike<number>;
}

// Close enough to be stood together: two spots at a rail or round a table, not the next
// party's along.
export const MINGLE_RADIUS = 12;

// Off the way the place faces. Short of a right angle, so a pair side by side face each other
// almost square and one stood behind is half turned to rather than turned round.
export const MINGLE_TURN_LIMIT = 0.45 * Math.PI;

// In the crowd's clock, about 11x real time: spells of ~11 real seconds, in each of which a
// party faces each other by this chance and otherwise looks out the way their places face.
export const MINGLE_SPELL = 120;
export const MINGLE_FACING_SHARE = 0.7;

export interface Minglers {
  readonly count: number;
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly heading: ArrayLike<number>;
  // The party's index plus one, so 0 is somebody who stands with nobody.
  readonly party: ArrayLike<number>;
}

export interface Mingling {
  // Radians to turn off the heading, towards the nearest of the party.
  readonly turn: Float32Array;
  readonly talks: Uint8Array;
}

interface Placed {
  readonly count: number;
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
}

// Reused frame after frame: the field asks every frame and must not allocate.
export interface TalkGrid {
  readonly head: Int32Array;
  readonly next: Int32Array;
  readonly nearest: Nearest;
}

interface Nearest {
  best: number;
  distance: number;
}

export const talkGridFor = (capacity: number): TalkGrid => ({
  head: new Int32Array(TABLE_SIZE),
  next: new Int32Array(capacity),
  nearest: { best: -1, distance: 0 },
});

// Cells collide in the table now and then; that only adds candidates the distance turns away.
const bucketOf = (cellX: number, cellZ: number): number =>
  (Math.imul(cellX, 73_856_093) ^ Math.imul(cellZ, 19_349_663)) & (TABLE_SIZE - 1);

const cellOf = (at: number, radius: number): number => Math.floor(at / radius);

function sideTowards(sitters: Sitters, person: number, other: number): number {
  const dx = sitters.x[other]! - sitters.x[person]!;
  const dz = sitters.z[other]! - sitters.z[person]!;
  const sin = Math.sin(sitters.heading[person]!);
  const cos = Math.cos(sitters.heading[person]!);
  const across = dx * cos - dz * sin;
  const ahead = dx * sin + dz * cos;
  // Behind, or back to back: nobody turns round on a bench to talk.
  if (ahead < -Math.abs(across)) return TALK.none;
  if (ahead > Math.abs(across)) return TALK.ahead;
  return across > 0 ? TALK.plusX : TALK.minusX;
}

const squaredDistance = (people: Placed, a: number, b: number): number =>
  (people.x[b]! - people.x[a]!) ** 2 + (people.z[b]! - people.z[a]!) ** 2;

const atSameLevel = (people: Placed, a: number, b: number): boolean =>
  Math.abs(people.y[b]! - people.y[a]!) <= TALK_RISE;

// Ties go to the lower index, so two equal neighbours never flicker between frames.
const beats = (distance: number, other: number, nearest: Nearest): boolean =>
  distance < nearest.distance ||
  (distance === nearest.distance && (nearest.best < 0 || other < nearest.best));

interface Search {
  readonly people: Placed;
  // 0 joins nobody; anybody else is matched only with the same number.
  readonly group: ArrayLike<number>;
  readonly grid: TalkGrid;
  readonly radius: number;
}

function searchBucket(search: Search, person: number, bucket: number): void {
  const { people, group, grid } = search;
  const { nearest } = grid;
  for (let other = grid.head[bucket]!; other >= 0; other = grid.next[other]!) {
    if (other === person || group[other] !== group[person]) continue;
    if (!atSameLevel(people, person, other)) continue;
    const distance = squaredDistance(people, person, other);
    if (!beats(distance, other, nearest)) continue;
    nearest.best = other;
    nearest.distance = distance;
  }
}

function nearestInGroup(search: Search, person: number): number {
  const { people, grid, radius } = search;
  const cellX = cellOf(people.x[person]!, radius);
  const cellZ = cellOf(people.z[person]!, radius);
  grid.nearest.best = -1;
  grid.nearest.distance = radius * radius;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) searchBucket(search, person, bucketOf(cellX + dx, cellZ + dz));
  }
  return grid.nearest.best;
}

function gather(search: Search): void {
  const { people, group, grid, radius } = search;
  grid.head.fill(-1);
  for (let person = 0; person < people.count; person++) {
    if (group[person] === 0) continue;
    const bucket = bucketOf(cellOf(people.x[person]!, radius), cellOf(people.z[person]!, radius));
    grid.next[person] = grid.head[bucket]!;
    grid.head[bucket] = person;
  }
}

export function talkSides(sitters: Sitters, grid: TalkGrid, out: Uint8Array): void {
  const search = { people: sitters, group: sitters.sitting, grid, radius: TALK_RADIUS };
  gather(search);
  for (let person = 0; person < sitters.count; person++) {
    if (sitters.sitting[person] !== 1) {
      out[person] = TALK.none;
      continue;
    }
    const other = nearestInGroup(search, person);
    out[person] = other < 0 ? TALK.none : sideTowards(sitters, person, other);
  }
}

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

function turnTowards(minglers: Minglers, person: number, other: number): number {
  const bearing = Math.atan2(
    minglers.x[other]! - minglers.x[person]!,
    minglers.z[other]! - minglers.z[person]!,
  );
  const off = wrap(bearing - minglers.heading[person]!);
  return Math.min(Math.max(off, -MINGLE_TURN_LIMIT), MINGLE_TURN_LIMIT);
}

export function mingleTurns(minglers: Minglers, grid: TalkGrid, out: Mingling): void {
  const search = { people: minglers, group: minglers.party, grid, radius: MINGLE_RADIUS };
  gather(search);
  for (let person = 0; person < minglers.count; person++) {
    const other = minglers.party[person] === 0 ? -1 : nearestInGroup(search, person);
    out.talks[person] = other < 0 ? 0 : 1;
    out.turn[person] = other < 0 ? 0 : turnTowards(minglers, person, other);
  }
}

// Offsets stay within the turn limit, so no wrap: the short way round is the straight way.
export const easeTurn = (now: number, target: number, step: number): number =>
  now + Math.min(Math.max(target - now, -step), step);

// Per party, so a pair turns to each other together and looks away together; offset per party
// so the whole resort does not turn at once.
export function facesParty(clock: number, party: number): boolean {
  const spells = clock / MINGLE_SPELL + unitAt(party, 0);
  return unitAt(party, Math.floor(spells) + 1) < MINGLE_FACING_SHARE;
}
