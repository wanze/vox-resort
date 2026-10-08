import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { blockedAt, clearLine } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE } from '../../crowd/domain/walkNetwork';
import { terrainAt } from '../../layout/domain/shoreline';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { walkingTicks } from '../../sim/domain/crowdRate';
import { mix, unitOf } from '../../random/domain/hash';
import { SHOWN, type Cast, type SandCastles } from './casting';
import { SWIM_WINDOW, type SeaShore } from './seaSwim';

export const HOST_SHARE = 0.3;
const JOIN = { child: 0.7, adult: 0.25 } as const;
export const MAX_BUILDERS = 4;
const GATHER_REACH = 2 * TILE_VOXELS;

// With the walks and the linger it has to fit a beach window.
const BUILD_SECONDS = { min: 60, max: 150 } as const;
const LINGER_SECONDS = 40;
const SLUMP_SECONDS = 15;

// From the castle's middle to a builder's: the castle is five voxels across.
export const RING = 4;
const SPOT_OUT = { min: 8, max: 16 } as const;
const SPOT_SIDE = 6;
const SPOT_TRIES = 6;
// More than a lying body, so nobody kneels on somebody's towel.
const PITCH_CLEAR = RING + 4;
const CASTLE_CLEAR = 2 * RING + 4;
const BODY = 1.5;
// See seaSwim.ts: the walk from a lounger starts inside it.
const LOUNGER_CLEAR = TILE_VOXELS / 2 + 2;

// A standing figure sunk into the sand reads as kneeling in it, as at the kids club's sandpit.
const KNEEL = { child: 1, adult: 1.5 } as const;
const DIG_PERIOD = 2.4;

const HOST = 21;
const JOINS = 22;
const SIDE = 23;
const OUT = 24;
const BUILD = 25;
const OFFSET = 26;
const PHASE = 27;

const STRIDE = 6;

export interface CastleGroup {
  readonly x: number;
  readonly z: number;
  readonly start: number;
  readonly begun: number;
  readonly built: number;
  readonly gone: number;
  readonly builders: Int32Array;
  readonly legs: Float64Array;
}

export interface Builder {
  readonly person: number;
  readonly x: number;
  readonly z: number;
  readonly child: boolean;
  readonly onLounger: boolean;
  readonly party: number;
  readonly ticksLeft: number;
}

interface Point {
  readonly x: number;
  readonly z: number;
}

const unit = (person: number, window: number, channel: number): number =>
  unitOf(mix(mix(mix(person) + window) + channel));

function onSand(sea: SeaShore, x: number, z: number): boolean {
  const shore = sea.swim.shore;
  if (!shore) return false;
  const tile = terrainAt(shore, Math.floor(x / TILE_VOXELS), Math.floor(z / TILE_VOXELS));
  return tile === 'beach' && !(sea.sand && blockedAt(sea.sand, x, z));
}

function roomFor(
  sea: SeaShore,
  spot: Point,
  pitches: readonly Point[],
  castles: readonly Point[],
): boolean {
  const reach = RING + BODY;
  for (let side = 0; side <= 8; side++) {
    const angle = (side * Math.PI) / 4;
    const out = side === 8 ? 0 : reach;
    if (!onSand(sea, spot.x + Math.sin(angle) * out, spot.z + Math.cos(angle) * out)) return false;
  }
  const near = (other: Point, clear: number) =>
    Math.hypot(other.x - spot.x, other.z - spot.z) < clear;
  return (
    !pitches.some((pitch) => near(pitch, PITCH_CLEAR)) &&
    !castles.some((at) => near(at, CASTLE_CLEAR))
  );
}

// Heading 0 faces +z, which is the sea everywhere, so children build between their towel and it.
function spotFor(
  sea: SeaShore,
  host: Builder,
  window: number,
  pitches: readonly Point[],
  castles: readonly Point[],
): Point | null {
  for (let tries = 0; tries < SPOT_TRIES; tries++) {
    const side = (2 * unit(host.person, window, SIDE + 8 * tries) - 1) * SPOT_SIDE;
    const out = unit(host.person, window, OUT + 8 * tries);
    const spot = {
      x: host.x + side,
      z: host.z + SPOT_OUT.min + out * (SPOT_OUT.max - SPOT_OUT.min),
    };
    if (roomFor(sea, spot, pitches, castles)) return spot;
  }
  return null;
}

function joins(guest: Builder, host: Builder, adults: number, window: number): boolean {
  const own = !guest.child && adults === 0 && guest.party >= 0 && guest.party === host.party;
  const share = guest.child ? JOIN.child : own ? JOIN.adult : 0;
  return unit(guest.person, window, JOINS) < share;
}

function membersFor(
  candidates: readonly Builder[],
  host: number,
  spot: Point,
  taken: ReadonlySet<number>,
  window: number,
): Builder[] {
  const members = [candidates[host]!];
  let adults = 0;
  for (const [at, guest] of candidates.entries()) {
    if (members.length >= MAX_BUILDERS) break;
    if (at === host || taken.has(guest.person)) continue;
    if (Math.hypot(guest.x - spot.x, guest.z - spot.z) > GATHER_REACH) continue;
    if (!joins(guest, candidates[host]!, adults, window)) continue;
    members.push(guest);
    if (!guest.child) adults++;
  }
  return members;
}

const turnBetween = (a: number, b: number): number => {
  const turn = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(turn, 2 * Math.PI - turn);
};

interface Seat {
  readonly member: Builder;
  readonly x: number;
  readonly z: number;
  readonly walk: number;
}

// A member with no clear walk stays put rather than calling the castle off for everybody.
function seatsFor(sea: SeaShore, spot: Point, members: readonly Builder[]): Seat[] {
  const toward = (member: Builder) => Math.atan2(member.x - spot.x, member.z - spot.z);
  const base = toward(members[0]!);
  const free = members.map((_, at) => base + (2 * Math.PI * at) / members.length);
  const seats: Seat[] = [];
  for (const member of members) {
    const own = toward(member);
    let best = 0;
    for (let at = 1; at < free.length; at++) {
      if (turnBetween(free[at]!, own) < turnBetween(free[best]!, own)) best = at;
    }
    const [angle] = free.splice(best, 1);
    const x = spot.x + Math.sin(angle!) * RING;
    const z = spot.z + Math.cos(angle!) * RING;
    const skip = member.onLounger ? LOUNGER_CLEAR : 0;
    if (sea.sand && !clearLine(sea.sand, member.x, member.z, x, z, skip)) continue;
    seats.push({ member, x, z, walk: Math.hypot(x - member.x, z - member.z) / WALK_SPEED });
  }
  return seats;
}

// Started only when it can be seen from its first step and fits its window, and only by those
// whose stay outlasts their walk back, so nobody pops onto the sand or off it.
function gather(
  sea: SeaShore,
  spot: Point,
  members: readonly Builder[],
  window: number,
  clock: number,
): CastleGroup | null {
  const host = members[0]!;
  const all = seatsFor(sea, spot, members);
  if (all[0]?.member !== host) return null;
  const longest = Math.max(...all.map((seat) => seat.walk));
  const build =
    BUILD_SECONDS.min + unit(host.person, window, BUILD) * (BUILD_SECONDS.max - BUILD_SECONDS.min);
  const seconds = longest + build + Math.max(longest, LINGER_SECONDS);
  if (seconds > SWIM_WINDOW) return null;
  const start = window * SWIM_WINDOW + unit(host.person, window, OFFSET) * (SWIM_WINDOW - seconds);
  if (start < clock) return null;
  const built = start + longest + build;
  const stays = (seat: Seat) =>
    walkingTicks((built + seat.walk - clock) * WALK_SPEED) <= seat.member.ticksLeft;
  const seats = all.filter(stays);
  if (seats[0]?.member !== host) return null;
  const legs = seats.flatMap(({ member, x, z, walk }) => [
    member.x,
    member.z,
    x,
    z,
    walk,
    member.child ? KNEEL.child : KNEEL.adult,
  ]);
  return {
    x: spot.x,
    z: spot.z,
    start,
    begun: start + Math.min(...seats.map((seat) => seat.walk)),
    built,
    gone: built + LINGER_SECONDS,
    builders: Int32Array.from(seats, (seat) => seat.member.person),
    legs: Float64Array.from(legs),
  };
}

export function planCastles(
  sea: SeaShore,
  candidates: readonly Builder[],
  pitches: readonly Point[],
  window: number,
  clock: number,
  most: number,
): CastleGroup[] {
  const groups: CastleGroup[] = [];
  const taken = new Set<number>();
  for (const [at, host] of candidates.entries()) {
    if (groups.length >= most) break;
    if (!host.child || taken.has(host.person)) continue;
    if (unit(host.person, window, HOST) >= HOST_SHARE) continue;
    const spot = spotFor(sea, host, window, pitches, groups);
    if (!spot) continue;
    const group = gather(sea, spot, membersFor(candidates, at, spot, taken, window), window, clock);
    if (!group) continue;
    for (const person of group.builders) taken.add(person);
    groups.push(group);
  }
  return groups;
}

interface Drawn {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  readonly pose: Float32Array;
}

function walkAt(into: Drawn, person: number, from: Point, to: Point, done: number): void {
  into.x[person] = from.x + (to.x - from.x) * done;
  into.z[person] = from.z + (to.z - from.z) * done;
  into.y[person] = BEACH_SURFACE;
  into.heading[person] = Math.atan2(to.x - from.x, to.z - from.z);
  into.pose[person] = RESTING.none;
}

export function buildAt(
  group: CastleGroup,
  builder: number,
  clock: number,
  into: Drawn,
  person: number,
): boolean {
  const { legs } = group;
  const at = builder * STRIDE;
  const pitch = { x: legs[at]!, z: legs[at + 1]! };
  const seat = { x: legs[at + 2]!, z: legs[at + 3]! };
  const walk = legs[at + 4]!;
  if (clock < group.start || clock >= group.built + walk) return false;
  if (clock < group.start + walk) {
    walkAt(into, person, pitch, seat, (clock - group.start) / walk);
  } else if (clock >= group.built) {
    walkAt(into, person, seat, pitch, (clock - group.built) / walk);
  } else {
    into.x[person] = seat.x;
    into.z[person] = seat.z;
    into.y[person] = BEACH_SURFACE - legs[at + 5]!;
    into.heading[person] = Math.atan2(group.x - seat.x, group.z - seat.z);
    const turns = clock / DIG_PERIOD + unit(person, 0, PHASE);
    into.pose[person] = poseWith(DRAWN_POSE.strike, turns - Math.floor(turns));
  }
  return true;
}

export function stageAt(group: CastleGroup, clock: number, stages: number): number {
  if (clock < group.begun || clock >= group.gone) return -1;
  if (clock < group.built) {
    const done = (clock - group.begun) / (group.built - group.begun);
    return Math.min(stages - 1, Math.floor(done * stages));
  }
  const left = group.gone - clock;
  return left >= SLUMP_SECONDS ? stages - 1 : Math.floor((left / SLUMP_SECONDS) * stages);
}

function candidatesOf(cast: Cast, ticks: number): Builder[] {
  const { bathers } = cast;
  const candidates: Builder[] = [];
  for (let at = 0; at < bathers.count; at++) {
    const person = bathers.people[at]!;
    if (bathers.trips[person] || cast.chair[person] === 1) continue;
    candidates.push({
      person,
      x: bathers.x[person]!,
      z: bathers.z[person]!,
      child: bathers.child[person] === 1,
      onLounger: bathers.onLounger[person] === 1,
      party: cast.party[person]!,
      ticksLeft: bathers.until[person]! - ticks,
    });
  }
  return candidates;
}

function pitchesOf(cast: Cast): Point[] {
  const { bathers } = cast;
  return Array.from(bathers.people.subarray(0, bathers.count), (person) => ({
    x: bathers.x[person]!,
    z: bathers.z[person]!,
  }));
}

function plan(cast: Cast, window: number, clock: number, ticks: number): void {
  const { castles } = cast;
  castles.window = window;
  castles.groups = planCastles(
    cast.bathers.sea!,
    candidatesOf(cast, ticks),
    pitchesOf(cast),
    window,
    clock,
    castles.stages.length,
  );
  castles.groupOf.fill(-1);
  for (const [index, group] of castles.groups.entries()) {
    for (const [builder, person] of group.builders.entries()) {
      castles.groupOf[person] = index;
      castles.builderOf[person] = builder;
    }
  }
}

function drawBuilders(cast: Cast, clock: number): void {
  const { bathers, castles } = cast;
  for (let at = 0; at < bathers.count; at++) {
    const person = bathers.people[at]!;
    const index = castles.groupOf[person]!;
    if (index < 0 || cast.shown[person] === SHOWN.placed) continue;
    const group = castles.groups[index]!;
    if (buildAt(group, castles.builderOf[person]!, clock, cast, person)) {
      cast.shown[person] = SHOWN.placed;
    }
  }
}

function drawCastles(castles: SandCastles, clock: number): void {
  for (const [slot, stages] of castles.stages.entries()) {
    const group = castles.groups[slot];
    const stage = group ? stageAt(group, clock, stages.length) : -1;
    for (const [at, ball] of stages.entries()) {
      ball.shown = at === stage;
      ball.x = group?.x ?? 0;
      ball.y = BEACH_SURFACE;
      ball.z = group?.z ?? 0;
    }
  }
}

// After performAtSea: builders are picked from those it sent on no swim.
export function performOnSand(cast: Cast, clock: number, ticks: number): void {
  if (!cast.bathers.sea) return;
  const window = Math.floor(clock / SWIM_WINDOW);
  if (cast.castles.window !== window) plan(cast, window, clock, ticks);
  drawBuilders(cast, clock);
  drawCastles(cast.castles, clock);
}
