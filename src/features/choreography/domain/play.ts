import { RESTING } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import type { Cast } from './casting';
import type { SpotActPlace } from './places';

// Seconds a swing takes there and back, and how far out it carries the hips at the top.
const SWING_PERIOD = { min: 2, max: 3 } as const;
const SWING_REACH = 3;
// Near the top of the forward arc, one swing in this many, a child lets go with both hands.
const CHEER_ABOVE = 0.92;
const CHEERS = 4;
const DIG_PERIOD = 2.4;
// Buttons, as fast as a hand goes.
const PLAY_PERIOD = 0.35;
// Hands up to the rose, then down scrubbing; turning on the spot about once in fourteen seconds.
const RINSE_PERIOD = 3.5;
const HANDS_UP_SHARE = 0.6;
const RINSE_TURN = 0.45;
// A jumping jack's arms up and down, a lift's up and back, a sit-up's down and up again.
const JACK_PERIOD = 0.8;
const LIFT_PERIOD = 2.4;
const SIT_UP_PERIOD = 2.4;
const SITTING_SHARE = 0.35;
// A standing figure sunk this far into sand reads as kneeling in it: a child's legs are a voxel.
const KNEEL = 1;

// Radians a parent turns a second, and the furthest from facing where they sit.
const TURN_RATE = 1.5;
const TURN_LIMIT = 1.4;
const LONGEST_FRAME = 0.25;

const PERIOD = 1;
const PHASE = 2;
const CHEER = 3;

const hashOf = (person: number, place: SpotActPlace, channel: number): number =>
  mix(mix(mix(person) + Math.round(place.x * 2) + Math.round(place.z * 2) * 1024) + channel);

const unit = (hash: number): number => hash / 4_294_967_296;

const cycles = (person: number, place: SpotActPlace, clock: number, period: number): number =>
  clock / period + unit(hashOf(person, place, PHASE));

// How far through its current cycle a person's act is, 0 to 1.
const shareOf = (person: number, place: SpotActPlace, clock: number, period: number): number => {
  const turns = cycles(person, place, clock, period);
  return turns - Math.floor(turns);
};

// A pendulum hung from the bar, along the way the seat faces.
function swing(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  const length = Math.max((place.pivot ?? place.y) - place.y, 1);
  const spread = unit(hashOf(person, place, PERIOD));
  const turns = cycles(
    person,
    place,
    clock,
    SWING_PERIOD.min + spread * (SWING_PERIOD.max - SWING_PERIOD.min),
  );
  const sine = Math.sin(2 * Math.PI * turns);
  const angle = Math.asin(Math.min(SWING_REACH / length, 1)) * sine;
  const out = length * Math.sin(angle);
  cast.x[person] = place.x + Math.sin(place.heading) * out;
  cast.z[person] = place.z + Math.cos(place.heading) * out;
  cast.y[person] = place.y + length * (1 - Math.cos(angle));
  cast.heading[person] = place.heading;
  const cheers = mix(hashOf(person, place, CHEER) + Math.floor(turns)) % CHEERS === 0;
  cast.pose[person] = sine > CHEER_ABOVE && cheers ? DRAWN_POSE.cheer : place.pose;
}

function dig(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  cast.x[person] = place.x;
  cast.z[person] = place.z;
  cast.y[person] = place.y - KNEEL;
  cast.heading[person] = place.heading;
  cast.pose[person] = poseWith(DRAWN_POSE.strike, shareOf(person, place, clock, DIG_PERIOD));
}

// Where the art put them, facing the way it did: only the pose moves.
function workOut(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  cast.x[person] = place.x;
  cast.y[person] = place.y;
  cast.z[person] = place.z;
  cast.heading[person] = place.heading;
  const { station } = place;
  let pose: number = DRAWN_POSE.jog;
  if (station === 'jump') {
    const up = shareOf(person, place, clock, JACK_PERIOD) < 0.5;
    pose = up ? DRAWN_POSE.cheer : RESTING.standing;
  } else if (station === 'lift') {
    const share = shareOf(person, place, clock, LIFT_PERIOD);
    pose = poseWith(DRAWN_POSE.reach, Math.abs(2 * share - 1));
  } else if (station === 'mat') {
    const sat = shareOf(person, place, clock, SIT_UP_PERIOD) < SITTING_SHARE;
    pose = sat ? RESTING.sitting : RESTING.lying;
  }
  cast.pose[person] = pose;
}

// At the machine the art faces them to, hammering its buttons.
function press(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  cast.x[person] = place.x;
  cast.y[person] = place.y;
  cast.z[person] = place.z;
  cast.heading[person] = place.heading;
  cast.pose[person] = poseWith(DRAWN_POSE.strike, shareOf(person, place, clock, PLAY_PERIOD));
}

function rinse(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  cast.x[person] = place.x;
  cast.y[person] = place.y;
  cast.z[person] = place.z;
  cast.heading[person] =
    place.heading + clock * RINSE_TURN + unit(hashOf(person, place, PHASE)) * 2 * Math.PI;
  const up = shareOf(person, place, clock, RINSE_PERIOD) < HANDS_UP_SHARE;
  cast.pose[person] = up ? DRAWN_POSE.cheer : DRAWN_POSE.wade;
}

export function playSpot(cast: Cast, person: number, place: SpotActPlace, clock: number): void {
  if (place.act === 'swing') swing(cast, person, place, clock);
  else if (place.act === 'dig') dig(cast, person, place, clock);
  else if (place.act === 'station') workOut(cast, person, place, clock);
  else if (place.act === 'play') press(cast, person, place, clock);
  else if (place.act === 'rinse') rinse(cast, person, place, clock);
}

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

// The first child of the party at the venue, or -1.
function childOf(cast: Cast, party: number, start: number, count: number): number {
  for (let index = start; index < start + count; index++) {
    const held = cast.heldBy[index]!;
    if (held >= 0 && cast.child[held] === 1 && cast.party[held] === party) return held;
  }
  return -1;
}

// Every frame: a parent sitting at a venue with children's places keeps an eye on their own.
export function mindChildren(cast: Cast, clock: number): void {
  const dt = Math.min(Math.max(clock - cast.frame.clock, 0), LONGEST_FRAME);
  cast.frame.clock = clock;
  const { minding } = cast;
  for (let at = 0; at < minding.length; at += 3) {
    const index = minding[at]!;
    const person = cast.heldBy[index]!;
    if (person < 0 || cast.child[person] === 1 || cast.party[person]! < 0) continue;
    const child = childOf(cast, cast.party[person]!, minding[at + 1]!, minding[at + 2]!);
    const facing = cast.places[index]!.heading;
    let target = facing;
    if (child >= 0) {
      const bearing = Math.atan2(
        cast.x[child]! - cast.x[person]!,
        cast.z[child]! - cast.z[person]!,
      );
      target = facing + Math.min(Math.max(wrap(bearing - facing), -TURN_LIMIT), TURN_LIMIT);
    }
    const now = cast.heading[person]!;
    const step = TURN_RATE * dt;
    cast.heading[person] = now + Math.min(Math.max(wrap(target - now), -step), step);
  }
}
