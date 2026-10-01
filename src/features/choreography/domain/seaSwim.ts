import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { clearLine, type SandGrid } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE } from '../../crowd/domain/walkNetwork';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { SEA_LEVEL } from '../../rendering/domain/terrainSurface';
import { swimmableAt, type SwimAreaOptions } from '../../sea/domain/swimArea';
import { walkingTicks } from '../../sim/domain/crowdRate';
import { mix } from '../../sim/domain/night';
import { SWIM_SINK, SWIM_SPEED, TREAD_SINK } from './acts';
import { SHOWN, type Cast } from './casting';

// Of the resting guests, the share out on a swim at any moment.
export const SWIM_SHARE = { adult: 1 / 4, child: 1 / 3 } as const;

// Crowd seconds, about a sim hour and three quarters: a trip never runs past its window, so the
// longest from the back of the beach has to fit.
export const SWIM_WINDOW = 240;

const WADE_SPEED = WALK_SPEED / 2;
// Sunk from the sand to treading depth over the first tile of water.
const WADE_DEPTH = TILE_VOXELS;
const REACH = 2 * TILE_VOXELS;
const PAUSE = { min: 10, max: 40 } as const;
const SECOND_LEG = 0.5;
// A lounger is a tile long and its holder lies at its middle, so the walk starts inside it: half
// a tile and a body's width see them off its foot.
const LOUNGER_CLEAR = TILE_VOXELS / 2 + 2;

const CHANCE = 1;
const OFFSET = 2;
const ALONG = 3;
const OUT = 4;
const REST = 5;
const AGAIN = 6;

export interface SeaShore {
  readonly sand: SandGrid | null;
  readonly swim: SwimAreaOptions;
}

const KIND = { walk: 0, wade: 1, swim: 2, tread: 3 } as const;
const STRIDE = 7;

export interface SwimTrip {
  // Act clock seconds.
  readonly start: number;
  readonly seconds: number;
  // Where the sand stops at the pitch's x, for the wade to sink from.
  readonly edgeZ: number;
  // Per leg: kind, from x, from z, to x, to z, seconds, heading.
  readonly legs: Float64Array;
}

export interface Bather {
  readonly person: number;
  readonly x: number;
  readonly z: number;
  readonly child: boolean;
  readonly onLounger: boolean;
  readonly ticksLeft: number;
}

interface Band {
  readonly fromZ: number;
  readonly toZ: number;
}

const unit = (person: number, window: number, channel: number): number =>
  mix(mix(mix(person) + window) + channel) / 4_294_967_296;

// Every column from west to east, so a leg between two points in it never crosses a sandbar.
function bandAcross(swim: SwimAreaOptions, west: number, east: number): Band | null {
  let fromZ = -Infinity;
  let toZ = Infinity;
  for (let x = west; x < east + TILE_VOXELS; x += TILE_VOXELS) {
    const band = swimmableAt(swim, Math.min(x, east));
    if (!band) return null;
    fromZ = Math.max(fromZ, band.fromZ);
    toZ = Math.min(toZ, band.toZ);
  }
  return toZ > fromZ + WADE_DEPTH ? { fromZ, toZ } : null;
}

interface Legs {
  list: number[];
  x: number;
  z: number;
  heading: number;
}

function addLeg(legs: Legs, kind: number, x: number, z: number, speed: number): void {
  const length = Math.hypot(x - legs.x, z - legs.z);
  if (length > 0) legs.heading = Math.atan2(x - legs.x, z - legs.z);
  legs.list.push(kind, legs.x, legs.z, x, z, length / speed, legs.heading);
  legs.x = x;
  legs.z = z;
}

function addPause(legs: Legs, seconds: number): void {
  legs.list.push(KIND.tread, legs.x, legs.z, legs.x, legs.z, seconds, legs.heading);
}

// Out from the pitch, a leg or two inside the buoys, and back the same way.
function legsOf(
  bather: Bather,
  edgeZ: number,
  band: Band,
  wide: boolean,
  window: number,
): Float64Array {
  const { person, x, z } = bather;
  const legs: Legs = { list: [], x, z, heading: 0 };
  const deepZ = band.fromZ + WADE_DEPTH;
  addLeg(legs, KIND.walk, x, edgeZ, WALK_SPEED);
  addLeg(legs, KIND.wade, x, deepZ, WADE_SPEED);
  const count = unit(person, window, AGAIN) < SECOND_LEG ? 2 : 1;
  for (let leg = 0; leg < count; leg++) {
    const along = wide ? (2 * unit(person, window, ALONG + 8 * leg) - 1) * REACH : 0;
    const out = deepZ + unit(person, window, OUT + 8 * leg) * (band.toZ - deepZ);
    addLeg(legs, KIND.swim, x + along, out, SWIM_SPEED);
    addPause(legs, PAUSE.min + unit(person, window, REST + 8 * leg) * (PAUSE.max - PAUSE.min));
  }
  addLeg(legs, KIND.swim, x, deepZ, SWIM_SPEED);
  addLeg(legs, KIND.wade, x, edgeZ, WADE_SPEED);
  addLeg(legs, KIND.walk, x, z, WALK_SPEED);
  return Float64Array.from(legs.list);
}

function secondsOf(legs: Float64Array): number {
  let seconds = 0;
  for (let at = 0; at < legs.length; at += STRIDE) seconds += legs[at + 5]!;
  return seconds;
}

// Decided once a window. Started only where it can be seen from its first step and when the
// stay outlasts it, so a swimmer neither appears in the water nor pops back onto the sand.
export function planSwim(
  sea: SeaShore,
  bather: Bather,
  window: number,
  clock: number,
): SwimTrip | null {
  const { person, x, z } = bather;
  const narrow = swimmableAt(sea.swim, x);
  if (!narrow || z >= narrow.fromZ) return null;
  const edgeZ = narrow.fromZ;
  const skip = bather.onLounger ? LOUNGER_CLEAR : 0;
  if (sea.sand && !clearLine(sea.sand, x, z, x, edgeZ, skip)) return null;
  const wide = bandAcross(sea.swim, x - REACH, x + REACH);
  const band = wide ?? (narrow.toZ > edgeZ + WADE_DEPTH ? narrow : null);
  if (!band) return null;
  const legs = legsOf(bather, edgeZ, band, wide !== null, window);
  const seconds = secondsOf(legs);
  if (seconds > SWIM_WINDOW) return null;
  // Scaled by the trip, so a short one is taken more often and the share in the water holds.
  const share = bather.child ? SWIM_SHARE.child : SWIM_SHARE.adult;
  if (unit(person, window, CHANCE) >= (share * SWIM_WINDOW) / seconds) return null;
  const start = window * SWIM_WINDOW + unit(person, window, OFFSET) * (SWIM_WINDOW - seconds);
  if (start < clock) return null;
  if (walkingTicks((start + seconds - clock) * WALK_SPEED) > bather.ticksLeft) return null;
  return { start, seconds, edgeZ, legs };
}

interface Drawn {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  readonly pose: Float32Array;
}

function heightOn(kind: number, z: number, edgeZ: number): number {
  if (kind === KIND.walk) return BEACH_SURFACE;
  if (kind === KIND.swim) return SEA_LEVEL - SWIM_SINK;
  const tread = SEA_LEVEL - TREAD_SINK;
  if (kind === KIND.tread) return tread;
  const deep = Math.min(Math.max((z - edgeZ) / WADE_DEPTH, 0), 1);
  return BEACH_SURFACE + (tread - BEACH_SURFACE) * deep;
}

function poseOn(kind: number): number {
  if (kind === KIND.walk) return RESTING.none;
  if (kind === KIND.tread) return RESTING.standing;
  return kind === KIND.swim ? DRAWN_POSE.swim : DRAWN_POSE.wade;
}

// False outside the trip, where the crowd's own pitch pose is the one to draw.
export function swimAt(trip: SwimTrip, clock: number, into: Drawn, person: number): boolean {
  let time = clock - trip.start;
  if (time < 0 || time >= trip.seconds) return false;
  const { legs } = trip;
  let at = 0;
  while (at + STRIDE < legs.length && time >= legs[at + 5]!) {
    time -= legs[at + 5]!;
    at += STRIDE;
  }
  const kind = legs[at]!;
  const seconds = legs[at + 5]!;
  const done = seconds > 0 ? Math.min(time / seconds, 1) : 1;
  const x = legs[at + 1]! + (legs[at + 3]! - legs[at + 1]!) * done;
  const z = legs[at + 2]! + (legs[at + 4]! - legs[at + 2]!) * done;
  into.x[person] = x;
  into.z[person] = z;
  into.y[person] = heightOn(kind, z, trip.edgeZ);
  into.heading[person] = legs[at + 6]!;
  into.pose[person] = poseOn(kind);
  return true;
}

// Every frame, after perform: a resting beach guest on a swim is drawn in the sea, and as the
// crowd holds them otherwise. The router never hears of it.
export function performAtSea(cast: Cast, clock: number, ticks: number): void {
  const { bathers } = cast;
  const sea = bathers.sea;
  if (!sea) return;
  const window = Math.floor(clock / SWIM_WINDOW);
  for (let at = 0; at < bathers.count; at++) {
    const person = bathers.people[at]!;
    if (bathers.window[person] !== window) {
      bathers.window[person] = window;
      bathers.trips[person] = planSwim(
        sea,
        {
          person,
          x: bathers.x[person]!,
          z: bathers.z[person]!,
          child: bathers.child[person] === 1,
          onLounger: bathers.onLounger[person] === 1,
          ticksLeft: bathers.until[person]! - ticks,
        },
        window,
        clock,
      );
    }
    const trip = bathers.trips[person];
    const away = trip !== null && trip !== undefined && swimAt(trip, clock, cast, person);
    cast.shown[person] = away ? SHOWN.placed : SHOWN.asCrowd;
  }
}
