import type { GameKind } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING, WALK_SPEED } from '../../crowd/domain/crowd';
import { DRAWN_POSE, poseWith } from '../../rendering/domain/poses';
import { mix } from '../../sim/domain/night';

export interface Hoop {
  readonly u: number;
  readonly v: number;
  // The ring's layer.
  readonly y: number;
}

// In the court's own frame: u along its length from the middle, v across it, y up from the feet.
export interface Court {
  readonly halfLength: number;
  readonly halfWidth: number;
  // `top` is the net's top layer; a ball clears it with its underside above that layer.
  readonly net: { readonly u: number; readonly top: number } | null;
  readonly hoops: readonly Hoop[];
}

// Where the court's frame lies in the world.
export interface CourtFrame {
  readonly x: number;
  readonly z: number;
  readonly ground: number;
  readonly alongX: number;
  readonly alongZ: number;
  readonly acrossX: number;
  readonly acrossZ: number;
}

export interface GamePlayer {
  // Into the venue's visitors.
  readonly visitor: number;
  // Where the art stands them, and where they go back to when the game does not need them.
  readonly u: number;
  readonly v: number;
  readonly side: 0 | 1;
}

export interface Game {
  readonly kind: GameKind;
  readonly court: Court;
  readonly frame: CourtFrame;
  readonly players: readonly GamePlayer[];
  // The ball's underside where it is struck, above the feet.
  readonly strike: number;
  readonly ball: string;
  readonly salt: number;
}

// Who plays a rally, and where each of them stood as it began.
export interface Lineup {
  readonly playing: Uint8Array;
  readonly u: Float64Array;
  readonly v: Float64Array;
}

// The ball's y is its underside, as a prop is hung by its foot.
export interface GameState {
  ballU: number;
  ballV: number;
  ballY: number;
  // In somebody's hands, rather than flying or lying.
  ballHeld: boolean;
  // When the point is won; Infinity until the replay reaches the stroke that wins it.
  over: number;
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly heading: Float64Array;
  readonly pose: Float64Array;
}

export const createLineup = (players: number): Lineup => ({
  playing: new Uint8Array(players),
  u: new Float64Array(players),
  v: new Float64Array(players),
});

export const createGameState = (players: number): GameState => ({
  ballU: 0,
  ballV: 0,
  ballY: 0,
  ballHeld: false,
  over: Infinity,
  u: new Float64Array(players),
  v: new Float64Array(players),
  heading: new Float64Array(players),
  pose: new Float64Array(players),
});

interface Range {
  readonly min: number;
  readonly max: number;
}

const JOG_SPEED = WALK_SPEED * 2;
const PLAY: Range = { min: 6, max: 20 };
const PAUSE: Range = { min: 2, max: 4 };
// Seconds a stroke takes, contact falling at the progress where each pose's arms meet the ball.
const SWING = 0.6;
const STRIKE_CONTACT = 0.5;
const REACH_CONTACT = 0.75;
const PASS_CONTACT = 0.5;
// The ball is a blob of voxels: skimming the net's top it would look to touch it.
const CLEAR = 1;
// A held ball is in front of the body, or the figure hides it.
const HAND = 3;
const AHEAD = 1.2;
const DRIBBLE_BEAT = 0.45;
const TOSS = 0.7;
const TOSS_RISE = 4;
// Off the ball's flight: a player arriving with the ball would have had no time to swing.
const EARLY = 0.15;

const PLAY_LENGTH = 1;
const PAUSE_LENGTH = 2;
const STROKE_LENGTH = 3;
const TARGET_U = 4;
const TARGET_V = 5;
const APEX = 6;
const RECEIVER = 7;
const BOUNCE = 8;
const TOUCHES = 9;
const MADE = 10;
const HOLD = 11;
const WAIT_HOP = 12;
const SPIKE = 13;

const hashIn = (game: Game, rally: number, n: number, channel: number): number =>
  mix(mix(mix(game.salt + rally) + n) + channel);

const unit = (hash: number): number => hash / 4_294_967_296;

const between = (range: Range, hash: number): number =>
  range.min + unit(hash) * (range.max - range.min);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const playSeconds = (game: Game, rally: number): number =>
  between(PLAY, hashIn(game, rally, 0, PLAY_LENGTH));

export const pauseSeconds = (game: Game, rally: number): number =>
  between(PAUSE, hashIn(game, rally, 0, PAUSE_LENGTH));

interface Replay {
  readonly game: Game;
  readonly lineup: Lineup;
  readonly rally: number;
  readonly time: number;
  readonly play: number;
  readonly into: GameState;
}

// The rally being replayed. Every exported function sets it afresh, so they stay pure.
let r: Replay;

const hash = (n: number, channel: number): number => hashIn(r.game, r.rally, n, channel);
const draw = (range: Range, n: number, channel: number): number => between(range, hash(n, channel));
const spread = (half: number, n: number, channel: number): number =>
  (unit(hash(n, channel)) * 2 - 1) * half;

// Module scratch, so a replay allocates nothing. Per player: the move they are on.
let room = 0;
let fromT = new Float64Array(0);
let fromU = new Float64Array(0);
let fromV = new Float64Array(0);
let toT = new Float64Array(0);
let toU = new Float64Array(0);
let toV = new Float64Array(0);
let readyU = new Float64Array(0);
let readyV = new Float64Array(0);
// What each faces while the ball is in their own hands.
let aimU = new Float64Array(0);
let aimV = new Float64Array(0);
let waits = new Uint8Array(0);
// The last two swings each has made or is about to make.
let swingT = new Float64Array(0);
let swingCode = new Float64Array(0);
let swingContact = new Float64Array(0);
let swings = new Int32Array(0);
// Per side, this rally's players, the furthest from the middle first.
let bySide: Int32Array[] = [new Int32Array(0), new Int32Array(0)];
let everyone = new Int32Array(0);
let everyoneCount = 0;
const sideCount = new Int32Array(2);
const sideSign = new Float64Array(2);
const point = { u: 0, v: 0 };

function makeRoom(players: number): void {
  if (players <= room) return;
  room = players;
  fromT = new Float64Array(room);
  fromU = new Float64Array(room);
  fromV = new Float64Array(room);
  toT = new Float64Array(room);
  toU = new Float64Array(room);
  toV = new Float64Array(room);
  readyU = new Float64Array(room);
  readyV = new Float64Array(room);
  aimU = new Float64Array(room);
  aimV = new Float64Array(room);
  swingT = new Float64Array(room * 2);
  swingCode = new Float64Array(room * 2);
  swingContact = new Float64Array(room * 2);
  waits = new Uint8Array(room);
  swings = new Int32Array(room);
  bySide = [new Int32Array(room), new Int32Array(room)];
  everyone = new Int32Array(room);
}

const middle = (): number => r.game.court.net?.u ?? 0;
const sideOf = (slot: number): 0 | 1 => r.game.players[slot]!.side;
const homeU = (slot: number): number => r.game.players[slot]!.u;
const homeV = (slot: number): number => r.game.players[slot]!.v;
const depthOf = (slot: number): number => Math.abs(homeU(slot) - middle());
const playerOn = (side: number, k: number): number => bySide[side]![k]!;

function signs(): void {
  let low = 0;
  for (const player of r.game.players) low += (player.side === 0 ? 1 : -1) * (player.u - middle());
  sideSign[0] = low > 0 ? 1 : -1;
  sideSign[1] = -sideSign[0]!;
}

function enter(slot: number): void {
  const list = bySide[sideOf(slot)]!;
  let at = sideCount[sideOf(slot)]!;
  while (at > 0 && depthOf(list[at - 1]!) < depthOf(slot)) {
    list[at] = list[at - 1]!;
    at--;
  }
  list[at] = slot;
  sideCount[sideOf(slot)]!++;
  everyone[everyoneCount++] = slot;
}

function begin(game: Game, lineup: Lineup, rally: number, time: number, into: GameState): void {
  r = { game, lineup, rally, time, play: playSeconds(game, rally), into };
  makeRoom(game.players.length);
  signs();
  sideCount.fill(0);
  everyoneCount = 0;
  for (const [slot, player] of game.players.entries()) {
    fromT[slot] = toT[slot] = 0;
    fromU[slot] = toU[slot] = lineup.u[slot]!;
    fromV[slot] = toV[slot] = lineup.v[slot]!;
    readyU[slot] = player.u;
    readyV[slot] = player.v;
    aimU[slot] = -sideSign[player.side]! * game.court.halfLength;
    aimV[slot] = 0;
    waits[slot] = 0;
    swings[slot] = 0;
    swingT[slot * 2] = swingT[slot * 2 + 1] = Number.NaN;
    if (lineup.playing[slot] === 1) enter(slot);
  }
  into.ballHeld = false;
  into.over = Infinity;
}

function positionAt(slot: number, time: number): void {
  const span = toT[slot]! - fromT[slot]!;
  const done = span > 0 ? clamp((time - fromT[slot]!) / span, 0, 1) : 1;
  const eased = done * done * (3 - 2 * done);
  point.u = fromU[slot]! + (toU[slot]! - fromU[slot]!) * eased;
  point.v = fromV[slot]! + (toV[slot]! - fromV[slot]!) * eased;
}

function moveTo(slot: number, start: number, u: number, v: number, end: number): void {
  positionAt(slot, start);
  fromT[slot] = start;
  fromU[slot] = point.u;
  fromV[slot] = point.v;
  toT[slot] = Math.max(end, start);
  toU[slot] = u;
  toV[slot] = v;
}

// Returns when they get there.
function jogTo(slot: number, start: number, u: number, v: number): number {
  positionAt(slot, start);
  const end = start + Math.hypot(u - point.u, v - point.v) / JOG_SPEED;
  moveTo(slot, start, u, v, end);
  return end;
}

const jogHome = (slot: number, start: number): number =>
  jogTo(slot, start, readyU[slot]!, readyV[slot]!);

function jogEverybodyHome(): void {
  for (let k = 0; k < everyoneCount; k++) jogHome(everyone[k]!, 0);
}

// Where the receiver meets the ball: cut short to what a jog covers in time.
const meet = { u: 0, v: 0 };

function meetAt(slot: number, start: number, end: number, u: number, v: number): void {
  positionAt(slot, start);
  const far = Math.hypot(u - point.u, v - point.v);
  const most = JOG_SPEED * Math.max(end - EARLY - start, 0);
  const keep = far > most ? most / far : 1;
  meet.u = point.u + (u - point.u) * keep;
  meet.v = point.v + (v - point.v) * keep;
}

function swing(slot: number, time: number, code: number, contact: number): void {
  const at = slot * 2 + (swings[slot]! % 2);
  swingT[at] = time;
  swingCode[at] = code;
  swingContact[at] = contact;
  swings[slot]!++;
}

// There as the ball is, and playing it; or lunging for it, too late.
function receive(slot: number, start: number, end: number, code: number, contact: number): void {
  moveTo(slot, start, meet.u, meet.v, end);
  swing(slot, end, code, contact);
}

const miss = (slot: number, start: number, end: number): void =>
  moveTo(slot, start, meet.u, meet.v, start + (end - start) * 1.3);

// The ball's path for the stroke being drawn: from a point, along up to four arcs.
const LEGS = 4;
const legT = new Float64Array(LEGS + 1);
const legU = new Float64Array(LEGS + 1);
const legV = new Float64Array(LEGS + 1);
const legY = new Float64Array(LEGS + 1);
const legApex = new Float64Array(LEGS);
const legRolls = new Uint8Array(LEGS);
let legs = 0;

function pathFrom(time: number, u: number, v: number, y: number): void {
  legs = 0;
  legT[0] = time;
  legU[0] = u;
  legV[0] = v;
  legY[0] = y;
}

// Returns when the ball gets there.
function pathTo(time: number, u: number, v: number, y: number, apex: number, rolls = false) {
  legApex[legs] = apex;
  legRolls[legs] = rolls ? 1 : 0;
  legs++;
  legT[legs] = time;
  legU[legs] = u;
  legV[legs] = v;
  legY[legs] = y;
  return time;
}

const pathEnd = (): number => legT[legs]!;

function ballOnPath(): void {
  const { time, into } = r;
  let leg = 0;
  while (leg < legs - 1 && time >= legT[leg + 1]!) leg++;
  const span = legT[leg + 1]! - legT[leg]!;
  let done = span > 0 ? clamp((time - legT[leg]!) / span, 0, 1) : 1;
  // A roll slows to a stop rather than arriving at speed.
  if (legRolls[leg] === 1) done = 1 - (1 - done) * (1 - done);
  const arc = 4 * legApex[leg]! * done * (1 - done);
  into.ballU = legU[leg]! + (legU[leg + 1]! - legU[leg]!) * done;
  into.ballV = legV[leg]! + (legV[leg + 1]! - legV[leg]!) * done;
  into.ballY = legY[leg]! + (legY[leg + 1]! - legY[leg]!) * done + arc;
  into.ballHeld = false;
}

// The apex an arc needs to pass over the net, if it crosses the net at all.
function clearing(u0: number, y0: number, u1: number, y1: number, apex: number): number {
  const net = r.game.court.net;
  if (!net || (u0 - net.u) * (u1 - net.u) >= 0) return apex;
  const at = (net.u - u0) / (u1 - u0);
  const chord = y0 + (y1 - y0) * at;
  return Math.max(apex, (net.top + 1 + CLEAR - chord) / (4 * at * (1 - at)));
}

function holdBall(slot: number, time: number, height: number): void {
  const { into } = r;
  positionAt(slot, time);
  const du = aimU[slot]! - point.u;
  const dv = aimV[slot]! - point.v;
  const far = Math.hypot(du, dv) || 1;
  into.ballU = point.u + (du / far) * AHEAD;
  into.ballV = point.v + (dv / far) * AHEAD;
  into.ballY = height;
  into.ballHeld = true;
}

const dribble = (slot: number): void =>
  holdBall(slot, r.time, HAND * Math.abs(Math.sin((Math.PI * r.time) / DRIBBLE_BEAT)));

// The serve's toss, before which the server holds the ball. False once it is struck.
function serving(server: number, toss: number): boolean {
  const { time, into, game } = r;
  if (time >= toss + TOSS) return false;
  holdBall(server, Math.min(time, toss), game.strike);
  if (time < toss) return true;
  const done = (time - toss) / TOSS;
  into.ballY = game.strike + TOSS_RISE * done + 4 * TOSS_RISE * done * (1 - done);
  into.ballHeld = false;
  return true;
}

const isMoving = (slot: number, time: number): boolean =>
  time > fromT[slot]! &&
  time < toT[slot]! &&
  Math.hypot(toU[slot]! - fromU[slot]!, toV[slot]! - fromV[slot]!) > 0.5;

const WAIT_WINDOW = 2.5;
const WAIT_HOPPING = 0.8;
const WAIT_SHARE = 0.35;

function hopsWaiting(slot: number, time: number): boolean {
  if (waits[slot] !== 1 || !Number.isFinite(time)) return false;
  const window = Math.floor(time / WAIT_WINDOW);
  if (time - window * WAIT_WINDOW >= WAIT_HOPPING) return false;
  return unit(hash(slot * 977 + window, WAIT_HOP)) < WAIT_SHARE;
}

function poseAt(slot: number, time: number): number {
  for (let at = slot * 2; at < slot * 2 + 2; at++) {
    const progress = swingContact[at]! + (time - swingT[at]!) / SWING;
    if (progress >= 0 && progress < 1) return poseWith(swingCode[at]!, progress);
  }
  if (isMoving(slot, time)) return DRAWN_POSE.jog;
  if (hopsWaiting(slot, time)) return DRAWN_POSE.hop;
  return RESTING.standing;
}

// Towards the ball, unless it is in their own hands: then where they mean to send it.
function finish(): GameState {
  const { time, into } = r;
  for (let k = 0; k < everyoneCount; k++) {
    const slot = everyone[k]!;
    positionAt(slot, time);
    into.u[slot] = point.u;
    into.v[slot] = point.v;
    const near = Math.hypot(into.ballU - point.u, into.ballV - point.v) < AHEAD + 0.5;
    const lookU = near ? aimU[slot]! : into.ballU;
    const lookV = near ? aimV[slot]! : into.ballV;
    into.heading[slot] = Math.atan2(lookU - point.u, lookV - point.v);
    into.pose[slot] = poseAt(slot, time);
  }
  return into;
}

// The stroke under way: who struck it, from which side, when and from where.
const stroke = { hitter: 0, side: 0, start: 0, u: 0, v: 0, y: 0 };

function strokeFrom(hitter: number, start: number, y: number): void {
  positionAt(hitter, start);
  stroke.hitter = hitter;
  stroke.side = sideOf(hitter);
  stroke.start = start;
  stroke.u = point.u;
  stroke.v = point.v;
  stroke.y = y;
}

// What the stroke under way comes to: who plays it next, and whether anybody does.
const played = { receiver: 0, winner: false, rise: 0 };

function playedBy(receiver: number, winner: boolean, rise = 0): void {
  played.receiver = receiver;
  played.winner = winner;
  played.rise = rise;
}

// Draws the ball on the stroke under way and says to stop, if the replay has got to `time` or
// the point is over.
function settles(): boolean {
  const end = pathEnd();
  if (played.winner) r.into.over = end;
  if (r.time >= end && !played.winner) return false;
  ballOnPath();
  return true;
}

// Into the half `side` defends, `depth` from the middle.
const ownU = (side: number, depth: number): number => middle() + sideSign[side]! * depth;

// Kept on the side's own half, clear of the net, and no further out than `out` past the lines.
function onOwnHalf(side: number, u: number, v: number, out: number): void {
  const { halfLength, halfWidth } = r.game.court;
  point.u = ownU(side, clamp(sideSign[side]! * (u - middle()), 2, halfLength + out));
  point.v = clamp(v, -halfWidth - out, halfWidth + out);
}

const TENNIS = {
  serve: { min: 1.1, max: 1.4 },
  drive: { min: 1.1, max: 1.6 },
  volley: { min: 0.8, max: 1.1 },
  // The share of a receiving pair's balls the net player takes.
  volleys: 0.35,
  // The service line, as a share of the half court: 21 feet of 39.
  service: 0.55,
  // A doubles alley's width, which singles leaves out.
  alley: 5,
  ahead: { min: 8, max: 20 },
  serveRun: { min: 14, max: 20 },
  // Past the baseline to where a ball nobody reached lies, inside every court's surround.
  runOut: 8,
  runSpeed: 30,
  rollSpeed: 12,
} as const;

const singlesHalf = (): number => r.game.court.halfWidth - TENNIS.alley;

// The bounce.
const land = { u: 0, v: 0 };

// In the back half of the box: from the baseline, a serve landing short would have to be lobbed.
function serviceBox(n: number, side: number, deuce: number): void {
  const deepest = r.game.court.halfLength * TENNIS.service - 1;
  land.u = ownU(side, deepest * (0.5 + unit(hash(n, BOUNCE)) * 0.5));
  land.v = -deuce * (1.5 + unit(hash(n, TARGET_V)) * (singlesHalf() - 3));
}

// Ahead of where the receiver meets the ball, on its line, inside the lines.
function bounceAhead(n: number, side: number): void {
  const { halfLength, halfWidth } = r.game.court;
  const depth = sideSign[side]! * (meet.u - middle()) - draw(TENNIS.ahead, n, BOUNCE);
  land.u = ownU(side, clamp(depth, 3, halfLength - 1));
  const along = (land.u - stroke.u) / (meet.u - stroke.u || 1);
  land.v = clamp(stroke.v + (meet.v - stroke.v) * along, 1 - halfWidth, halfWidth - 1);
}

// On along the line from the stroke through the bounce, to the back of `side`'s half.
function runOut(side: number): void {
  const edge = r.game.court.halfWidth + TENNIS.runOut;
  point.u = sideSign[side]! * (r.game.court.halfLength + TENNIS.runOut);
  const along = (point.u - stroke.u) / (land.u - stroke.u || 1);
  point.v = clamp(stroke.v + (land.v - stroke.v) * along, -edge, edge);
}

// Singles from the baselines' middle; anybody more waits by the net post on their own side.
function singlesReady(): void {
  for (const side of [0, 1]) {
    for (let k = 0; k < sideCount[side]!; k++) {
      const slot = playerOn(side, k);
      readyU[slot] = k === 0 ? sideSign[side]! * (r.game.court.halfLength + 2) : ownU(side, 3);
      readyV[slot] = k === 0 ? 0 : -(r.game.court.halfWidth + 2);
      waits[slot] = k === 0 ? 0 : 1;
    }
  }
}

function serveOn(n: number, side: number, receiver: number, end: number, deuce: number): void {
  serviceBox(n, side, deuce);
  const run = draw(TENNIS.serveRun, n, TARGET_U);
  const far = Math.hypot(land.u - stroke.u, land.v - stroke.v) || 1;
  const u = land.u + ((land.u - stroke.u) / far) * run;
  meetAt(receiver, stroke.start, end, u, land.v + ((land.v - stroke.v) / far) * run);
}

function driveTo(n: number, side: number, receiver: number, end: number, width: number): void {
  const u = readyU[receiver]! + spread(3, n, TARGET_U);
  onOwnHalf(side, u, spread(width - 2, n, TARGET_V), 4);
  meetAt(receiver, stroke.start, end, point.u, point.v);
}

// Through the air to the bounce, or straight to the receiver on a volley. Returns when.
function tennisFlight(n: number, end: number, volley: boolean): number {
  const { strike } = r.game;
  const apex = 2 + unit(hash(n, APEX)) * 3;
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  if (volley)
    return pathTo(end, meet.u, meet.v, strike, clearing(stroke.u, stroke.y, meet.u, strike, apex));
  const first = Math.hypot(land.u - stroke.u, land.v - stroke.v);
  const second = Math.hypot(meet.u - land.u, meet.v - land.v);
  // Slower off the court than through the air.
  const landsAt = stroke.start + ((end - stroke.start) * first) / (first + 1.5 * second || 1);
  return pathTo(landsAt, land.u, land.v, 0, clearing(stroke.u, stroke.y, land.u, 0, apex));
}

// The tennis ball under way: its number in the rally, who it goes to, and how it ends.
const shot = { n: 0, side: 0, receiver: 0, end: 0, volley: false, winner: false };

function aimShot(doubles: boolean, deuce: number): void {
  const { n, side, receiver, end } = shot;
  if (n === 0) return serveOn(n, side, receiver, end, deuce);
  driveTo(n, side, receiver, end, doubles ? r.game.court.halfWidth : singlesHalf());
  if (!shot.volley) bounceAhead(n, side);
}

// Into the receiver's stroke, or past them, too late, and on to the back of the court.
function endShot(landsAt: number): void {
  const { side, receiver, end } = shot;
  if (!shot.winner) {
    if (!shot.volley) pathTo(end, meet.u, meet.v, r.game.strike, 1.5);
    return receive(receiver, stroke.start, end, DRAWN_POSE.strike, STRIKE_CONTACT);
  }
  runOut(side);
  const run = Math.hypot(point.u - land.u, point.v - land.v);
  pathTo(landsAt + run / TENNIS.runSpeed, point.u, point.v, 0, 2);
  miss(receiver, stroke.start, end);
}

// One ball from the stroke under way to whoever on the other side plays it.
function tennisBall(n: number, doubles: boolean, deuce: number): void {
  const pairs = doubles && n > 0 && unit(hash(n, RECEIVER)) < TENNIS.volleys;
  const length = draw(n === 0 ? TENNIS.serve : TENNIS.drive, n, STROKE_LENGTH);
  shot.n = n;
  shot.side = 1 - stroke.side;
  shot.winner = stroke.start + length >= r.play;
  shot.volley = pairs && !shot.winner;
  shot.end = stroke.start + (shot.volley ? draw(TENNIS.volley, n, STROKE_LENGTH) : length);
  shot.receiver = playerOn(shot.side, shot.volley ? 1 : 0);
  aimShot(doubles, deuce);
  endShot(tennisFlight(n, shot.end, shot.volley));
  jogHome(stroke.hitter, stroke.start);
  playedBy(shot.receiver, shot.winner);
}

function tennisMatch(): void {
  const doubles = sideCount[0]! >= 2 && sideCount[1]! >= 2;
  if (!doubles) singlesReady();
  jogEverybodyHome();
  const serves = (r.game.salt + r.rally) % 2;
  const server = playerOn(serves, 0);
  const deuce = ((r.rally >> 1) & 1) === 0 ? 1 : -1;
  const back = r.game.court.halfLength + 1;
  const ready = Math.max(
    jogTo(server, 0, sideSign[serves]! * back, deuce * 4),
    jogTo(playerOn(1 - serves, 0), 0, sideSign[1 - serves]! * back, -deuce * 8),
  );
  const toss = clamp(ready, 1, 3);
  swing(server, toss + TOSS, DRAWN_POSE.strike, STRIKE_CONTACT);
  if (serving(server, toss)) return;
  strokeFrom(server, toss + TOSS, r.game.strike + TOSS_RISE);
  for (let n = 0; ; n++) {
    tennisBall(n, doubles, deuce);
    if (settles()) return;
    strokeFrom(played.receiver, pathEnd(), r.game.strike);
  }
}

// Bounces in the box, bounces again, and rolls on to the back. Returns when it lies still.
function practiceBall(n: number, side: number, deuce: number): number {
  serviceBox(n, side, deuce);
  const apex = 2 + unit(hash(n, APEX)) * 2;
  const flight = draw(TENNIS.serve, n, STROKE_LENGTH) * 0.6;
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  const landsAt = stroke.start + flight;
  pathTo(landsAt, land.u, land.v, 0, clearing(stroke.u, stroke.y, land.u, 0, apex));
  runOut(side);
  const run = Math.hypot(point.u - land.u, point.v - land.v);
  const hop = 0.35;
  const bounceU = land.u + (point.u - land.u) * hop;
  const bounceV = land.v + (point.v - land.v) * hop;
  const bounced = pathTo(landsAt + (run * hop) / TENNIS.runSpeed, bounceU, bounceV, 0, 1.5);
  return pathTo(bounced + (run * (1 - hop)) / TENNIS.rollSpeed, point.u, point.v, 0, 0, true);
}

// Serve after serve into the far court, from a basket that never empties.
function servePractice(): void {
  const serves = sideCount[0]! > 0 ? 0 : 1;
  singlesReady();
  jogEverybodyHome();
  const server = playerOn(serves, 0);
  const back = sideSign[serves]! * (r.game.court.halfLength + 1);
  for (let n = 0, start = 0; ; n++) {
    const deuce = n % 2 === 0 ? 1 : -1;
    const toss = Math.max(jogTo(server, start, back, deuce * 4), start + 0.8);
    swing(server, toss + TOSS, DRAWN_POSE.strike, STRIKE_CONTACT);
    if (serving(server, toss)) return;
    strokeFrom(server, toss + TOSS, r.game.strike + TOSS_RISE);
    start = practiceBall(n, 1 - serves, deuce) + 0.3;
    playedBy(server, start >= r.play);
    if (settles()) return;
  }
}

export function tennisAt(game: Game, lineup: Lineup, rally: number, time: number, into: GameState) {
  begin(game, lineup, rally, time, into);
  if (sideCount[0]! > 0 && sideCount[1]! > 0) tennisMatch();
  else servePractice();
  return finish();
}

const VOLLEY = {
  serve: { min: 1.4, max: 1.8 },
  over: { min: 1.3, max: 1.7 },
  set: { min: 1.1, max: 1.5 },
  spike: { min: 0.6, max: 0.8 },
  bump: { min: 1.3, max: 1.7 },
  overApex: { min: 3, max: 6 },
  setApex: { min: 5, max: 9 },
  bumpApex: { min: 6, max: 10 },
  serveBack: 3,
  spikes: 0.5,
  // A spike is met above the hand, at the top of a jump.
  spikeRise: 2,
} as const;

// A side's turn with the ball: how many touches it will take, and how many it has taken.
const visit = { touch: 1, touches: 1 };

const touchesFor = (n: number, side: number): number =>
  1 + Math.floor(unit(hash(n, TOUCHES)) * Math.min(3, sideCount[side]! + 1));

// Only a third touch is spiked.
const spikes = (n: number): boolean => visit.touches === 3 && unit(hash(n, SPIKE)) < VOLLEY.spikes;

function teammateOf(n: number, side: number, hitter: number): number {
  const count = sideCount[side]!;
  if (count < 2) return hitter;
  let at = 0;
  while (playerOn(side, at) !== hitter) at++;
  const step = 1 + Math.floor(unit(hash(n, RECEIVER)) * (count - 1));
  return playerOn(side, (at + step) % count);
}

function volleyMeet(n: number, receiver: number, off: number, end: number): void {
  const u = readyU[receiver]! + spread(off, n, TARGET_U);
  const v = readyV[receiver]! + spread(off + 1, n, TARGET_V);
  onOwnHalf(sideOf(receiver), u, v, -1);
  meetAt(receiver, stroke.start, end, point.u, point.v);
}

function overTheNet(n: number): void {
  const side = 1 - stroke.side;
  const spike = n > 0 && spikes(n);
  const end =
    stroke.start +
    draw(n === 0 ? VOLLEY.serve : spike ? VOLLEY.spike : VOLLEY.over, n, STROKE_LENGTH);
  const receiver = playerOn(side, Math.floor(unit(hash(n, RECEIVER)) * sideCount[side]!));
  const winner = end >= r.play;
  volleyMeet(n, receiver, 3, end);
  const y = winner ? 0 : r.game.strike;
  const apex = spike ? 0.5 : draw(VOLLEY.overApex, n, APEX);
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  pathTo(end, meet.u, meet.v, y, clearing(stroke.u, stroke.y, meet.u, y, apex));
  if (winner) miss(receiver, stroke.start, end);
  else receive(receiver, stroke.start, end, DRAWN_POSE.reach, REACH_CONTACT);
  jogHome(stroke.hitter, stroke.start);
  visit.touch = 1;
  visit.touches = touchesFor(n, side);
  playedBy(receiver, winner);
}

// To a teammate on the same side, or up into the air to oneself.
function setUp(n: number): void {
  const end = stroke.start + draw(VOLLEY.set, n, STROKE_LENGTH);
  const receiver = teammateOf(n, stroke.side, stroke.hitter);
  volleyMeet(n, receiver, 2, end);
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  pathTo(end, meet.u, meet.v, r.game.strike, draw(VOLLEY.setApex, n, APEX));
  visit.touch++;
  const spiked = visit.touch === visit.touches && spikes(n + 1);
  receive(receiver, stroke.start, end, spiked ? DRAWN_POSE.hop : DRAWN_POSE.reach, REACH_CONTACT);
  if (receiver !== stroke.hitter) jogHome(stroke.hitter, stroke.start);
  playedBy(receiver, false, spiked ? VOLLEY.spikeRise : 0);
}

function volleyMatch(): void {
  const serves = (r.game.salt + r.rally) % 2;
  const server = playerOn(serves, (r.rally >> 1) % sideCount[serves]!);
  jogEverybodyHome();
  const behind = sideSign[serves]! * (r.game.court.halfLength + VOLLEY.serveBack);
  const toss = clamp(jogTo(server, 0, behind, readyV[server]!), 1, 3.5);
  swing(server, toss + TOSS, DRAWN_POSE.strike, STRIKE_CONTACT);
  if (serving(server, toss)) return;
  strokeFrom(server, toss + TOSS, r.game.strike + TOSS_RISE);
  visit.touch = 1;
  visit.touches = 1;
  for (let n = 0; ; n++) {
    if (visit.touch === visit.touches) overTheNet(n);
    else setUp(n);
    if (settles()) return;
    strokeFrom(played.receiver, pathEnd(), r.game.strike + played.rise);
  }
}

function bump(n: number): void {
  const side = stroke.side;
  const end = stroke.start + draw(VOLLEY.bump, n, STROKE_LENGTH);
  const receiver = playerOn(side, (n + 1) % sideCount[side]!);
  const dropped = end >= r.play;
  volleyMeet(n, receiver, 2, end);
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  pathTo(end, meet.u, meet.v, dropped ? 0 : r.game.strike, draw(VOLLEY.bumpApex, n, APEX));
  if (dropped) miss(receiver, stroke.start, end);
  else receive(receiver, stroke.start, end, DRAWN_POSE.reach, REACH_CONTACT);
  if (receiver !== stroke.hitter) jogHome(stroke.hitter, stroke.start);
  playedBy(receiver, dropped);
}

// Nobody across the net: the ball goes up and down among whoever is there, until it is dropped.
function bumping(): void {
  const first = playerOn(sideCount[0]! > 0 ? 0 : 1, 0);
  jogEverybodyHome();
  const start = clamp(toT[first]!, 1, 3);
  swing(first, start, DRAWN_POSE.reach, REACH_CONTACT);
  if (r.time < start) return holdBall(first, r.time, HAND);
  strokeFrom(first, start, r.game.strike);
  for (let n = 0; ; n++) {
    bump(n);
    if (settles()) return;
    strokeFrom(played.receiver, pathEnd(), r.game.strike);
  }
}

export function volleyballAt(
  game: Game,
  lineup: Lineup,
  rally: number,
  time: number,
  into: GameState,
) {
  begin(game, lineup, rally, time, into);
  if (sideCount[0]! > 0 && sideCount[1]! > 0) volleyMatch();
  else bumping();
  return finish();
}

const BASKET = {
  shot: { min: 0.9, max: 1.2 },
  hold: { min: 0.6, max: 1.4 },
  shotApex: { min: 4, max: 7 },
  rebound: { min: 4, max: 12 },
  // Through the ring to the floor, then up into a pair of hands.
  drop: 0.4,
  bounce: 0.5,
  offRim: 0.7,
  makes: 0.55,
  // Above the hand, at a jump shot's release.
  release: 3,
  shotContact: 0.6,
  passSpeed: 30,
  pass: { min: 0.4, max: 1 },
  // An attacker stands nearer the middle than the defender they mirror, and beside them.
  attackIn: 4,
  attackAcross: 3,
  // How far a defender leans from their place towards the ball.
  shade: 0.3,
  // A shot needs this long after its release to come down into somebody's hands.
  shotRoom: 2.5,
  settledFor: 5,
  teamOf: 5,
} as const;

function hoopOn(side: number): Hoop {
  const { hoops } = r.game.court;
  for (const hoop of hoops) if (Math.sign(hoop.u) === sideSign[side]) return hoop;
  return hoops[side % hoops.length]!;
}

// Where they are at `time`.
function nearestTo(slots: Int32Array, count: number, u: number, v: number, time: number): number {
  let best = slots[0]!;
  let bestFar = Infinity;
  for (let k = 0; k < count; k++) {
    positionAt(slots[k]!, time);
    const far = Math.hypot(point.u - u, point.v - v);
    if (far >= bestFar) continue;
    best = slots[k]!;
    bestFar = far;
  }
  return best;
}

// From the stroke under way to the hoop, and down into the rebounder's hands. Returns when.
function shoot(n: number, hoop: Hoop, rebounder: number): number {
  const atRim = stroke.start + draw(BASKET.shot, n, STROKE_LENGTH);
  const made = unit(hash(n, MADE)) < BASKET.makes;
  const caught = atRim + (made ? BASKET.drop + BASKET.bounce : BASKET.offRim);
  const inward = -Math.sign(hoop.u) || 1;
  const u = hoop.u + inward * draw(BASKET.rebound, n, TARGET_U);
  meetAt(rebounder, stroke.start, caught, u, hoop.v + spread(6, n, TARGET_V));
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  pathTo(atRim, hoop.u, hoop.v, hoop.y + 1, draw(BASKET.shotApex, n, APEX));
  if (made) pathTo(atRim + BASKET.drop, hoop.u, hoop.v, 0, 0);
  pathTo(caught, meet.u, meet.v, r.game.strike, made ? 1.5 : 2.5);
  receive(rebounder, stroke.start, caught, DRAWN_POSE.hop, 0.5);
  return caught;
}

function shootingHoop(): Hoop {
  const [a, b] = r.game.court.hoops;
  if (!b) return a!;
  let votes = 0;
  for (let k = 0; k < everyoneCount; k++) {
    const slot = everyone[k]!;
    const toA = Math.hypot(homeU(slot) - a!.u, homeV(slot) - a!.v);
    votes += toA <= Math.hypot(homeU(slot) - b.u, homeV(slot) - b.v) ? 1 : -1;
  }
  if (votes === 0) return (r.game.salt + r.rally) % 2 === 0 ? a! : b;
  return votes > 0 ? a! : b;
}

// Each takes a place of their own on the hoop's half, from those the art declares there.
function spotsAround(hoop: Hoop): void {
  const count = r.game.players.length;
  let spot = -1;
  for (let k = 0; k < everyoneCount; k++) {
    const slot = everyone[k]!;
    for (let tries = 0; tries < count; tries++) {
      spot = (spot + 1) % count;
      if (Math.sign(homeU(spot)) === Math.sign(hoop.u)) break;
    }
    readyU[slot] = homeU(spot);
    readyV[slot] = homeV(spot);
    aimU[slot] = hoop.u;
    aimV[slot] = hoop.v;
  }
  jogEverybodyHome();
}

const nextPlaying = (slot: number): number => {
  let at = 0;
  while (everyone[at] !== slot) at++;
  return everyone[(at + 1) % everyoneCount]!;
};

// Turn and turn about at one hoop, each rebounding the shot before their own.
function shootAround(): void {
  const hoop = shootingHoop();
  spotsAround(hoop);
  let shooter = nearestTo(everyone, everyoneCount, hoop.u, hoop.v, 0);
  for (let n = 0, start = 0; ; n++) {
    const release = Math.max(toT[shooter]!, start + 0.6) + draw(BASKET.hold, n, HOLD);
    swing(shooter, release, DRAWN_POSE.reach, BASKET.shotContact);
    if (r.time < release) return dribble(shooter);
    strokeFrom(shooter, release, r.game.strike + BASKET.release);
    const rebounder = nextPlaying(shooter);
    const caught = shoot(n, hoop, rebounder);
    if (r.time < caught) return ballOnPath();
    shooter = rebounder;
    start = caught;
    if (release + BASKET.shotRoom >= r.play) {
      r.into.over = caught;
      return dribble(shooter);
    }
    jogHome(shooter, caught);
  }
}

// The attackers take the defenders' places, mirrored through the middle and stood off them.
// Returns when the last of them gets there.
function teamsReady(attacks: number, hoop: Hoop): number {
  for (let k = 0; k < sideCount[attacks]!; k++) {
    const slot = playerOn(attacks, k);
    const u = -homeU(slot);
    readyU[slot] = u - Math.sign(u) * BASKET.attackIn;
    readyV[slot] = -homeV(slot) + BASKET.attackAcross;
    aimU[slot] = hoop.u;
    aimV[slot] = hoop.v;
  }
  jogEverybodyHome();
  let settled = 0;
  for (let k = 0; k < sideCount[attacks]!; k++) {
    settled = Math.max(settled, toT[playerOn(attacks, k)]!);
  }
  return settled;
}

function shade(defends: number): void {
  for (let k = 0; k < sideCount[defends]!; k++) {
    const slot = playerOn(defends, k);
    const u = homeU(slot) + (meet.u - homeU(slot)) * BASKET.shade;
    jogTo(slot, stroke.start, u, homeV(slot) + (meet.v - homeV(slot)) * BASKET.shade);
  }
}

// Returns when it is caught.
function pass(n: number): number {
  const receiver = teammateOf(n, stroke.side, stroke.hitter);
  const u = readyU[receiver]! + spread(2, n, TARGET_U);
  const v = readyV[receiver]! + spread(2, n, TARGET_V);
  const far = Math.hypot(u - stroke.u, v - stroke.v);
  const end = stroke.start + clamp(far / BASKET.passSpeed, BASKET.pass.min, BASKET.pass.max);
  meetAt(receiver, stroke.start, end, u, v);
  pathFrom(stroke.start, stroke.u, stroke.v, stroke.y);
  pathTo(end, meet.u, meet.v, r.game.strike, 1);
  receive(receiver, stroke.start, end, DRAWN_POSE.reach, PASS_CONTACT);
  shade(1 - stroke.side);
  playedBy(receiver, false);
  return end;
}

// One possession: passes about the attacked half, then a shot, which the defence rebounds.
function teamPlay(): void {
  const attacks = (r.game.salt + r.rally) % 2;
  const defends = 1 - attacks;
  const hoop = hoopOn(defends);
  const own = hoopOn(attacks);
  let holder = nearestTo(bySide[attacks]!, sideCount[attacks]!, own.u, own.v, 0);
  let start = clamp(teamsReady(attacks, hoop), 1.5, 4);
  // The run up the court is not the possession: they pass about a while once there.
  const shootBy = Math.max(r.play, start + BASKET.settledFor);
  for (let n = 0; ; n++) {
    const release = n === 0 ? start : start + draw(BASKET.hold, n, HOLD);
    const shoots = release + BASKET.shotRoom >= shootBy;
    swing(holder, release, DRAWN_POSE.reach, shoots ? BASKET.shotContact : PASS_CONTACT);
    if (r.time < release) return dribble(holder);
    if (shoots) {
      strokeFrom(holder, release, r.game.strike + BASKET.release);
      const rebounder = nearestTo(bySide[defends]!, sideCount[defends]!, hoop.u, hoop.v, release);
      r.into.over = shoot(n, hoop, rebounder);
      return r.time < r.into.over ? ballOnPath() : dribble(rebounder);
    }
    strokeFrom(holder, release, r.game.strike);
    start = pass(n);
    if (r.time < start) return ballOnPath();
    holder = played.receiver;
  }
}

export function basketballAt(
  game: Game,
  lineup: Lineup,
  rally: number,
  time: number,
  into: GameState,
) {
  begin(game, lineup, rally, time, into);
  const teams = everyoneCount >= BASKET.teamOf && sideCount[0]! >= 2 && sideCount[1]! >= 2;
  if (game.court.hoops.length === 0) holdBall(everyone[0]!, time, HAND);
  else if (teams) teamPlay();
  else shootAround();
  return finish();
}

const PLAYED = { tennis: tennisAt, volleyball: volleyballAt, basketball: basketballAt } as const;

export const gameAt = (game: Game, lineup: Lineup, rally: number, time: number, into: GameState) =>
  PLAYED[game.kind](game, lineup, rally, time, into);
