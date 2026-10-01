import { DRAWN_POSE } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';
import type { Cast } from './casting';
import {
  createGameState,
  createLineup,
  gameAt,
  pauseSeconds,
  type CourtFrame,
  type Game,
  type GameState,
  type Lineup,
} from './games';

// Its middle across, and its underside.
export interface DrawnBall {
  readonly model: string;
  x: number;
  y: number;
  z: number;
  shown: boolean;
}

// A court's game as the cast plays it: the rally under way, who is in it, and where it stands.
export interface CourtGame {
  readonly game: Game;
  // Flat indices into the cast's places: the players' by the game's slots, then the watchers'.
  readonly players: Int32Array;
  readonly watchers: Int32Array;
  readonly lineup: Lineup;
  // Who held each slot as the rally began, or -1.
  readonly cast: Int32Array;
  readonly state: GameState;
  // -1 while nobody plays.
  rally: number;
  // Counted on through idle spells, so a court never replays a rally it has played.
  next: number;
  start: number;
  length: number;
  // When somebody walked off mid-rally, NaN otherwise: the rest of that rally is not played.
  leftAt: number;
  // The clock last drawn, for how far a watcher turns in a frame.
  clock: number;
  readonly ball: DrawnBall;
}

export function createCourtGame(game: Game, players: Int32Array, watchers: Int32Array): CourtGame {
  return {
    game,
    players,
    watchers,
    lineup: createLineup(game.players.length),
    cast: new Int32Array(game.players.length).fill(-1),
    state: createGameState(game.players.length),
    rally: -1,
    next: 0,
    start: 0,
    length: 0,
    leftAt: Number.NaN,
    clock: 0,
    ball: { model: game.ball, x: 0, y: 0, z: 0, shown: false },
  };
}

// Radians a watcher turns a second, and the furthest they turn from facing the court.
const TURN_RATE = 3;
const TURN_LIMIT = 1.4;
// A long frame turns no further than this one would: a stalled tab must not snap heads round.
const LONGEST_FRAME = 0.25;
// Voxels per second squared: a quarter metre a voxel.
const FALL = 39;
// After somebody walks off, how long the rest stand about before the next rally.
const REGROUP = 1.5;

const point = { x: 0, z: 0, u: 0, v: 0 };

function toWorld(frame: CourtFrame, u: number, v: number): void {
  point.x = frame.x + u * frame.alongX + v * frame.acrossX;
  point.z = frame.z + u * frame.alongZ + v * frame.acrossZ;
}

function toCourt(frame: CourtFrame, x: number, z: number): void {
  point.u = (x - frame.x) * frame.alongX + (z - frame.z) * frame.alongZ;
  point.v = (x - frame.x) * frame.acrossX + (z - frame.z) * frame.acrossZ;
}

function worldHeading(frame: CourtFrame, heading: number): number {
  const du = Math.sin(heading);
  const dv = Math.cos(heading);
  const dx = du * frame.alongX + dv * frame.acrossX;
  const dz = du * frame.alongZ + dv * frame.acrossZ;
  return Math.atan2(dx, dz);
}

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

const heldBy = (cast: Cast, court: CourtGame, slot: number): number =>
  cast.heldBy[court.players[slot]!]!;

function anybodyOn(cast: Cast, court: CourtGame): boolean {
  for (let slot = 0; slot < court.players.length; slot++) {
    if (heldBy(cast, court, slot) >= 0) return true;
  }
  return false;
}

function somebodyLeft(cast: Cast, court: CourtGame): boolean {
  for (let slot = 0; slot < court.players.length; slot++) {
    const person = court.cast[slot]!;
    if (person >= 0 && heldBy(cast, court, slot) !== person) return true;
  }
  return false;
}

// Whoever holds a player's place now plays, from wherever they are drawn.
function beginRally(cast: Cast, court: CourtGame, clock: number): void {
  const { game, lineup } = court;
  for (let slot = 0; slot < court.players.length; slot++) {
    const person = heldBy(cast, court, slot);
    court.cast[slot] = person;
    lineup.playing[slot] = person >= 0 ? 1 : 0;
    if (person < 0) continue;
    toCourt(game.frame, cast.x[person]!, cast.z[person]!);
    lineup.u[slot] = point.u;
    lineup.v[slot] = point.v;
  }
  court.rally = court.next++;
  court.start = clock;
  court.leftAt = Number.NaN;
  const over = gameAt(game, lineup, court.rally, Infinity, court.state).over;
  court.length = over + pauseSeconds(game, court.rally);
}

function endRally(court: CourtGame): void {
  court.rally = -1;
  court.cast.fill(-1);
}

function drawPlayers(cast: Cast, court: CourtGame): void {
  const { frame } = court.game;
  const { state } = court;
  for (let slot = 0; slot < court.players.length; slot++) {
    const person = court.cast[slot]!;
    if (person < 0) continue;
    toWorld(frame, state.u[slot]!, state.v[slot]!);
    cast.x[person] = point.x;
    cast.z[person] = point.z;
    cast.y[person] = frame.ground;
    cast.heading[person] = worldHeading(frame, state.heading[slot]!);
    cast.pose[person] = state.pose[slot]!;
  }
}

// Played, the ball goes where the game has it; left unfinished, it drops where it was.
function drawBall(court: CourtGame, clock: number): void {
  const { state, game, ball } = court;
  toWorld(game.frame, state.ballU, state.ballV);
  ball.x = point.x;
  ball.z = point.z;
  ball.shown = true;
  const fell = Number.isNaN(court.leftAt) ? 0 : FALL * (clock - court.leftAt) ** 2;
  ball.y = game.frame.ground + Math.max(state.ballY - fell, 0);
}

function turnTowards(cast: Cast, person: number, target: number, dt: number): void {
  const step = TURN_RATE * Math.min(Math.max(dt, 0), LONGEST_FRAME);
  const now = cast.heading[person]!;
  cast.heading[person] = now + Math.min(Math.max(wrap(target - now), -step), step);
}

// Towards the ball, as far as they can turn from facing the court; the court with no ball.
function watch(cast: Cast, court: CourtGame, index: number, dt: number): void {
  const person = cast.heldBy[index]!;
  if (person < 0) return;
  const place = cast.places[index]!;
  const { ball } = court;
  const bearing = Math.atan2(ball.x - cast.x[person]!, ball.z - cast.z[person]!);
  const off = ball.shown ? wrap(bearing - place.heading) : 0;
  turnTowards(cast, person, place.heading + Math.min(Math.max(off, -TURN_LIMIT), TURN_LIMIT), dt);
}

const cheers = (court: CourtGame, index: number): boolean =>
  (mix(mix(index + court.game.salt) + court.rally) & 1) === 1;

function drawWatchers(cast: Cast, court: CourtGame, clock: number, dt: number): void {
  const over =
    court.rally >= 0 && Number.isNaN(court.leftAt) && clock - court.start >= court.state.over;
  for (const index of court.watchers) {
    watch(cast, court, index, dt);
    const person = cast.heldBy[index]!;
    if (person < 0) continue;
    cast.pose[person] = over && cheers(court, index) ? DRAWN_POSE.cheer : cast.places[index]!.pose;
  }
}

// Players this rally has no part for, or no longer has: they stand and follow the ball.
function drawBystanders(cast: Cast, court: CourtGame, dt: number): void {
  const left = !Number.isNaN(court.leftAt);
  for (let slot = 0; slot < court.players.length; slot++) {
    const person = heldBy(cast, court, slot);
    if (person < 0 || (court.cast[slot] === person && !left)) continue;
    const { ball } = court;
    if (ball.shown) {
      const bearing = Math.atan2(ball.x - cast.x[person]!, ball.z - cast.z[person]!);
      turnTowards(cast, person, bearing, dt);
    }
    cast.pose[person] = cast.places[court.players[slot]!]!.pose;
  }
}

function playCourt(cast: Cast, court: CourtGame, clock: number): void {
  const dt = clock - court.clock;
  court.clock = clock;
  if (court.rally >= 0 && clock >= court.start + court.length) endRally(court);
  if (court.rally < 0 && anybodyOn(cast, court)) beginRally(cast, court, clock);
  if (court.rally < 0) {
    court.ball.shown = false;
    drawWatchers(cast, court, clock, dt);
    return;
  }
  if (Number.isNaN(court.leftAt) && somebodyLeft(cast, court)) {
    court.leftAt = clock;
    court.length = Math.min(court.length, clock - court.start + REGROUP);
  }
  if (Number.isNaN(court.leftAt)) {
    gameAt(court.game, court.lineup, court.rally, clock - court.start, court.state);
    drawPlayers(cast, court);
  }
  drawBall(court, clock);
  drawBystanders(cast, court, dt);
  drawWatchers(cast, court, clock, dt);
}

// Every frame, after the acts: each court's players play, and its watchers follow the ball.
export function playGames(cast: Cast, clock: number): void {
  for (const court of cast.courts) playCourt(cast, court, clock);
}
