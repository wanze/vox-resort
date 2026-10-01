import { RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import type { Cast } from './casting';
import type { DrawnBall } from './courts';

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Waiting extends Point {
  readonly heading: number;
}

// A hole in world voxels.
export interface GolfLane {
  // Tee first, cup last.
  readonly line: readonly Point[];
  readonly length: number;
  // The layer the players' feet stand in, which the ball rolls on too.
  readonly ground: number;
  // Beside the tee, where the party waits to putt, and beside the cup, where it waits after.
  readonly tee: Waiting;
  readonly cup: Waiting;
  // From the cup's waiting place to the next lane's tee's, both left out.
  readonly walk: readonly Point[];
  readonly next: number;
  // Into the venue's visitors: the party whose round starts on this lane.
  readonly party: readonly number[];
}

// Every party moves on at once, a lane a slot, so no two parties are ever on one lane.
export interface GolfCourse {
  readonly lanes: readonly GolfLane[];
  readonly slot: number;
  readonly salt: number;
}

// A course as the cast plays it: each lane's party by flat place index, and the ball it putts.
export interface GolfPlay {
  readonly course: GolfCourse;
  readonly parties: readonly Int32Array[];
  readonly balls: readonly DrawnBall[];
}

const ADDRESS = 0.8;
const STRIKE = 0.6;
const HOLED = 0.6;
// A putt leaves at this many voxels a second and slows evenly to a stop.
const ROLL_SPEED = 10;
const ROLL_MIN = 0.6;
// Clear of the tee's peg, which stands on the tee's own column.
const BALL_START = 2;
const BEHIND = 1.2;
// Behind one another on the way to the next lane, and beside one another while they wait.
const FOLLOW = 0.8;
const SPACING = 1.6;
const PUTTS = 3;
// What a slot leaves over the slowest party, standing at the cup.
const REST = 2;

const PUTT_COUNT = 1;
const SHORT = 2;

export function createGolfPlay(course: GolfCourse, parties: readonly Int32Array[]): GolfPlay {
  return {
    course,
    parties,
    balls: course.lanes.map(() => ({ model: 'ball-golf', x: 0, y: 0, z: 0, shown: false })),
  };
}

const hashOf = (course: GolfCourse, lane: number, slot: number, n: number, channel: number) =>
  mix(mix(mix(mix(course.salt + lane) + slot) + n) + channel);

const unit = (hash: number): number => hash / 4_294_967_296;

const lengthOf = (points: readonly Point[]): number => {
  let length = 0;
  for (let at = 1; at < points.length; at++) {
    length += Math.hypot(points[at]!.x - points[at - 1]!.x, points[at]!.z - points[at - 1]!.z);
  }
  return length;
};

// Written into, so playing allocates nothing.
const on = { x: 0, z: 0, heading: 0 };

function along(points: readonly Point[], distance: number): void {
  let left = Math.max(distance, 0);
  for (let at = 1; at < points.length; at++) {
    const from = points[at - 1]!;
    const to = points[at]!;
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    if (span > 0) on.heading = Math.atan2(to.x - from.x, to.z - from.z);
    if (left <= span || at === points.length - 1) {
      const done = span > 0 ? Math.min(left / span, 1) : 1;
      on.x = from.x + (to.x - from.x) * done;
      on.z = from.z + (to.z - from.z) * done;
      return;
    }
    left -= span;
  }
  on.x = points[0]!.x;
  on.z = points[0]!.z;
}

// Behind the place, one member to a place, so a waiting party neither stands in one nor on the lane.
function waitAt(place: Waiting, member: number): void {
  on.x = place.x - Math.sin(place.heading) * SPACING * member;
  on.z = place.z - Math.cos(place.heading) * SPACING * member;
  on.heading = place.heading;
}

export const laneAt = (course: GolfCourse, home: number, slot: number): number => {
  let lane = home;
  const turns = ((slot % course.lanes.length) + course.lanes.length) % course.lanes.length;
  for (let turn = 0; turn < turns; turn++) lane = course.lanes[lane]!.next;
  return lane;
};

const previousOf = (course: GolfCourse, lane: number): GolfLane =>
  course.lanes[
    Math.max(
      course.lanes.findIndex((each) => each.next === lane),
      0,
    )
  ]!;

const rollSeconds = (distance: number): number => Math.max(ROLL_MIN, (2 * distance) / ROLL_SPEED);

// Every slot is as long as the slowest lane's walk and turns can be, so nobody is cut short.
export function slotFor(lanes: readonly GolfLane[]): number {
  let slot = 0;
  for (const [index, lane] of lanes.entries()) {
    const party = Math.max(lane.party.length, 1);
    const coming =
      lanes[
        Math.max(
          lanes.findIndex((each) => each.next === index),
          0,
        )
      ]!;
    const walk = lengthOf([coming.cup, ...coming.walk, lane.tee]) + 2 * SPACING * party;
    const reach = Math.hypot(lane.line[0]!.x - lane.tee.x, lane.line[0]!.z - lane.tee.z);
    const leave = Math.hypot(lane.line.at(-1)!.x - lane.cup.x, lane.line.at(-1)!.z - lane.cup.z);
    const turn =
      (reach + leave + 2 * SPACING * party + 2 * lane.length + BALL_START) / WALK_SPEED +
      PUTTS * (ADDRESS + STRIKE + ROLL_MIN) +
      (2 * lane.length) / ROLL_SPEED +
      HOLED;
    slot = Math.max(slot, walk / WALK_SPEED + FOLLOW * party + party * turn + REST);
  }
  return slot;
}

interface Scene {
  cast: Cast;
  course: GolfCourse;
  lane: GolfLane;
  laneIndex: number;
  slotNo: number;
  members: Int32Array;
  count: number;
  ball: DrawnBall;
}

const scene: Scene = {
  cast: null as unknown as Cast,
  course: null as unknown as GolfCourse,
  lane: null as unknown as GolfLane,
  laneIndex: 0,
  slotNo: 0,
  members: new Int32Array(8),
  count: 0,
  ball: null as unknown as DrawnBall,
};

function draw(person: number, x: number, z: number, heading: number, pose: number): void {
  const { cast, lane } = scene;
  cast.x[person] = x;
  cast.z[person] = z;
  cast.y[person] = lane.ground;
  cast.heading[person] = heading;
  cast.pose[person] = pose;
}

const walkPath: Point[] = [];

function pathFor(from: Waiting, by: readonly Point[], to: Waiting, member: number): void {
  walkPath.length = 0;
  waitAt(from, member);
  walkPath.push({ x: on.x, z: on.z });
  walkPath.push(...by);
  waitAt(to, member);
  walkPath.push({ x: on.x, z: on.z });
}

// Over to the lane in file; true while anybody is still on the way.
function walkOver(previous: GolfLane, time: number): boolean {
  const { lane, members, count } = scene;
  let walking = false;
  for (let member = 0; member < count; member++) {
    pathFor(previous.cup, previous.walk, lane.tee, member);
    const start = member * FOLLOW;
    const length = lengthOf(walkPath);
    const gone = Math.min(Math.max(time - start, 0) * WALK_SPEED, length);
    along(walkPath, gone);
    const there = gone >= length;
    if (!there) walking = true;
    const heading = there ? lane.tee.heading : on.heading;
    draw(members[member]!, on.x, on.z, heading, there ? RESTING.standing : RESTING.none);
  }
  return walking;
}

function face(person: number, x: number, z: number): void {
  const { cast } = scene;
  cast.heading[person] = Math.atan2(x - cast.x[person]!, z - cast.z[person]!);
}

// The rest of the party, the ones still to putt beside the tee and the ones done beside the cup.
function waitFor(putter: number, x: number, z: number): void {
  const { lane, members, count } = scene;
  for (let member = 0; member < count; member++) {
    if (member === putter) continue;
    waitAt(member > putter ? lane.tee : lane.cup, member);
    draw(members[member]!, on.x, on.z, on.heading, RESTING.standing);
    face(members[member]!, x, z);
  }
}

function showBall(distance: number, sunk: boolean): void {
  const { lane, ball } = scene;
  along(lane.line, distance);
  ball.x = on.x;
  ball.z = on.z;
  ball.y = lane.ground - (sunk ? 1 : 0);
  ball.shown = true;
}

function address(person: number, distance: number, pose: number): void {
  along(scene.lane.line, distance - BEHIND);
  draw(person, on.x, on.z, on.heading, pose);
}

// Where the next putt stops: most of the way, the last one in.
function stopAfter(member: number, putt: number, putts: number, from: number): number {
  const { lane, course, laneIndex, slotNo } = scene;
  if (putt === putts - 1) return lane.length;
  const short = unit(hashOf(course, laneIndex, slotNo, member * PUTTS + putt, SHORT));
  return from + (lane.length - from) * (0.55 + 0.35 * short);
}

// A straight walk begun at `start`; when it ends, drawing the walker while it is under way.
function stroll(
  person: number,
  from: Point,
  toX: number,
  toZ: number,
  start: number,
  time: number,
) {
  const end = start + Math.hypot(toX - from.x, toZ - from.z) / WALK_SPEED;
  if (time >= start && time < end) {
    const done = (time - start) / (end - start);
    draw(person, from.x + (toX - from.x) * done, from.z + (toZ - from.z) * done, 0, RESTING.none);
    face(person, toX, toZ);
  }
  return end;
}

const puttEnds = (ball: number, stop: number, at: number, last: boolean): number => {
  const rolled = at + ADDRESS + STRIKE + rollSeconds(stop - ball);
  return last ? rolled + HOLED : rolled + (stop - ball) / WALK_SPEED;
};

// Addressed, struck and watched rolling; then after the ball, unless it is in.
function drawPutt(
  person: number,
  ball: number,
  stop: number,
  at: number,
  last: boolean,
  time: number,
) {
  const struck = at + ADDRESS + STRIKE;
  const rolled = struck + rollSeconds(stop - ball);
  let pose: number = RESTING.standing;
  let walked = 0;
  if (time >= at + ADDRESS && time < struck) {
    pose = poseWith(DRAWN_POSE.strike, (time - at - ADDRESS) / STRIKE);
  } else if (time >= rolled && !last) {
    pose = RESTING.none;
    walked = (time - rolled) * WALK_SPEED;
  }
  address(person, ball + walked, pose);
  const rolling = Math.min(Math.max((time - struck) / (rolled - struck), 0), 1);
  showBall(ball + (stop - ball) * (1 - (1 - rolling) * (1 - rolling)), last && time >= rolled);
}

const from = { x: 0, z: 0 };

// Down the lane to the cup for the ball, rather than across whatever stands on the felt.
function fetchAndLeave(member: number, ball: number, at: number, time: number): number {
  const { lane, members } = scene;
  const person = members[member]!;
  const fetched = at + (lane.length - ball) / WALK_SPEED;
  if (time < fetched) {
    address(person, ball + (time - at) * WALK_SPEED, RESTING.none);
    return Infinity;
  }
  along(lane.line, lane.length - BEHIND);
  from.x = on.x;
  from.z = on.z;
  waitAt(lane.cup, member);
  const end = stroll(person, from, on.x, on.z, fetched, time);
  return time < end ? Infinity : end;
}

// One member's turn from `start`; the time it ends, or Infinity while it is under way and drawn.
function turnOf(member: number, start: number, time: number): number {
  const { lane, members, course, laneIndex, slotNo } = scene;
  const person = members[member]!;
  waitAt(lane.tee, member);
  from.x = on.x;
  from.z = on.z;
  along(lane.line, BALL_START - BEHIND);
  let at = stroll(person, from, on.x, on.z, start, time);
  if (time < at) {
    showBall(BALL_START, false);
    return Infinity;
  }
  const putts = 1 + (hashOf(course, laneIndex, slotNo, member, PUTT_COUNT) % PUTTS);
  let ball = BALL_START;
  for (let putt = 0; putt < putts; putt++) {
    const last = putt === putts - 1;
    const stop = stopAfter(member, putt, putts, ball);
    const ends = puttEnds(ball, stop, at, last);
    if (time < ends) {
      drawPutt(person, ball, stop, at, last, time);
      return Infinity;
    }
    at = ends;
    if (!last) ball = stop;
  }
  return fetchAndLeave(member, ball, at, time);
}

function walkEnds(previous: GolfLane): number {
  const { lane, count } = scene;
  let end = 0;
  for (let member = 0; member < count; member++) {
    pathFor(previous.cup, previous.walk, lane.tee, member);
    end = Math.max(end, member * FOLLOW + lengthOf(walkPath) / WALK_SPEED);
  }
  return end;
}

function playParty(cast: Cast, play: GolfPlay, home: number, clock: number): void {
  const { course } = play;
  const ball = play.balls[home]!;
  ball.shown = false;
  let count = 0;
  for (const index of play.parties[home]!) {
    const person = cast.heldBy[index]!;
    if (person >= 0 && count < scene.members.length) scene.members[count++] = person;
  }
  if (count === 0) return;
  const slotNo = Math.floor(clock / course.slot);
  const laneIndex = laneAt(course, home, slotNo);
  const lane = course.lanes[laneIndex]!;
  Object.assign(scene, { cast, course, lane, laneIndex, slotNo, count, ball });
  const time = clock - slotNo * course.slot;
  const previous = previousOf(course, laneIndex);
  if (walkOver(previous, time)) return;
  let start = walkEnds(previous);
  for (let member = 0; member < count; member++) {
    start = turnOf(member, start, time);
    if (start !== Infinity) continue;
    const putter = scene.members[member]!;
    waitFor(member, cast.x[putter]!, cast.z[putter]!);
    return;
  }
  along(lane.line, lane.length);
  waitFor(-1, on.x, on.z);
}

// Every frame, after the courts: each party plays its lane of the slot, the ball drawn with it.
export function playRounds(cast: Cast, clock: number): void {
  for (const play of cast.golf) {
    for (let home = 0; home < play.parties.length; home++) playParty(cast, play, home, clock);
  }
}
