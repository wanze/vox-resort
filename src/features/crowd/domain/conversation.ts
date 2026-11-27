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

const cellOf = (at: number): number => Math.floor(at / TALK_RADIUS);

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

const squaredDistance = (sitters: Sitters, a: number, b: number): number =>
  (sitters.x[b]! - sitters.x[a]!) ** 2 + (sitters.z[b]! - sitters.z[a]!) ** 2;

const atSameLevel = (sitters: Sitters, a: number, b: number): boolean =>
  Math.abs(sitters.y[b]! - sitters.y[a]!) <= TALK_RISE;

// Ties go to the lower index, so two equal neighbours never flicker between frames.
const beats = (distance: number, other: number, nearest: Nearest): boolean =>
  distance < nearest.distance ||
  (distance === nearest.distance && (nearest.best < 0 || other < nearest.best));

function searchBucket(sitters: Sitters, grid: TalkGrid, person: number, bucket: number): void {
  const { nearest } = grid;
  for (let other = grid.head[bucket]!; other >= 0; other = grid.next[other]!) {
    if (other === person || !atSameLevel(sitters, person, other)) continue;
    const distance = squaredDistance(sitters, person, other);
    if (!beats(distance, other, nearest)) continue;
    nearest.best = other;
    nearest.distance = distance;
  }
}

function nearestSitter(sitters: Sitters, grid: TalkGrid, person: number): number {
  const cellX = cellOf(sitters.x[person]!);
  const cellZ = cellOf(sitters.z[person]!);
  grid.nearest.best = -1;
  grid.nearest.distance = TALK_RADIUS * TALK_RADIUS;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++)
      searchBucket(sitters, grid, person, bucketOf(cellX + dx, cellZ + dz));
  }
  return grid.nearest.best;
}

export function talkSides(sitters: Sitters, grid: TalkGrid, out: Uint8Array): void {
  grid.head.fill(-1);
  for (let person = 0; person < sitters.count; person++) {
    if (sitters.sitting[person] !== 1) continue;
    const bucket = bucketOf(cellOf(sitters.x[person]!), cellOf(sitters.z[person]!));
    grid.next[person] = grid.head[bucket]!;
    grid.head[bucket] = person;
  }
  for (let person = 0; person < sitters.count; person++) {
    if (sitters.sitting[person] !== 1) {
      out[person] = TALK.none;
      continue;
    }
    const other = nearestSitter(sitters, grid, person);
    out[person] = other < 0 ? TALK.none : sideTowards(sitters, person, other);
  }
}
