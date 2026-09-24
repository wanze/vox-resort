import { blockedAt, type SandGrid } from './sandGrid';

// seat walkers are in the hash but steer back to their line, to land exactly on the plank.
export const LANE = { none: 0, seat: 1, paved: 2, sand: 3 } as const;

export interface Walkers {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  readonly speed: Float32Array;
  // Voxels to the right of their line.
  readonly side: Float32Array;
  readonly pace: Float32Array;
  readonly lane: Uint8Array;
  readonly cellHead: Int32Array;
  readonly cellNext: Int32Array;
}

// Grows with the crowd so a big resort's walkers do not pile into shared slots;
// a power of two so a slot is a mask.
const MIN_SLOTS = 4096;

export function proximityFor(capacity: number): {
  readonly cellHead: Int32Array;
  readonly cellNext: Int32Array;
} {
  let slots = MIN_SLOTS;
  while (slots < capacity * 2) slots *= 2;
  return { cellHead: new Int32Array(slots), cellNext: new Int32Array(capacity) };
}

// Equal to LOOK, so the three-by-three cells round somebody cover it.
const CELL = 12;

const LOOK = 12;

// Two bodies three voxels wide, and a little air.
const CLEARANCE = 4;

const CLOSEST = 4;

// Well inside a sixteen-voxel path.
export const MAX_SIDE = 4;

const REST_SIDE = 1;

const SIDE_RATE = 3;

// Quickly aside, slowly back, or an overtaker cuts straight in front of whoever
// they just overtook.
const RETURN_SLOWER = 3;

const PACE_RATE = 1.5;

const MIN_PACE = 0.15;

const SAME_WAY = 0.3;

const HEIGHT_APART = 3;

const slotOf = (x: number, z: number, mask: number): number =>
  (Math.imul(Math.floor(x / CELL), 73856093) ^ Math.imul(Math.floor(z / CELL), 19349663)) & mask;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// Module-level so a frame allocates nothing; only meaningful inside steerWalkers.
let wantSide = 0;
let wantPace = 1;
let closeness = 1;
let threat = -1;

let nearest = LOOK;

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

// Asymmetric so two people never both yield: head-on both step the shorter way,
// at a crossing the higher index waits, and MIN_PACE bounds any missed deadlock.
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
  if (sameWay && theirs >= speed[i]!) return;

  const wanted = sidestep(walkers.side[i]!, lateral, sameWay);
  wantSide = clamp(wanted, -MAX_SIDE, MAX_SIDE);
  const cornered = Math.abs(wanted) > MAX_SIDE;
  const crossing = !sameWay && facing >= -SAME_WAY;
  if (sameWay && cornered) {
    wantPace = Math.max(MIN_PACE, (theirs / speed[i]!) * closeness);
  } else if (crossing ? i > threat : cornered) {
    wantPace = Math.max(MIN_PACE, closeness);
  }
}

// On sand, a sidestep into furniture is not taken; an offset that runs into
// something ahead falls back to the line, which was checked clear at departure.
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

function blockedAside(walkers: Walkers, i: number, sand: SandGrid, side: number): boolean {
  const { x, z, dirX, dirZ } = walkers;
  const now = walkers.side[i]!;
  const lineX = x[i]! - dirZ[i]! * now;
  const lineZ = z[i]! + dirX[i]! * now;
  return blockedAt(sand, lineX + dirZ[i]! * side, lineZ - dirX[i]! * side);
}

// A tie goes left for an overtake: two people keeping right are dead in line,
// and passing on the right would step off the path.
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
