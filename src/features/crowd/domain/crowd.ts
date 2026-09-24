// Structure of arrays, and every state (walking, sitting, held) is a from/to segment,
// so the per-frame loop has no branch; only arrival differs. Every draw is seeded so
// the benchmark replays the same scene.

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { createRandom } from '../../layout/domain/random';
import { LANE, proximityFor, steerWalkers, type Walkers } from './avoidance';
import { nearestNodeTo, nodeIndexFor } from './nearestNode';
import { blockedAt, clearLine } from './sandGrid';
import {
  BEACH_SURFACE,
  beachPointAt,
  OFF_THE_GRAPH,
  type BeachBand,
  type WalkNetwork,
  type WalkNode,
} from './walkNetwork';

// A voxel is 25 cm, so this is 1.4 m/s.
export const WALK_SPEED = 5.6;
const SPEED_SPREAD = 0.25;

// About a body's width per step, which the avoidance spatial hash is sized for.
export const MAX_STEP = 0.1;

// Caps the crowd's speed-up (`crowdRate.ts` reads it) and bounds the catch-up after
// a backgrounded tab.
export const MAX_SUBSTEPS = 32;

// Summed steps of MAX_STEP overshoot slightly in binary; without this an empty extra
// step would run.
const SUBSTEP_EPSILON = 1e-9;

// Low because it is rolled at every gate tile of a boardwalk; higher values emptied
// the boardwalk within a few tiles.
const ONTO_SAND = 0.06;

// Tuned together with the hop length: rolled every eight seconds or so, so 1% is a
// stay of ten minutes or more.
const OFF_SAND = 0.01;

// Otherwise the beach takes ten minutes to fill by random walk.
const ON_SAND_AT_START = 0.25;

// Tuned with SIT_SECONDS: 0.25 put a quarter of the crowd on benches and emptied
// the paths.
const ONTO_SEAT = 0.12;

// Capped so a sitter never reads as a figure somebody forgot to animate.
const SIT_SECONDS = { min: 20, max: 90 } as const;

// Longer than a sit: somebody still on a lounger reads as sunbathing, not as a bug.
const LIE_SECONDS = { min: 60, max: 300 } as const;

// Walked in a straight line and the coast wanders, so a farther target could have a
// bay in the way.
const SEAT_COLUMNS = 3;

const ROAMING = -1;

const TO_SEAT = -2;

const SEATED = -3;

// Held rather than timed: a place having room ends it, not a clock.
const HELD = -4;

// Must stay distinct from ROAMING: a roamer rolls dice, an errand draws nothing,
// which keeps the seeded replay intact.
const ERRAND = -5;

export const ON_SAND = -1;

// Paving puts feet two voxels up, sand only a fraction of one.
const ON_SAND_TOLERANCE = 0.5;

// Bounded so a roamer boxed in by furniture costs no frame of retries.
const ROAM_TRIES = 8;

const PAUSE_SECONDS = 1.5;

// A roamer leaving or reaching a lounger stands inside it, and gates have lamps
// beside them.
const SEAT_CLEAR = 8;
const GATE_CLEAR = TILE_VOXELS / 2 + 2;

// The order is load-bearing: `figureField.ts` separates the poses with min/max
// arithmetic, so walking must be the only one below 1 and lying the only one above 2.
export const RESTING = { none: 0, standing: 1, sitting: 2, lying: 3 } as const;

// The sitting figure swings its legs down by half a leg (`SIT_RISE`), so hips on the
// ground would bury the feet.
export const GROUND_SIT_RISE = 1.5;

export interface Crowd extends Walkers {
  readonly network: WalkNetwork;
  readonly capacity: number;
  readonly count: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
  readonly phase: Float32Array;
  readonly variant: Int32Array;

  readonly fromX: Float32Array;
  readonly fromY: Float32Array;
  readonly fromZ: Float32Array;
  readonly toX: Float32Array;
  readonly toY: Float32Array;
  readonly toZ: Float32Array;
  readonly t: Float32Array;
  readonly rate: Float32Array;
  readonly speed: Float32Array;

  readonly node: Int32Array;
  readonly cameFrom: Int32Array;
  readonly gate: Int32Array;
  readonly seat: Int32Array;
  readonly seatBy: Int32Array;
  readonly holdPose: Uint8Array;
  // A column rather than a smaller count: the mesh was sized per body when the crowd
  // was built.
  readonly offPlot: Uint8Array;

  readonly random: () => number;
  readonly routeOf: ((person: number, at: number) => number) | undefined;
  readonly offTheSand: ((person: number) => boolean) | undefined;
  readonly roamsBeach: boolean;
}

export interface CrowdOptions {
  readonly network: WalkNetwork;
  readonly count: number;
  readonly variants: number;
  readonly seed: number;
  readonly variantOf?: (index: number) => number;
  readonly routeOf?: (person: number, at: number) => number;
  // Needed besides routeOf: routeOf is only asked at nodes, and the sand has none.
  readonly offTheSand?: (person: number) => boolean;
  readonly roamsBeach?: boolean;
}

export function createCrowd(options: CrowdOptions): Crowd {
  const { network, variants, seed } = options;
  // A plot cleared to build on still needs bodies to deal arrivals into once it is paved,
  // so they are kept, off the plot, until then.
  const capacity = Math.max(0, Math.floor(options.count));
  const empty = network.edges.length === 0;
  const random = createRandom(seed);

  const crowd: Crowd = {
    network,
    capacity,
    count: empty ? 0 : capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    phase: new Float32Array(capacity),
    variant: new Int32Array(capacity),
    fromX: new Float32Array(capacity),
    fromY: new Float32Array(capacity),
    fromZ: new Float32Array(capacity),
    toX: new Float32Array(capacity),
    toY: new Float32Array(capacity),
    toZ: new Float32Array(capacity),
    t: new Float32Array(capacity),
    rate: new Float32Array(capacity),
    speed: new Float32Array(capacity),
    node: new Int32Array(capacity),
    cameFrom: new Int32Array(capacity),
    gate: new Int32Array(capacity),
    seat: new Int32Array(capacity).fill(-1),
    seatBy: new Int32Array(network.seats.length).fill(-1),
    holdPose: new Uint8Array(capacity),
    offPlot: new Uint8Array(capacity),
    dirX: new Float32Array(capacity),
    dirZ: new Float32Array(capacity),
    side: new Float32Array(capacity),
    pace: new Float32Array(capacity).fill(1),
    lane: new Uint8Array(capacity),
    ...proximityFor(capacity),
    random,
    routeOf: options.routeOf,
    offTheSand: options.offTheSand,
    roamsBeach: options.roamsBeach ?? true,
  };

  const beach = network.beach;
  const onSand =
    crowd.roamsBeach && beach && network.gates.length > 0
      ? Math.round(capacity * ON_SAND_AT_START)
      : 0;

  for (let i = 0; i < capacity; i++) {
    drawBody(crowd, i, variants, options.variantOf);

    if (empty) {
      crowd.offPlot[i] = 1;
      continue;
    }

    if (beach && i < onSand) {
      let start = beachPointAt(beach, random);
      for (let tries = 1; tries < ROAM_TRIES && inObstacle(network, start); tries++) {
        start = beachPointAt(beach, random);
      }
      crowd.fromX[i] = start.x;
      crowd.fromY[i] = BEACH_SURFACE;
      crowd.fromZ[i] = start.z;
      crowd.gate[i] = network.gates[Math.floor(random() * network.gates.length)]!;
      crowd.node[i] = ROAMING;
      roamTo(crowd, i);
      continue;
    }

    const edge = network.edges[Math.floor(random() * network.edges.length)]!;
    const from = network.nodes[edge.from]!;
    crowd.fromX[i] = from.x;
    crowd.fromY[i] = from.y;
    crowd.fromZ[i] = from.z;
    crowd.cameFrom[i] = edge.from;
    aim(crowd, i, edge.to);
    // Spread along their edges, or everybody sets off in formation.
    crowd.t[i] = random();
    place(crowd, i);
  }

  return crowd;
}

// Drawn in the same order for a body on the plot and one waiting off it, so the draws that
// place people line up either way.
function drawBody(
  crowd: Crowd,
  i: number,
  variants: number,
  variantOf: ((index: number) => number) | undefined,
): void {
  const { random } = crowd;
  // Drawn even when discarded, so the seeded sequence and the benchmark stay the same.
  const drawn = Math.min(variants - 1, Math.floor(random() * variants));
  crowd.variant[i] = variantOf
    ? Math.min(variants - 1, Math.max(0, Math.floor(variantOf(i))))
    : drawn;
  crowd.phase[i] = random() * Math.PI * 2;
  crowd.speed[i] = WALK_SPEED * (1 + (random() * 2 - 1) * SPEED_SPREAD);
  crowd.cameFrom[i] = -1;
  crowd.gate[i] = -1;
}

// Node indices (node, cameFrom, gate, seat, seatBy) are stale after a rebuild;
// everything about the person is kept. Seats are given up because their object may
// be gone; roamers stay on the sand so an edit does not march the beach ashore.
export function reseatCrowd(crowd: Crowd, network: WalkNetwork): Crowd {
  const previous = crowd.network;
  const count = network.edges.length === 0 ? 0 : crowd.capacity;
  const reseated: Crowd = {
    ...crowd,
    network,
    count,
    seatBy: new Int32Array(network.seats.length).fill(-1),
  };
  const index = nodeIndexFor(network);
  const canRoam = network.beach !== null && network.gates.length > 0;

  for (let i = 0; i < count; i++) {
    // Re-anchoring off-plot bodies would stand every checked-out guest on the promenade.
    if (crowd.offPlot[i] === 1) continue;
    const seat = crowd.seat[i]!;
    const lounging = seat >= 0 && previous.seats[seat]?.node === OFF_THE_GRAPH;
    crowd.seat[i] = -1;
    // Undo the sidestep from where they actually stand, not from the old segment start.
    const side = crowd.side[i]!;
    crowd.fromX[i] = crowd.x[i]! - crowd.dirZ[i]! * side;
    crowd.fromY[i] = crowd.y[i]!;
    crowd.fromZ[i] = crowd.z[i]! + crowd.dirX[i]! * side;
    crowd.cameFrom[i] = -1;

    if (canRoam && (lounging || outOnSand(crowd, i))) {
      crowd.gate[i] = network.gates[Math.floor(crowd.random() * network.gates.length)]!;
      crowd.node[i] = ROAMING;
      roamTo(reseated, i, lounging ? SEAT_CLEAR : 0);
      continue;
    }
    crowd.gate[i] = -1;
    // Held people are re-anchored like anyone: the router's record is discarded on
    // rebuild too.
    aim(reseated, i, nearestNodeTo(network, index, crowd.x[i]!, crowd.z[i]!, TILE_VOXELS));
  }
  crowd.seat.fill(-1, count);
  return reseated;
}

// Whole steps of MAX_STEP then the remainder, so one n * MAX_STEP call equals n calls.
// Avoidance runs every step: a sidestep decided steps ago walks through whoever has
// arrived since.
export function stepCrowd(crowd: Crowd, dt: number): void {
  // `!(> 0)` rather than `<= 0`, so a NaN frame is refused along with a negative one.
  if (!(dt > 0)) return;
  let remaining = Math.min(dt, MAX_STEP * MAX_SUBSTEPS);
  while (remaining > SUBSTEP_EPSILON) {
    const step = Math.min(remaining, MAX_STEP);
    integrate(crowd, step);
    remaining -= step;
  }
}

function integrate(crowd: Crowd, step: number): void {
  steerWalkers(crowd, step, crowd.network.sand);
  for (let i = 0; i < crowd.count; i++) {
    crowd.t[i]! += crowd.rate[i]! * crowd.pace[i]! * step;
    if (crowd.t[i]! >= 1) arrive(crowd, i);
    place(crowd, i);
  }
}

function place(crowd: Crowd, i: number): void {
  const t = crowd.t[i]!;
  const side = crowd.side[i]!;
  crowd.x[i] = crowd.fromX[i]! + (crowd.toX[i]! - crowd.fromX[i]!) * t + crowd.dirZ[i]! * side;
  crowd.y[i] = crowd.fromY[i]! + (crowd.toY[i]! - crowd.fromY[i]!) * t;
  crowd.z[i] = crowd.fromZ[i]! + (crowd.toZ[i]! - crowd.fromZ[i]!) * t - crowd.dirX[i]! * side;
}

function inObstacle(network: WalkNetwork, point: { readonly x: number; readonly z: number }) {
  return network.sand !== null && blockedAt(network.sand, point.x, point.z);
}

// The leftover `t` is carried over, so a short edge taken at speed does not cost a
// frame of standing still.
function arrive(crowd: Crowd, i: number): void {
  const leftover = crowd.t[i]! - 1;

  if (crowd.node[i] === ROAMING) {
    roamOn(crowd, i);
  } else if (crowd.node[i] === TO_SEAT) {
    sitDown(crowd, i);
  } else if (crowd.node[i] === SEATED) {
    standUp(crowd, i);
  } else if (crowd.node[i] === ERRAND) {
    runErrand(crowd, i);
  } else {
    arriveAtNode(crowd, i);
  }

  // Rounding on a very short segment could otherwise arrive twice in one frame.
  crowd.t[i] = Math.min(leftover, 0.99);
}

function arriveAtNode(crowd: Crowd, i: number): void {
  const arrived = crowd.node[i]!;
  const node = crowd.network.nodes[arrived]!;
  crowd.fromX[i] = node.x;
  crowd.fromY[i] = node.y;
  crowd.fromZ[i] = node.z;

  const seat = node.seats.length > 0 ? freeSeat(crowd, node) : -1;
  if (strollsOntoSand(crowd, i, node)) {
    crowd.gate[i] = arrived;
    crowd.node[i] = ROAMING;
    roamTo(crowd, i, GATE_CLEAR);
  } else if (seat !== -1 && crowd.random() < ONTO_SEAT) {
    takeSeat(crowd, i, seat);
  } else {
    // `nextNode` reads `cameFrom`, so pick before this arrival overwrites it.
    const onward = nextNode(crowd, i, arrived);
    // Somebody the router just held or sent onto the sand is already placed; aiming
    // them would walk them out of their queue.
    if (onward === HELD) return;
    aim(crowd, i, onward);
  }
  crowd.cameFrom[i] = arrived;
}

// `offTheSand` is asked before rolling, so they cost no draw.
function strollsOntoSand(crowd: Crowd, i: number, node: WalkNode): boolean {
  if (!crowd.roamsBeach || !node.gate || !crowd.network.beach || crowd.offTheSand?.(i)) {
    return false;
  }
  return crowd.random() < ONTO_SAND;
}

// Called from inside `routeOf`, which is why `nextNode` checks for a roamer after
// asking.
export function stepOntoSand(crowd: Crowd, i: number, gate: number): void {
  const node = crowd.network.nodes[gate];
  if (!crowd.network.beach || !node?.gate) return;
  giveUpSeat(crowd, i);
  crowd.fromX[i] = node.x;
  crowd.fromY[i] = node.y;
  crowd.fromZ[i] = node.z;
  crowd.gate[i] = gate;
  crowd.node[i] = ROAMING;
  roamTo(crowd, i, GATE_CLEAR);
}

function roamOn(crowd: Crowd, i: number): void {
  standAtTheEnd(crowd, i);
  if (makesForThePaving(crowd, i)) {
    leaveTheSand(crowd, i);
    return;
  }
  const lounger = crowd.network.beachSeats.length > 0 ? nearbyBeachSeat(crowd, i) : -1;
  if (lounger !== -1 && crowd.random() < ONTO_SEAT) {
    takeSeat(crowd, i, lounger);
    return;
  }
  if (crowd.random() < OFF_SAND && crowd.gate[i]! >= 0 && clearTo(crowd, i, crowd.gate[i]!)) {
    // Aiming at the gate puts them back on the graph on arrival; the walk there is still
    // over sand, hence LANE.sand.
    aim(crowd, i, crowd.gate[i]!);
    crowd.lane[i] = LANE.sand;
    return;
  }
  roamTo(crowd, i);
}

function makesForThePaving(crowd: Crowd, i: number): boolean {
  return !crowd.roamsBeach || crowd.offTheSand?.(i) === true;
}

function standAtTheEnd(crowd: Crowd, i: number): void {
  crowd.fromX[i] = crowd.toX[i]!;
  crowd.fromY[i] = crowd.toY[i]!;
  crowd.fromZ[i] = crowd.toZ[i]!;
  standOnLine(crowd, i);
}

// The onward walk is obstacle-checked from `from`, so it must be where they actually
// stand, not where their line ended.
function standOnLine(crowd: Crowd, i: number): void {
  const side = crowd.side[i]!;
  crowd.fromX[i]! += crowd.dirZ[i]! * side;
  crowd.fromZ[i]! -= crowd.dirX[i]! * side;
  crowd.side[i] = 0;
}

// Only gates within SEAT_COLUMNS, for the straight-line reason. The original gate is
// forgotten: roamers spawned on the sand were given one anywhere on the plot.
function leaveTheSand(crowd: Crowd, i: number): void {
  const { gates, nodes } = crowd.network;
  const reach = SEAT_COLUMNS * TILE_VOXELS;
  const x = crowd.fromX[i]!;
  let reachable = -1;
  let reachableDistance = Number.POSITIVE_INFINITY;
  for (const gate of gates) {
    const distance = Math.hypot(nodes[gate]!.x - x, nodes[gate]!.z - crowd.fromZ[i]!);
    const inReach = Math.abs(nodes[gate]!.x - x) <= reach && distance < reachableDistance;
    if (inReach && clearTo(crowd, i, gate)) {
      reachable = gate;
      reachableDistance = distance;
    }
  }
  if (reachable >= 0) {
    crowd.gate[i] = reachable;
    aim(crowd, i, reachable);
    crowd.lane[i] = LANE.sand;
    return;
  }
  const nearest = nearestGate(crowd.network, x, crowd.fromZ[i]!);
  roamTo(crowd, i, 0, nearest >= 0 ? nodes[nearest]!.x : undefined);
}

// Nothing else asks a sunbather until their lie ends, which can be hours in the dark.
// `t` at 1 lets the ordinary arrival branch stand them up.
export function rouseSunbathers(crowd: Crowd): void {
  const wanted = crowd.offTheSand;
  if (!wanted) return;
  for (const seat of crowd.network.beachSeats) {
    const person = crowd.seatBy[seat]!;
    if (person < 0 || person >= crowd.count) continue;
    if (crowd.node[person] === SEATED && wanted(person)) crowd.t[person] = 1;
  }
}

function clearTo(crowd: Crowd, i: number, node: number): boolean {
  const sand = crowd.network.sand;
  if (!sand) return true;
  const target = crowd.network.nodes[node]!;
  return clearLine(sand, crowd.fromX[i]!, crowd.fromZ[i]!, target.x, target.z, 0, GATE_CLEAR);
}

// A pause is a zero-length segment like a sit, so it costs the loop nothing.
function roamTo(crowd: Crowd, i: number, skipStart = 0, towardX?: number): void {
  const beach = crowd.network.beach;
  if (!beach) {
    aim(crowd, i, crowd.gate[i]! >= 0 ? crowd.gate[i]! : crowd.cameFrom[i]!);
    return;
  }
  crowd.lane[i] = LANE.sand;
  standOnLine(crowd, i);
  if (walkToSpot(crowd, i, beach, skipStart, towardX)) return;
  crowd.toX[i] = crowd.fromX[i]!;
  crowd.toY[i] = crowd.fromY[i]!;
  crowd.toZ[i] = crowd.fromZ[i]!;
  crowd.rate[i] = 1 / PAUSE_SECONDS;
  crowd.t[i] = 0;
}

function walkToSpot(
  crowd: Crowd,
  i: number,
  beach: BeachBand,
  skipStart: number,
  towardX: number | undefined,
): boolean {
  let bestX = 0;
  let bestZ = 0;
  let bestOff = Number.POSITIVE_INFINITY;
  for (let tries = 0; tries < ROAM_TRIES; tries++) {
    const point = beachPointAt(beach, crowd.random, crowd.fromX[i]!);
    if (!spotIsClear(crowd, i, point, skipStart)) continue;
    if (towardX === undefined) {
      segment(crowd, i, point.x, BEACH_SURFACE, point.z);
      return true;
    }
    const off = Math.abs(point.x - towardX);
    if (off < bestOff) {
      bestOff = off;
      bestX = point.x;
      bestZ = point.z;
    }
  }
  if (bestOff === Number.POSITIVE_INFINITY) return false;
  segment(crowd, i, bestX, BEACH_SURFACE, bestZ);
  return true;
}

function spotIsClear(
  crowd: Crowd,
  i: number,
  point: { readonly x: number; readonly z: number },
  skipStart: number,
): boolean {
  const sand = crowd.network.sand;
  if (!sand) return true;
  if (blockedAt(sand, point.x, point.z)) return false;
  return clearLine(sand, crowd.fromX[i]!, crowd.fromZ[i]!, point.x, point.z, skipStart);
}

export function isSeated(crowd: Crowd, i: number): boolean {
  return crowd.node[i] === SEATED;
}

// A predicate rather than the exported sentinel, so nothing outside can compare the
// wrong column against it.
export function isRoaming(crowd: Crowd, i: number): boolean {
  return crowd.node[i] === ROAMING;
}

// Rate zero, so `t` never reaches 1 and only `releaseTo` frees them; LANE.none stops
// avoidance sliding them off the spot.
export function holdAt(
  crowd: Crowd,
  i: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  pose: number = RESTING.standing,
): void {
  // A seat is claimed on setting off, so it must be let go or nobody sits there again.
  giveUpSeat(crowd, i);
  standStill(crowd, i, x, y, z, heading, pose);
}

export function takeOffPlot(crowd: Crowd, i: number, x: number, y: number, z: number): void {
  if (i < 0 || i >= crowd.capacity) return;
  holdAt(crowd, i, x, y, z, crowd.heading[i] ?? 0);
  crowd.offPlot[i] = 1;
}

// Cleared first: `releaseTo` checks where they stand to decide whether they come off
// the sand.
export function putOnPlot(crowd: Crowd, i: number, node: number): void {
  if (i < 0 || i >= crowd.capacity) return;
  crowd.offPlot[i] = 0;
  releaseTo(crowd, i, node);
}

export function isOffPlot(crowd: Crowd, i: number): boolean {
  return crowd.offPlot[i] === 1;
}

export function holdOnSeat(crowd: Crowd, i: number, seat: number): boolean {
  const spot = crowd.network.seats[seat];
  if (!spot || (crowd.seatBy[seat] !== -1 && crowd.seatBy[seat] !== i)) return false;
  if (crowd.seat[i] !== seat) giveUpSeat(crowd, i);
  crowd.seat[i] = seat;
  crowd.seatBy[seat] = i;
  const pose = spot.pose === 'lie' ? RESTING.lying : RESTING.sitting;
  standStill(crowd, i, spot.x, spot.y, spot.z, spot.heading, pose);
  return true;
}

export function seatIsFree(crowd: Crowd, seat: number): boolean {
  return crowd.seatBy[seat] === -1;
}

function standStill(
  crowd: Crowd,
  i: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  pose: number,
): void {
  crowd.holdPose[i] = pose;
  crowd.fromX[i] = x;
  crowd.fromY[i] = y;
  crowd.fromZ[i] = z;
  crowd.toX[i] = x;
  crowd.toY[i] = y;
  crowd.toZ[i] = z;
  crowd.t[i] = 0;
  crowd.rate[i] = 0;
  crowd.side[i] = 0;
  crowd.pace[i] = 1;
  crowd.lane[i] = LANE.none;
  crowd.heading[i] = heading;
  crowd.node[i] = HELD;
  // Written now rather than on the next `place`: the caller reads the position back.
  crowd.x[i] = x;
  crowd.y[i] = y;
  crowd.z[i] = z;
}

// A held person has no meaningful way they came, so `cameFrom` is cleared.
export function releaseTo(crowd: Crowd, i: number, node: number): void {
  giveUpSeat(crowd, i);
  const fromSand = crowd.node[i] === ERRAND || (crowd.node[i] === HELD && standsOnSand(crowd, i));
  stopPartWay(crowd, i);
  crowd.cameFrom[i] = -1;
  aim(crowd, i, node);
  if (fromSand) crowd.lane[i] = LANE.sand;
}

export function walkSandTo(crowd: Crowd, i: number, x: number, z: number): void {
  if (!crowd.network.beach) return;
  giveUpSeat(crowd, i);
  stopPartWay(crowd, i);
  crowd.node[i] = ERRAND;
  crowd.lane[i] = LANE.sand;
  segment(crowd, i, x, BEACH_SURFACE, z);
}

// Turned back mid-walk, `from` is where the walk began, and starting from there would
// jump back across the beach.
function stopPartWay(crowd: Crowd, i: number): void {
  const t = crowd.t[i]!;
  if (!(crowd.rate[i]! > 0) || !(t > 0 && t < 1)) return;
  crowd.fromX[i]! += (crowd.toX[i]! - crowd.fromX[i]!) * t;
  crowd.fromY[i]! += (crowd.toY[i]! - crowd.fromY[i]!) * t;
  crowd.fromZ[i]! += (crowd.toZ[i]! - crowd.fromZ[i]!) * t;
  crowd.t[i] = 0;
}

// No random draw unless the router let go, to keep the seeded replay. The router
// acted if and only if it restarted `t`; if not, they become a roamer.
function runErrand(crowd: Crowd, i: number): void {
  standAtTheEnd(crowd, i);
  crowd.routeOf?.(i, ON_SAND);
  if (crowd.t[i]! < 1) return;
  crowd.gate[i] = nearestGate(crowd.network, crowd.fromX[i]!, crowd.fromZ[i]!);
  crowd.node[i] = ROAMING;
  roamTo(crowd, i);
}

function nearestGate(network: WalkNetwork, x: number, z: number): number {
  let nearest = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const gate of network.gates) {
    const distance = Math.hypot(network.nodes[gate]!.x - x, network.nodes[gate]!.z - z);
    if (distance < nearestDistance) {
      nearest = gate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function standsOnSand(crowd: Crowd, i: number): boolean {
  const sitting = crowd.node[i] === HELD && crowd.holdPose[i] === RESTING.sitting;
  const feet = crowd.y[i]! - (sitting ? GROUND_SIT_RISE : 0);
  return crowd.network.beach !== null && Math.abs(feet - BEACH_SURFACE) < ON_SAND_TOLERANCE;
}

function outOnSand(crowd: Crowd, i: number): boolean {
  const node = crowd.node[i];
  return node === ROAMING || node === ERRAND || (node === HELD && standsOnSand(crowd, i));
}

export function isWaiting(crowd: Crowd, i: number): boolean {
  return i < crowd.count && crowd.node[i] === HELD;
}

export function restingOn(crowd: Crowd, i: number): number {
  if (crowd.node[i] === HELD) return crowd.holdPose[i]!;
  if (crowd.node[i] !== SEATED) return RESTING.none;
  return crowd.network.seats[crowd.seat[i]!]!.pose === 'lie' ? RESTING.lying : RESTING.sitting;
}

function nearbyBeachSeat(crowd: Crowd, i: number): number {
  const reach = SEAT_COLUMNS * TILE_VOXELS;
  const x = crowd.fromX[i]!;
  const z = crowd.fromZ[i]!;
  const sand = crowd.network.sand;
  for (const seat of crowd.network.beachSeats) {
    if (crowd.seatBy[seat] !== -1) continue;
    const spot = crowd.network.seats[seat]!;
    if (Math.abs(spot.x - x) > reach) continue;
    if (sand && !clearLine(sand, x, z, spot.x, spot.z, 0, SEAT_CLEAR)) continue;
    return seat;
  }
  return -1;
}

function freeSeat(crowd: Crowd, node: WalkNode): number {
  for (const seat of node.seats) {
    if (crowd.seatBy[seat] === -1) return seat;
  }
  return -1;
}

// Claimed now, not on arrival, so two people never set off for one plank.
function takeSeat(crowd: Crowd, i: number, seat: number): void {
  const spot = crowd.network.seats[seat]!;
  crowd.seat[i] = seat;
  crowd.seatBy[seat] = i;
  crowd.node[i] = TO_SEAT;
  crowd.lane[i] = LANE.seat;
  segment(crowd, i, spot.x, spot.y, spot.z);
}

// Not via `segment`: a sit needs its own rate (its duration) and the seat's heading.
function sitDown(crowd: Crowd, i: number): void {
  const spot = crowd.network.seats[crowd.seat[i]!]!;
  crowd.fromX[i] = spot.x;
  crowd.fromY[i] = spot.y;
  crowd.fromZ[i] = spot.z;
  crowd.toX[i] = spot.x;
  crowd.toY[i] = spot.y;
  crowd.toZ[i] = spot.z;
  crowd.heading[i] = spot.heading;
  crowd.node[i] = SEATED;
  crowd.lane[i] = LANE.none;
  crowd.side[i] = 0;
  crowd.pace[i] = 1;
  const rest = spot.pose === 'lie' ? LIE_SECONDS : SIT_SECONDS;
  crowd.rate[i] = 1 / (rest.min + crowd.random() * (rest.max - rest.min));
}

function standUp(crowd: Crowd, i: number): void {
  const spot = crowd.network.seats[crowd.seat[i]!]!;
  giveUpSeat(crowd, i);
  crowd.fromX[i] = spot.x;
  crowd.fromY[i] = spot.y;
  crowd.fromZ[i] = spot.z;
  if (spot.node === OFF_THE_GRAPH) {
    crowd.node[i] = ROAMING;
    roamTo(crowd, i, SEAT_CLEAR);
    return;
  }
  aim(crowd, i, spot.node);
}

function giveUpSeat(crowd: Crowd, i: number): void {
  const seat = crowd.seat[i]!;
  if (seat < 0) return;
  crowd.seatBy[seat] = -1;
  crowd.seat[i] = -1;
}

function nextNode(crowd: Crowd, i: number, at: number): number {
  const node = crowd.network.nodes[at]!;
  if (node.exits.length === 0) return at;

  // The answer is not checked against `exits` (a flow field only names neighbours);
  // only naming the current node is guarded, as it would pin them on a zero-length segment.
  const routed = crowd.routeOf?.(i, at) ?? -1;
  // The router may have held them or sent them onto the sand; they must not reach the
  // wander either, since a draw would shift the seeded replay.
  if (crowd.node[i]! < 0) return HELD;
  if (routed >= 0 && routed !== at) return routed;

  return wanderFrom(crowd, i, node);
}

// Counting then picking the n-th keeps this allocation-free on every arrival.
function wanderFrom(crowd: Crowd, i: number, node: WalkNode): number {
  const back = crowd.cameFrom[i]!;
  let onward = 0;
  for (const edge of node.exits) {
    if (crowd.network.edges[edge]!.to !== back) onward++;
  }
  if (onward === 0) return crowd.network.edges[node.exits[0]!]!.to;

  let pick = Math.floor(crowd.random() * onward);
  for (const edge of node.exits) {
    const to = crowd.network.edges[edge]!.to;
    if (to === back) continue;
    if (pick === 0) return to;
    pick--;
  }
  return crowd.network.edges[node.exits[0]!]!.to;
}

function aim(crowd: Crowd, i: number, node: number): void {
  const target = crowd.network.nodes[node]!;
  crowd.node[i] = node;
  crowd.lane[i] = LANE.paved;
  segment(crowd, i, target.x, target.y, target.z);
}

// Carry an ongoing sidestep over to the new direction, or a person keeping right
// jumps across the path at every corner.
function segment(crowd: Crowd, i: number, x: number, y: number, z: number): void {
  crowd.toX[i] = x;
  crowd.toY[i] = y;
  crowd.toZ[i] = z;
  const dx = x - crowd.fromX[i]!;
  const dz = z - crowd.fromZ[i]!;
  const ground = Math.hypot(dx, dz);
  if (ground > 0) {
    const side = crowd.side[i]!;
    const dirX = dx / ground;
    const dirZ = dz / ground;
    crowd.fromX[i]! += (crowd.dirZ[i]! - dirZ) * side;
    crowd.fromZ[i]! += (dirX - crowd.dirX[i]!) * side;
    crowd.dirX[i] = dirX;
    crowd.dirZ[i] = dirZ;
    crowd.heading[i] = Math.atan2(dx, dz);
  }
  const length = Math.hypot(x - crowd.fromX[i]!, y - crowd.fromY[i]!, z - crowd.fromZ[i]!);
  crowd.rate[i] = length > 0 ? crowd.speed[i]! / length : Number.POSITIVE_INFINITY;
  crowd.t[i] = 0;
}
