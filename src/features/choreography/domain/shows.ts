import { WALK_SPEED } from '../../crowd/domain/crowd';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import type { Cast } from './casting';

export interface Floor {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  // The layer the dancers' feet stand in.
  readonly ground: number;
}

// The places at a venue whose visitors leave what they are doing for its show: the ones who
// gather in front of the animator, the ones who get up and dance on the floor, and the ones who
// cheer where they stand.
export interface Audience {
  readonly venue: number;
  // The animator's place, flat; -1 for a stage with none.
  readonly animator: number;
  readonly gathering: Int32Array;
  readonly dancing: Int32Array;
  // The still standing visitors, who watch from where they are.
  readonly cheering: Int32Array;
  readonly floor: Floor | null;
}

const JOG_SPEED = WALK_SPEED * 2;
// In rows of four, two voxels apart, the first row this far in front of the animator.
const ROW = 4;
const FRONT = 4;
const SPREAD = 2;
const CHEER_BEAT = 1.5;
// A dance step, the sway of a dancer's heading, and the gap left round the animator.
const DANCE_BEAT = 0.5;
const SWAY = 0.4;
const SWAY_RATE = 2.5;
const CLEAR = 3;
const MARGIN = 1;
// Straight back out of a machine's bay before running anywhere, clear of the piers either side.
const BACK_OUT = 3;

const DANCE_STEPS = [DRAWN_POSE.jog, DRAWN_POSE.cheer, DRAWN_POSE.jog, DRAWN_POSE.hop] as const;

const ALONG = 1;
const ACROSS = 2;
const STEP = 3;

const unit = (hash: number): number => hash / 4_294_967_296;

// Written into, so a show allocates nothing.
const spot = { x: 0, z: 0 };
const via = { x: 0, z: 0 };

// Once a frame, before anybody gathers: when each venue's show began, or last ended.
function watchShows(cast: Cast, clock: number): void {
  const { shows, showFrom, showTo } = cast;
  for (let venue = 0; venue < shows.length; venue++) {
    const on = shows[venue] === 1;
    if (on && Number.isNaN(showFrom[venue]!)) {
      showFrom[venue] = clock;
      showTo[venue] = Number.NaN;
    } else if (!on && !Number.isNaN(showFrom[venue]!)) {
      showFrom[venue] = Number.NaN;
      showTo[venue] = clock;
    }
  }
}

function inFront(cast: Cast, animator: number, slot: number): void {
  const place = cast.places[animator]!;
  const forward = FRONT + SPREAD * Math.floor(slot / ROW);
  const aside = ((slot % ROW) - (ROW - 1) / 2) * SPREAD;
  spot.x = place.x + Math.sin(place.heading) * forward + Math.cos(place.heading) * aside;
  spot.z = place.z + Math.cos(place.heading) * forward - Math.sin(place.heading) * aside;
}

// Somewhere on the floor of its own, clear of the animator.
function onFloor(cast: Cast, floor: Floor, animator: number, index: number): void {
  const width = Math.max(floor.maxX - floor.minX - 2 * MARGIN - 2 * CLEAR, 0);
  spot.x = floor.minX + MARGIN + unit(mix(mix(index) + ALONG)) * width;
  spot.z =
    floor.minZ +
    MARGIN +
    unit(mix(mix(index) + ACROSS)) * Math.max(floor.maxZ - floor.minZ - 2 * MARGIN, 0);
  const middle = animator >= 0 ? cast.places[animator]!.x : (floor.minX + floor.maxX) / 2;
  if (spot.x >= middle - CLEAR) spot.x += 2 * CLEAR;
}

// Where somebody set off from when the show began, kept so the run over is one straight line.
function setOff(cast: Cast, person: number, since: number, clock: number): void {
  if (cast.joined[person] === since) return;
  cast.joined[person] = since;
  cast.joinedAt[person] = clock;
  cast.fromShowX[person] = cast.x[person]!;
  cast.fromShowZ[person] = cast.z[person]!;
}

// Across to the spot at a run, by `via`; false while still on the way.
function runOver(cast: Cast, person: number, clock: number): boolean {
  const fromX = cast.fromShowX[person]!;
  const fromZ = cast.fromShowZ[person]!;
  const first = Math.hypot(via.x - fromX, via.z - fromZ);
  const second = Math.hypot(spot.x - via.x, spot.z - via.z);
  const gone = (clock - cast.joinedAt[person]!) * JOG_SPEED;
  if (gone >= first + second) {
    cast.x[person] = spot.x;
    cast.z[person] = spot.z;
    return true;
  }
  const [aX, aZ, bX, bZ, along] =
    gone < first
      ? [fromX, fromZ, via.x, via.z, first > 0 ? gone / first : 1]
      : [via.x, via.z, spot.x, spot.z, second > 0 ? (gone - first) / second : 1];
  cast.x[person] = aX + (bX - aX) * along;
  cast.z[person] = aZ + (bZ - aZ) * along;
  cast.heading[person] = Math.atan2(bX - aX, bZ - aZ);
  cast.pose[person] = DRAWN_POSE.jog;
  return false;
}

// Out of a bay backwards from the way its place faces; from anywhere else, straight over.
function viaFor(cast: Cast, index: number, x: number, z: number): void {
  const place = cast.places[index]!;
  const out = place.act === 'play' ? BACK_OUT : 0;
  via.x = x - Math.sin(place.heading) * out;
  via.z = z - Math.cos(place.heading) * out;
}

// Back from the spot to wherever they are drawn now, at a run, by `via`.
function runBack(cast: Cast, person: number, since: number, clock: number): void {
  const toX = cast.x[person]!;
  const toZ = cast.z[person]!;
  const first = Math.hypot(via.x - spot.x, via.z - spot.z);
  const second = Math.hypot(toX - via.x, toZ - via.z);
  const gone = (clock - since) * JOG_SPEED;
  if (gone >= first + second) return;
  const [aX, aZ, bX, bZ, along] =
    gone < first
      ? [spot.x, spot.z, via.x, via.z, first > 0 ? gone / first : 1]
      : [via.x, via.z, toX, toZ, second > 0 ? (gone - first) / second : 1];
  cast.x[person] = aX + (bX - aX) * along;
  cast.z[person] = aZ + (bZ - aZ) * along;
  cast.heading[person] = Math.atan2(bX - aX, bZ - aZ);
  cast.pose[person] = DRAWN_POSE.jog;
}

function faceAnimator(cast: Cast, person: number, animator: number): void {
  const place = cast.places[animator]!;
  cast.heading[person] = Math.atan2(place.x - cast.x[person]!, place.z - cast.z[person]!);
}

// Cheer and hop by turns, each in the audience a beat apart from the next.
function cheer(cast: Cast, person: number, animator: number, shown: number, slot: number): void {
  faceAnimator(cast, person, animator);
  const beat = Math.floor(shown / CHEER_BEAT) + slot;
  cast.pose[person] = beat % 2 === 0 ? DRAWN_POSE.cheer : DRAWN_POSE.hop;
}

function gatherAll(cast: Cast, audience: Audience, clock: number): void {
  const { venue, animator } = audience;
  const since = cast.showFrom[venue]!;
  const ended = cast.showTo[venue]!;
  let slot = 0;
  for (const index of audience.gathering) {
    const person = cast.heldBy[index]!;
    if (person < 0) continue;
    inFront(cast, animator, slot);
    if (!Number.isNaN(since)) {
      setOff(cast, person, since, clock);
      viaFor(cast, index, cast.fromShowX[person]!, cast.fromShowZ[person]!);
      if (runOver(cast, person, clock)) cheer(cast, person, animator, clock - since, slot);
    } else if (!Number.isNaN(ended)) {
      viaFor(cast, index, cast.x[person]!, cast.z[person]!);
      runBack(cast, person, ended, clock);
    }
    slot++;
  }
}

// Turned to the animator on the beat while the show is on, and back as they were drawn after it.
function cheerAll(cast: Cast, audience: Audience, clock: number): void {
  const since = cast.showFrom[audience.venue]!;
  const over = !Number.isNaN(cast.showTo[audience.venue]!);
  for (let slot = 0; slot < audience.cheering.length; slot++) {
    const index = audience.cheering[slot]!;
    const person = cast.heldBy[index]!;
    if (person < 0) continue;
    const place = cast.places[index]!;
    if (!Number.isNaN(since)) cheer(cast, person, audience.animator, clock - since, slot);
    else if (over) {
      cast.heading[person] = place.heading;
      cast.pose[person] = place.pose;
    }
  }
}

// Off their seats and onto the floor for the show, and back to sit down after it.
function danceAll(cast: Cast, audience: Audience, floor: Floor, clock: number): void {
  const { venue, animator } = audience;
  const since = cast.showFrom[venue]!;
  const ended = cast.showTo[venue]!;
  for (const index of audience.dancing) {
    const person = cast.heldBy[index]!;
    if (person < 0) continue;
    const seat = cast.places[index]!;
    onFloor(cast, floor, animator, index);
    if (!Number.isNaN(since)) {
      setOff(cast, person, since, clock);
      cast.y[person] = floor.ground;
      viaFor(cast, index, cast.fromShowX[person]!, cast.fromShowZ[person]!);
      if (!runOver(cast, person, clock)) continue;
      if (animator >= 0) faceAnimator(cast, person, animator);
      cast.heading[person]! += SWAY * Math.sin(clock * SWAY_RATE + index);
      const beat = Math.floor(clock / DANCE_BEAT) + mix(index + STEP);
      cast.pose[person] = DANCE_STEPS[beat % DANCE_STEPS.length]!;
      continue;
    }
    cast.x[person] = seat.x;
    cast.y[person] = seat.y;
    cast.z[person] = seat.z;
    cast.heading[person] = seat.heading;
    cast.pose[person] = seat.pose;
    if (Number.isNaN(ended)) continue;
    viaFor(cast, index, seat.x, seat.z);
    runBack(cast, person, ended, clock);
    if (cast.pose[person] === DRAWN_POSE.jog) cast.y[person] = floor.ground;
  }
}

// Every frame, after every act has drawn its people where they are without a show.
export function playShows(cast: Cast, clock: number): void {
  watchShows(cast, clock);
  for (const audience of cast.audiences) {
    if (audience.animator >= 0) gatherAll(cast, audience, clock);
    if (audience.animator >= 0 && audience.cheering.length > 0) cheerAll(cast, audience, clock);
    if (audience.floor) danceAll(cast, audience, audience.floor, clock);
  }
}
