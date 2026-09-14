/**
 * People not walking into each other.
 *
 * A walker in `crowd.ts` is on a segment, and before this every walker was on
 * the *centreline* of it — so two people coming the opposite way down a path
 * walked through each other, and a fast walker overtook a slow one by passing
 * through them. What this module adds is deliberately small, and it leaves the
 * segment alone: the segment is where a person *means* to go, and two numbers
 * per person say how they are getting past whoever is in the way.
 *
 * - **`side`** — voxels to the right of the line they are walking, eased rather
 *   than snapped. Everybody on the paving keeps a little to the right when there
 *   is nobody about, which on its own is most of the head-on passes solved; when
 *   somebody is in the way they step aside, whichever way is the shorter step.
 * - **`pace`** — a multiplier on how fast they cover the segment. Somebody who
 *   cannot step aside far enough falls in behind; somebody crossing another's
 *   path at a junction lets them go first.
 *
 * ## One pass, and what it costs
 *
 * Everybody walking is dropped into a **fixed-size spatial hash** — a head per
 * slot and a next per person, both allocated once — and each walker looks at
 * the three-by-three cells round them for the nearest person ahead and inside
 * their shoulder width. That is a few distance checks per person rather than six
 * hundred, and it is independent of how big the plot is: the table is 4 096
 * slots whatever the plot, and a hash collision only ever costs a candidate who
 * is then rejected for being too far away.
 *
 * Nothing allocates — what one person decides is carried from one step of the
 * decision to the next in a handful of module-level numbers rather than in an
 * object per person per frame — and nothing here reads the terrain. The only
 * question asked of the world is a bitmap read on the sand: a sidestep that
 * would put somebody inside a lounger is not taken. See `sandGrid.ts`.
 *
 * ## Who gives way
 *
 * Two people who each yield to the other stand still for ever. So the rules are
 * asymmetric wherever they could be symmetric: head-on, both step aside the
 * shorter way (and to the right on a tie, which is the same way for both); at a
 * crossing, the higher index waits and the lower one walks on; and nobody ever
 * slows below {@link MIN_PACE}, so the worst a deadlock the rules missed can do
 * is two people shuffling past each other slowly.
 */

import { blockedAt, type SandGrid } from './sandGrid';

/**
 * What a person is doing, as far as avoiding people goes.
 *
 * `none` is resting — not in the hash, not steering. `seat` is walking to a
 * claimed seat: in the hash, so others go round them, but steering back to the
 * centre of their line, because they have to arrive exactly on the plank.
 */
export const LANE = { none: 0, seat: 1, paved: 2, sand: 3 } as const;

/** The columns avoidance reads and writes; `Crowd` is one. */
export interface Walkers {
  readonly count: number;
  /** Where each person is, as last placed. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** The unit ground direction of the segment each is walking. */
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  /** Voxels a second each walks at. */
  readonly speed: Float32Array;
  /** Voxels to the right of their line; see the note at the top of the file. */
  readonly side: Float32Array;
  /** Multiplier on their progress along the line. */
  readonly pace: Float32Array;
  /** One of {@link LANE}. */
  readonly lane: Uint8Array;
  /** The spatial hash: first person per slot, and the next person after each. */
  readonly cellHead: Int32Array;
  readonly cellNext: Int32Array;
}

/**
 * Fewest slots the hash has; always a power of two, so a slot is a mask.
 *
 * A crowd grows with the paving (see `crowdSizeFor`), and a fixed table would
 * pile a big resort's walkers into shared slots until every scan walked
 * strangers from the other end of the plot. So the table keeps at least two
 * slots per person.
 */
const MIN_SLOTS = 4096;

/** The hash's buffers, for a crowd of `capacity`. */
export function proximityFor(capacity: number): {
  readonly cellHead: Int32Array;
  readonly cellNext: Int32Array;
} {
  let slots = MIN_SLOTS;
  while (slots < capacity * 2) slots *= 2;
  return { cellHead: new Int32Array(slots), cellNext: new Int32Array(capacity) };
}

/** Voxels per hash cell. As far as anybody looks ahead, so three cells cover it. */
const CELL = 12;

/** How far ahead somebody notices a person in the way, in voxels. */
const LOOK = 12;

/**
 * Voxels between two people's middles, across the direction of travel, that
 * counts as getting past: two bodies three voxels wide, and a little air.
 */
const CLEARANCE = 4;

/** Voxels ahead at which somebody who cannot get past has all but stopped. */
const CLOSEST = 4;

/** How far aside anybody steps, in voxels: well inside a sixteen-voxel path. */
export const MAX_SIDE = 4;

/** Where somebody on the paving walks with nobody about: keeping right. */
const REST_SIDE = 1;

/** Voxels a second somebody moves sideways; a sidestep, not a jump. */
const SIDE_RATE = 3;

/**
 * How much slower somebody drifts back to where they would rather walk once
 * nobody is in the way: quickly aside, slowly back, or an overtaker cuts
 * straight in front of whoever they just overtook.
 */
const RETURN_SLOWER = 3;

/** How quickly pace comes and goes, per second. */
const PACE_RATE = 1.5;

/** The slowest anybody goes for somebody else; see the note at the top. */
const MIN_PACE = 0.15;

/** Cosine above which two people are walking the same way, and below minus which they meet. */
const SAME_WAY = 0.3;

/** Voxels of height apart past which two people are on different ground. */
const HEIGHT_APART = 3;

/** The slot a point hashes to; `mask` is one less than the table's size. */
const slotOf = (x: number, z: number, mask: number): number =>
  (Math.imul(Math.floor(x / CELL), 73856093) ^ Math.imul(Math.floor(z / CELL), 19349663)) & mask;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * What the person being steered has decided so far this frame: where they want
 * to stand, how fast they want to go, how near the person in their way is (1
 * far, 0 on top of them), and who that is. Module-level so a frame allocates
 * nothing; only ever meaningful inside one call of {@link steerWalkers}.
 */
let wantSide = 0;
let wantPace = 1;
let closeness = 1;
let threat = -1;

/** The nearest person found so far by {@link scanSlot}, and how far ahead. */
let nearest = LOOK;

/**
 * Works out, for a frame, how far aside everybody walking is and how fast they
 * are going. Run before the crowd moves; `crowd.ts` then applies both.
 */
export function steerWalkers(walkers: Walkers, dt: number, sand: SandGrid | null): void {
  fillHash(walkers);
  for (let i = 0; i < walkers.count; i++) {
    const mode = walkers.lane[i]!;
    if (mode === LANE.none) {
      walkers.side[i] = 0;
      walkers.pace[i] = 1;
      continue;
    }
    wantSide = mode === LANE.paved ? REST_SIDE : 0;
    wantPace = 1;
    closeness = 1;
    threat = mode === LANE.seat ? -1 : nearestAhead(walkers, i);
    if (threat !== -1) giveWay(walkers, i);
    moveAside(walkers, i, dt, mode === LANE.sand ? sand : null);
  }
}

/** Drops everybody who is walking into the hash. */
function fillHash(walkers: Walkers): void {
  const { cellHead, cellNext } = walkers;
  const mask = cellHead.length - 1;
  cellHead.fill(-1);
  for (let i = 0; i < walkers.count; i++) {
    if (walkers.lane[i] === LANE.none) continue;
    const slot = slotOf(walkers.x[i]!, walkers.z[i]!, mask);
    cellNext[i] = cellHead[slot]!;
    cellHead[slot] = i;
  }
}

/** Decides how `i` gets past {@link threat}: a sidestep, a slower pace, or both. */
function giveWay(walkers: Walkers, i: number): void {
  const { x, z, dirX, dirZ, speed, pace } = walkers;
  const rx = x[threat]! - x[i]!;
  const rz = z[threat]! - z[i]!;
  const ahead = rx * dirX[i]! + rz * dirZ[i]!;
  const lateral = rx * dirZ[i]! - rz * dirX[i]!;
  const facing = dirX[i]! * dirX[threat]! + dirZ[i]! * dirZ[threat]!;
  const theirs = speed[threat]! * pace[threat]!;
  closeness = clamp((ahead - CLOSEST) / (LOOK - CLOSEST), 0, 1);

  const sameWay = facing > SAME_WAY;
  // Somebody ahead going the same way at least as fast is no obstacle.
  if (sameWay && theirs >= speed[i]!) return;

  const wanted = sidestep(walkers.side[i]!, lateral, sameWay);
  wantSide = clamp(wanted, -MAX_SIDE, MAX_SIDE);
  const cornered = Math.abs(wanted) > MAX_SIDE;
  const crossing = !sameWay && facing >= -SAME_WAY;
  if (sameWay && cornered) {
    // Overtaking, and no room to: fall in behind.
    wantPace = Math.max(MIN_PACE, (theirs / speed[i]!) * closeness);
  } else if (crossing ? i > threat : cornered) {
    // A crossing, where the higher index waits; or a meeting with no room.
    wantPace = Math.max(MIN_PACE, closeness);
  }
}

/**
 * Eases `i` towards {@link wantSide} and {@link wantPace}.
 *
 * On the sand, `sand` is the furniture, and it has two say-sos: a sidestep that
 * would put them inside something is not taken, and they wait instead; and if
 * the offset they are walking at runs into something a little way ahead, they
 * get back onto their own line — which was checked clear when they set off —
 * before it does.
 */
function moveAside(walkers: Walkers, i: number, dt: number, sand: SandGrid | null): void {
  const { x, z, dirX, dirZ, side, pace } = walkers;
  const now = side[i]!;
  let rate = threat === -1 ? (SIDE_RATE * dt) / RETURN_SLOWER : SIDE_RATE * dt;
  if (sand && now !== 0) {
    const probe = Math.abs(now) * 2 + 2;
    if (blockedAt(sand, x[i]! + dirX[i]! * probe, z[i]! + dirZ[i]! * probe)) {
      wantSide = 0;
      rate = SIDE_RATE * dt;
    }
  }
  let next = now + clamp(wantSide - now, -rate, rate);
  if (sand && Math.abs(next) > Math.abs(now) && blockedAside(walkers, i, sand, next)) {
    next = now;
    if (threat !== -1) wantPace = Math.min(wantPace, Math.max(MIN_PACE, closeness));
  }
  side[i] = next;
  pace[i] = pace[i]! + clamp(wantPace - pace[i]!, -PACE_RATE * dt, PACE_RATE * dt);
}

/** Whether standing `side` voxels aside of `i`'s line would be inside something. */
function blockedAside(walkers: Walkers, i: number, sand: SandGrid, side: number): boolean {
  const { x, z, dirX, dirZ } = walkers;
  const now = walkers.side[i]!;
  // Back to the line, then out to the new offset.
  const lineX = x[i]! - dirZ[i]! * now;
  const lineZ = z[i]! + dirX[i]! * now;
  return blockedAt(sand, lineX + dirZ[i]! * side, lineZ - dirX[i]! * side);
}

/**
 * The side somebody at `side` steps to so a person `lateral` voxels to their
 * right is {@link CLEARANCE} away: whichever of passing them on the left or on
 * the right is the shorter step and still on the path.
 *
 * A tie goes right for a meeting and left for an overtake, which is what people
 * do — and what matters about it is the overtake: two people both keeping right
 * are dead in line, and passing on the right would be a step off the path.
 */
function sidestep(side: number, lateral: number, overtaking: boolean): number {
  const left = side + lateral - CLEARANCE;
  const right = side + lateral + CLEARANCE;
  const leftFits = Math.abs(left) <= MAX_SIDE;
  if (leftFits !== Math.abs(right) <= MAX_SIDE) return leftFits ? left : right;
  const leftStep = Math.abs(left - side);
  const rightStep = Math.abs(right - side);
  if (Math.abs(leftStep - rightStep) < 0.5) return overtaking ? left : right;
  return leftStep < rightStep ? left : right;
}

/** The nearest person ahead of `i` and inside their shoulder width, or -1. */
function nearestAhead(walkers: Walkers, i: number): number {
  nearest = LOOK;
  let found = -1;
  const mask = walkers.cellHead.length - 1;
  for (let ox = -CELL; ox <= CELL; ox += CELL) {
    for (let oz = -CELL; oz <= CELL; oz += CELL) {
      found = scanSlot(walkers, i, slotOf(walkers.x[i]! + ox, walkers.z[i]! + oz, mask), found);
    }
  }
  return found;
}

/**
 * The nearest person in one slot of the hash who is ahead of `i` and inside
 * their shoulder width, if nearer than `found` — which is handed back otherwise.
 */
function scanSlot(walkers: Walkers, i: number, slot: number, found: number): number {
  const { x, y, z, cellNext } = walkers;
  // Read once per slot rather than once per candidate: this is the hot loop.
  const px = x[i]!;
  const py = y[i]!;
  const pz = z[i]!;
  const dx = walkers.dirX[i]!;
  const dz = walkers.dirZ[i]!;
  for (let j = walkers.cellHead[slot]!; j !== -1; j = cellNext[j]!) {
    if (j === i || Math.abs(y[j]! - py) > HEIGHT_APART) continue;
    const rx = x[j]! - px;
    const rz = z[j]! - pz;
    const ahead = rx * dx + rz * dz;
    const lateral = rx * dz - rz * dx;
    if (ahead <= 0 || ahead >= nearest || Math.abs(lateral) >= CLEARANCE) continue;
    nearest = ahead;
    found = j;
  }
  return found;
}
