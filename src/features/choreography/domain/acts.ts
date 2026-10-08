import type { LoopPose } from '../../../../voxel-gen/voxelgen.ts';
import { MAX_STEP, RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { mix, unitOf } from '../../random/domain/hash';
import type { Cast } from './casting';
import { playGames } from './courts';
import { playRounds } from './golf';
import { mindChildren, playSpot } from './play';
import { playShows } from './shows';
import { playTag } from './tag';
import type { AreaPlace, LoopPlace, Place, StillPlace } from './places';

export type AreaAct = 'swim' | 'laps' | 'wade';

export interface WaterArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly round: boolean;
  // The water's top face, in world voxels.
  readonly surface: number;
  // Mixed into every hash, so two pools' swimmers do not swim the same lengths.
  readonly salt: number;
}

export interface LoopStop {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pose: LoopPose;
}

export interface RideLoop {
  readonly stops: readonly LoopStop[];
  // Seconds from the first stop to each; one more entry than stops, the last being the period.
  readonly arrive: Float64Array;
  readonly headings: Float64Array;
  readonly riders: number;
}

export const isMoving = (place: Place): place is Exclude<Place, StillPlace> =>
  place.act !== undefined && place.act !== 'still';

const isArea = (place: Place): place is AreaPlace =>
  place.act === 'swim' || place.act === 'laps' || place.act === 'wade';

export const SWIM_SPEED = WALK_SPEED / 3;
const WADE_SPEED = WALK_SPEED;
// About a rung a second: the ladder's rungs are two layers apart.
const CLIMB_SPEED = 1.5;
const SLIDE_SPEED = 12;
// Hand over hand, a rung every two seconds or so; letting go is a fall.
const HANG_SPEED = 1.5;
const DROP_SPEED = 12;

// Zero: 045's swim pose already lowers the body so a quarter voxel of back and the head's top
// stay above the instance; any lower and the opaque water swallows the swimmer whole.
export const SWIM_SINK = 0;
// Resting between legs: an adult's shoulders stay half a voxel above, so the head clears the water.
export const TREAD_SINK = 2;
// Feet on a one-layer paddling pool's floor, so the water laps the shins.
export const WADE_SINK = 1;

const PAUSE = { min: 1, max: 4 } as const;
// About a swimmer's reach ahead of the hips: no target is nearer the coping than this.
const MARGIN = 2;

const LANE = 1;
const ALONG = 2;
const ACROSS = 3;
const REST = 4;
const PARITY = 5;

const hashOf = (person: number, n: number, salt: number, channel: number): number =>
  mix(mix(mix(person + salt) + n) + channel);

const spread = (min: number, max: number, hash: number): number =>
  min + MARGIN + unitOf(hash) * Math.max(max - min - 2 * MARGIN, 0);

// Written into, so performing allocates nothing.
const point = { x: 0, z: 0 };

function wanderPoint(area: WaterArea, person: number, n: number): void {
  const u = unitOf(hashOf(person, n, area.salt, ALONG));
  const v = unitOf(hashOf(person, n, area.salt, ACROSS));
  if (!area.round) {
    point.x = area.minX + MARGIN + u * Math.max(area.maxX - area.minX - 2 * MARGIN, 0);
    point.z = area.minZ + MARGIN + v * Math.max(area.maxZ - area.minZ - 2 * MARGIN, 0);
    return;
  }
  // Square-rooted so the points fall evenly over the disc rather than bunching at its middle.
  const reach = Math.sqrt(u);
  const angle = v * 2 * Math.PI;
  const radiusX = Math.max((area.maxX - area.minX) / 2 - MARGIN, 0);
  const radiusZ = Math.max((area.maxZ - area.minZ) / 2 - MARGIN, 0);
  point.x = (area.minX + area.maxX) / 2 + radiusX * reach * Math.cos(angle);
  point.z = (area.minZ + area.maxZ) / 2 + radiusZ * reach * Math.sin(angle);
}

// The long way, in a lane of their own; the first leg starts somewhere along it, so a pool cast
// together does not set off from the wall as one.
function lapPoint(area: WaterArea, person: number, n: number): void {
  const alongX = area.maxX - area.minX >= area.maxZ - area.minZ;
  const min = alongX ? area.minX : area.minZ;
  const max = alongX ? area.maxX : area.maxZ;
  const across = alongX
    ? spread(area.minZ, area.maxZ, hashOf(person, 0, area.salt, LANE))
    : spread(area.minX, area.maxX, hashOf(person, 0, area.salt, LANE));
  const end = (n + hashOf(person, 0, area.salt, PARITY)) % 2 === 0 ? min + MARGIN : max - MARGIN;
  const along = n === 0 ? spread(min, max, hashOf(person, 0, area.salt, ALONG)) : end;
  point.x = alongX ? along : across;
  point.z = alongX ? across : along;
}

function pointOf(place: AreaPlace, person: number, n: number): void {
  if (place.act === 'laps') lapPoint(place.area, person, n);
  else wanderPoint(place.area, person, n);
}

const speedOf = (place: AreaPlace): number => (place.act === 'wade' ? WADE_SPEED : SWIM_SPEED);

function legSeconds(cast: Cast, person: number, place: AreaPlace, n: number): number {
  const dx = cast.toX[person]! - cast.fromX[person]!;
  const dz = cast.toZ[person]! - cast.fromZ[person]!;
  const rest =
    PAUSE.min + unitOf(hashOf(person, n, place.area.salt, REST)) * (PAUSE.max - PAUSE.min);
  return Math.hypot(dx, dz) / speedOf(place) + rest;
}

// Leg n runs from point n to point n + 1, then rests there.
function startLeg(cast: Cast, person: number, place: AreaPlace, start: number): void {
  pointOf(place, person, 0);
  cast.fromX[person] = point.x;
  cast.fromZ[person] = point.z;
  pointOf(place, person, 1);
  cast.toX[person] = point.x;
  cast.toZ[person] = point.z;
  cast.legNo[person] = 0;
  cast.legStart[person] = start;
  cast.legSeconds[person] = legSeconds(cast, person, place, 0);
}

function nextLeg(cast: Cast, person: number, place: AreaPlace): void {
  const n = cast.legNo[person]! + 1;
  cast.fromX[person] = cast.toX[person]!;
  cast.fromZ[person] = cast.toZ[person]!;
  pointOf(place, person, n + 1);
  cast.toX[person] = point.x;
  cast.toZ[person] = point.z;
  cast.legNo[person] = n;
  cast.legStart[person] = cast.legStart[person]! + cast.legSeconds[person]!;
  cast.legSeconds[person] = legSeconds(cast, person, place, n);
}

function movingPose(place: AreaPlace, n: number): number {
  if (place.act !== 'wade') return DRAWN_POSE.swim;
  return n % 3 === 2 ? DRAWN_POSE.hop : DRAWN_POSE.wade;
}

// Standing still, not the wade's sculling: swung arms on an upright body read as a walk.
const restingPose = (place: AreaPlace): number =>
  place.act === 'wade' ? DRAWN_POSE.wade : RESTING.standing;

function sinkOf(place: AreaPlace, moving: boolean): number {
  if (place.act === 'wade') return WADE_SINK;
  return moving ? SWIM_SINK : TREAD_SINK;
}

function swimArea(cast: Cast, person: number, place: AreaPlace, clock: number): void {
  if (cast.legNo[person]! < 0) startLeg(cast, person, place, clock);
  while (clock >= cast.legStart[person]! + cast.legSeconds[person]!) nextLeg(cast, person, place);
  const fromX = cast.fromX[person]!;
  const fromZ = cast.fromZ[person]!;
  const dx = cast.toX[person]! - fromX;
  const dz = cast.toZ[person]! - fromZ;
  const travel = Math.hypot(dx, dz) / speedOf(place);
  const elapsed = clock - cast.legStart[person]!;
  const moving = elapsed < travel;
  // Clamped below too: a clock handed in from before the leg would fling the swimmer backwards.
  const done = moving ? Math.max(elapsed / travel, 0) : 1;
  cast.x[person] = fromX + dx * done;
  cast.z[person] = fromZ + dz * done;
  cast.y[person] = place.area.surface - sinkOf(place, moving);
  // Kept through the rest, so a swimmer stands facing the way they came.
  cast.heading[person] = Math.atan2(dx, dz);
  cast.pose[person] = moving ? movingPose(place, cast.legNo[person]!) : restingPose(place);
}

function speedOn(pose: LoopPose): number {
  if (pose === 'climb') return CLIMB_SPEED;
  if (pose === 'slide') return SLIDE_SPEED;
  if (pose === 'swim') return SWIM_SPEED;
  if (pose === 'hang') return HANG_SPEED;
  if (pose === 'drop') return DROP_SPEED;
  return WALK_SPEED;
}

function drawnOn(pose: LoopPose): number {
  if (pose === 'climb') return DRAWN_POSE.jog;
  if (pose === 'slide') return RESTING.sitting;
  if (pose === 'swim') return DRAWN_POSE.swim;
  // Arms straight up, short of the progress where the reach would lift the body.
  if (pose === 'hang') return poseWith(DRAWN_POSE.reach, 1);
  if (pose === 'drop') return RESTING.standing;
  return RESTING.none;
}

// Straight up a ladder there is no way of travel to face, so the climber faces where the next
// leg goes: onto the tower.
function headingsOf(stops: readonly LoopStop[]): Float64Array {
  const headings = new Float64Array(stops.length);
  for (let leg = stops.length - 1; leg >= 0; leg--) {
    const from = stops[leg]!;
    const to = stops[(leg + 1) % stops.length]!;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const level = Math.hypot(dx, dz) < 1e-6;
    headings[leg] = level ? headings[(leg + 1) % stops.length]! : Math.atan2(dx, dz);
  }
  return headings;
}

export function rideLoop(stops: readonly LoopStop[], riders: number): RideLoop {
  const arrive = new Float64Array(stops.length + 1);
  for (const [leg, from] of stops.entries()) {
    const to = stops[(leg + 1) % stops.length]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    arrive[leg + 1] = arrive[leg]! + length / speedOn(from.pose);
  }
  return { stops, arrive, headings: headingsOf(stops), riders };
}

// Spread over the loop's time, not its length: everybody keeps one timetable, so the spacing
// holds through the slow climb and the fast slide alike.
function ride(cast: Cast, person: number, place: LoopPlace, clock: number): void {
  const { stops, arrive, headings, riders } = place.loop;
  const period = arrive[stops.length]!;
  const offset = (place.index * period) / riders;
  const time = period > 0 ? (((clock + offset) % period) + period) % period : 0;
  let leg = 0;
  while (leg < stops.length - 1 && time >= arrive[leg + 1]!) leg++;
  const from = stops[leg]!;
  const to = stops[(leg + 1) % stops.length]!;
  const span = arrive[leg + 1]! - arrive[leg]!;
  const done = span > 0 ? (time - arrive[leg]!) / span : 0;
  cast.x[person] = from.x + (to.x - from.x) * done;
  cast.y[person] = from.y + (to.y - from.y) * done;
  cast.z[person] = from.z + (to.z - from.z) * done;
  cast.heading[person] = headings[leg]!;
  cast.pose[person] = drawnOn(from.pose);
}

// The crowd's own step (crowdField's advance), so acts pause, hurry and replay with the crowd.
export function advanceActs(seconds: number, dt: number, scale: number): number {
  const step = Math.min(Math.max(dt, 0), MAX_STEP) * scale;
  return step > 0 ? seconds + step : seconds;
}

// Every frame, after keepSeats: whoever holds an area or a loop is drawn where the act has them,
// and whoever is at a court or on a course where its game has them.
export function perform(cast: Cast, clock: number): void {
  for (let at = 0; at < cast.moving.length; at++) {
    const index = cast.moving[at]!;
    const person = cast.heldBy[index]!;
    if (person < 0) continue;
    const place = cast.places[index]!;
    if (place.act === 'loop') ride(cast, person, place, clock);
    else if (isArea(place)) swimArea(cast, person, place, clock);
    else if (isMoving(place)) playSpot(cast, person, place, clock);
  }
  mindChildren(cast, clock);
  playTag(cast, clock);
  playShows(cast, clock);
  playGames(cast, clock);
  playRounds(cast, clock);
}
