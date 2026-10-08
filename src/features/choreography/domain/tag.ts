import { RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { mix, unitOf } from '../../random/domain/hash';
import type { Cast } from './casting';

// A yard tag is played on, in world voxels.
export interface Yard {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  // The layer the players' feet stand in.
  readonly ground: number;
  readonly salt: number;
}

// The places that play one game of tag.
export interface TagGame {
  readonly yard: Yard;
  readonly places: Int32Array;
}

// Every leg the same length, so where anybody is follows from the clock alone.
const LEG = 3;
const JOG_SPEED = WALK_SPEED * 2;
// Of the leg's length, the most a run may take; the rest is spent hopping on the spot.
const RUN_SHARE = 0.8;
const CANDIDATES = 3;
const ROUND = 24;
const MARGIN = 1.5;

const PHASE = 1;
const ALONG = 2;
const ACROSS = 3;

const hashOf = (yard: Yard, person: number, n: number, channel: number): number =>
  mix(mix(mix(person + yard.salt) + n) + channel);

const phaseOf = (yard: Yard, person: number): number =>
  unitOf(hashOf(yard, person, 0, PHASE)) * LEG;

const legAt = (yard: Yard, person: number, time: number): number =>
  Math.floor((time + phaseOf(yard, person)) / LEG);

const legStart = (yard: Yard, person: number, n: number): number => n * LEG - phaseOf(yard, person);

// Written into, so playing allocates nothing.
const at = { x: 0, z: 0 };

function wander(yard: Yard, person: number, n: number, candidate: number): void {
  const u = unitOf(hashOf(yard, person, n * CANDIDATES + candidate, ALONG));
  const v = unitOf(hashOf(yard, person, n * CANDIDATES + candidate, ACROSS));
  at.x = yard.minX + MARGIN + u * Math.max(yard.maxX - yard.minX - 2 * MARGIN, 0);
  at.z = yard.minZ + MARGIN + v * Math.max(yard.maxZ - yard.minZ - 2 * MARGIN, 0);
}

const players: number[] = [];

function itAt(cast: Cast, game: TagGame, time: number): number {
  players.length = 0;
  for (const index of game.places) {
    const person = cast.heldBy[index]!;
    if (person >= 0) players.push(person);
  }
  if (players.length === 0) return -1;
  const round = Math.floor(time / ROUND);
  return players[mix(game.yard.salt + round) % players.length]!;
}

// Where somebody's leg n sets off from: anywhere for the one who is it, and for the rest the
// likeliest of a few that is furthest from where it is heading.
function pointOf(cast: Cast, game: TagGame, person: number, n: number): void {
  const { yard } = game;
  const it = itAt(cast, game, legStart(yard, person, n));
  if (it === person || it < 0) {
    wander(yard, person, n, 0);
    return;
  }
  wander(yard, it, legAt(yard, it, legStart(yard, person, n)) + 1, 0);
  const itX = at.x;
  const itZ = at.z;
  let best = -1;
  let bestX = 0;
  let bestZ = 0;
  for (let candidate = 0; candidate < CANDIDATES; candidate++) {
    wander(yard, person, n, candidate);
    const away = Math.hypot(at.x - itX, at.z - itZ);
    if (away <= best) continue;
    best = away;
    bestX = at.x;
    bestZ = at.z;
  }
  at.x = bestX;
  at.z = bestZ;
}

// Where tag has somebody at `time`, how they stand and which way they face, written to the cast.
function tagAt(cast: Cast, game: TagGame, person: number, time: number): void {
  const { yard } = game;
  const n = legAt(yard, person, time);
  pointOf(cast, game, person, n);
  const fromX = at.x;
  const fromZ = at.z;
  pointOf(cast, game, person, n + 1);
  const dx = at.x - fromX;
  const dz = at.z - fromZ;
  const length = Math.hypot(dx, dz);
  const run =
    Math.max(length / JOG_SPEED, 0) > LEG * RUN_SHARE ? LEG * RUN_SHARE : length / JOG_SPEED;
  const elapsed = time - legStart(yard, person, n);
  const done = run > 0 ? Math.min(elapsed / run, 1) : 1;
  cast.x[person] = fromX + dx * done;
  cast.z[person] = fromZ + dz * done;
  cast.y[person] = yard.ground;
  if (length > 0) cast.heading[person] = Math.atan2(dx, dz);
  const it = itAt(cast, game, time) === person;
  cast.pose[person] = done < 1 ? DRAWN_POSE.jog : it ? RESTING.standing : DRAWN_POSE.hop;
}

export function playTag(cast: Cast, clock: number): void {
  for (const game of cast.tag) {
    for (const index of game.places) {
      const person = cast.heldBy[index]!;
      if (person >= 0) tagAt(cast, game, person, clock);
    }
  }
}
