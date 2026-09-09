/**
 * The crowd: a few hundred people, and what one frame does to them.
 *
 * Everything here is arranged around one number — the work a single person costs
 * on the CPU each frame, which on a plot the renderer is already CPU-bound on is
 * the only budget that matters. See `docs/crowd.md`.
 *
 * ## Structure of arrays
 *
 * There is no `Person` object and no array of records. Every attribute is a
 * column in a typed array, allocated once at the crowd's capacity, which buys
 * two things: nothing for the collector to walk sixty times a second, and a
 * layout a compute shader could take over later as a port rather than a rewrite.
 * The attributes a person will grow — sex, name, age, hunger, thirst, energy, a
 * bed — are more columns, and none of them changes a line below.
 *
 * ## One segment, whatever a person is doing
 *
 * A person is always walking from one point to another: `from`, `to`, and a
 * parameter `t` between them. That is true on a path, where the two points are
 * the ends of a graph edge, and equally true on the sand, where `to` is a spot
 * somebody picked. So the per-frame loop has **no branch at all** — it advances
 * `t` and lerps — and the only place the two cases differ is the moment of
 * arrival, which happens to one person every few seconds rather than to every
 * person every frame.
 *
 * `rate` is `speed / length`, worked out once when a segment starts, so
 * advancing is a single multiply-add. Heading is worked out then too: a person
 * walking a straight line does not turn, so computing a heading per frame would
 * be computing the same number sixty times.
 *
 * ## Where the height comes from
 *
 * Nowhere. It is lerped along with x and z, because the network's nodes already
 * carry the height of their own paving — so a person crossing the edge between a
 * flight of stairs and the paving above it climbs it, without this file knowing
 * that stairs exist. See `walkNetwork.ts`.
 *
 * ## Seeded, because the benchmark depends on it
 *
 * `docs/rendering.md` is explicit that a bench run only compares with the one
 * before it if the scene has not moved. A crowd wandering off `Math.random` is a
 * scene that moves, so every draw here comes from a seeded generator and the
 * same seed replays the same afternoon.
 */

import { createRandom } from '../../layout/domain/random';
import { BEACH_SURFACE, beachPointAt, type WalkNetwork } from './walkNetwork';

/**
 * How fast a person walks, in voxels a second.
 *
 * A voxel is 25 cm, so this is 1.4 m/s — an unhurried walk, which is what people
 * on holiday do. {@link SPEED_SPREAD} is how far either side of it the crowd is
 * drawn from: a crowd that all walks at exactly one speed marches.
 */
export const WALK_SPEED = 5.6;
const SPEED_SPREAD = 0.25;

/**
 * The longest step the simulation will take, in seconds.
 *
 * A backgrounded tab reports the whole time it was away as one frame, and
 * without a clamp the entire crowd would arrive somewhere else at once. Also the
 * bench's fixed step: see the note at the top of the file.
 */
export const MAX_STEP = 0.1;

/**
 * Chance per arrival at a gate that a person steps off onto the sand.
 *
 * Low, and it has to be: a boardwalk crossing the beach is a run of gates, so
 * this is rolled at every tile of it. At one in two nobody ever reached the far
 * end — the beachfront path emptied into the sand within a couple of tiles, and
 * the boardwalk that the whole beach hangs off had nobody on it.
 */
const ONTO_SAND = 0.06;

/**
 * Chance per arrival on the sand that a person heads back to their gate.
 *
 * Rolled once per spot a roamer walks to, and a roamer's spots are a few tiles
 * apart — see `ROAM_COLUMNS` — so this is rolled every eight seconds or so. One
 * in a hundred is therefore a stay of ten minutes or more.
 *
 * That is deliberate and the number is load-bearing twice over. People arrive at
 * a gate rarely, since the gates are a couple of dozen nodes among a couple of
 * thousand, so a beach that emptied as fast as it filled would never have
 * anybody on it. And it has to be read together with the hop length: shortening
 * the hops without lowering this drained a quarter of the beach in five minutes,
 * because the same chance was suddenly being rolled eight times as often.
 */
const OFF_SAND = 0.01;

/**
 * Share of the crowd that starts out on the sand rather than on the paving.
 *
 * Without it the beach begins empty and fills by random walk, which measured at
 * one person after ten seconds and forty after twenty minutes — a beach nobody
 * is on for the first ten minutes of looking at the resort. People are put where
 * people would be, and the wandering takes it from there.
 */
const ON_SAND_AT_START = 0.25;

/**
 * A person heading back to the path is aimed at this node; while roaming they
 * have none.
 */
const ROAMING = -1;

export interface Crowd {
  readonly network: WalkNetwork;
  /** People the arrays hold room for. */
  readonly capacity: number;
  /** People actually walking; the arrays are only meaningful below this. */
  readonly count: number;

  /** Where each person is now, in voxels. Read by whatever draws them. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Which way each is facing, in radians about the Y axis. */
  readonly heading: Float32Array;
  /** Where each is in their own walk cycle, so a crowd does not march in step. */
  readonly phase: Float32Array;
  /** Which person model each is drawn with. */
  readonly variant: Int32Array;

  /** The segment each is walking, and how far along it. */
  readonly fromX: Float32Array;
  readonly fromY: Float32Array;
  readonly fromZ: Float32Array;
  readonly toX: Float32Array;
  readonly toY: Float32Array;
  readonly toZ: Float32Array;
  readonly t: Float32Array;
  /** Fraction of the segment covered per second: `speed / length`. */
  readonly rate: Float32Array;
  readonly speed: Float32Array;

  /** Node being walked to, or {@link ROAMING} while out on the sand. */
  readonly node: Int32Array;
  /** Node walked in from, so a person does not turn straight back round. */
  readonly cameFrom: Int32Array;
  /** The gate a roamer came out of, and will go back in by. */
  readonly gate: Int32Array;

  /** Every draw the crowd makes, so the same seed replays the same afternoon. */
  readonly random: () => number;
}

export interface CrowdOptions {
  readonly network: WalkNetwork;
  /** How many people to put on the plot. */
  readonly count: number;
  /** How many person models the scene has to draw them with. */
  readonly variants: number;
  readonly seed: number;
}

/**
 * A crowd spread over the network, ready to walk.
 *
 * Capacity is the count: people are not built or removed one at a time the way
 * objects are, and a resort that wants a different crowd gets a new one — the
 * network it walks has been rebuilt underneath it anyway.
 *
 * A network with no edges — a plot with no paving on it — produces an empty
 * crowd rather than an error. That is a plot nobody can walk on, not a mistake.
 */
export function createCrowd(options: CrowdOptions): Crowd {
  const { network, variants, seed } = options;
  const capacity = network.edges.length === 0 ? 0 : Math.max(0, Math.floor(options.count));
  const random = createRandom(seed);

  const crowd: Crowd = {
    network,
    capacity,
    count: capacity,
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
    random,
  };

  const beach = network.beach;
  const onSand = beach && network.gates.length > 0 ? Math.round(capacity * ON_SAND_AT_START) : 0;

  for (let i = 0; i < capacity; i++) {
    crowd.variant[i] = Math.min(variants - 1, Math.floor(random() * variants));
    crowd.phase[i] = random() * Math.PI * 2;
    crowd.speed[i] = WALK_SPEED * (1 + (random() * 2 - 1) * SPEED_SPREAD);
    crowd.cameFrom[i] = -1;
    crowd.gate[i] = -1;

    if (beach && i < onSand) {
      const start = beachPointAt(beach, random);
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
    // Spread the crowd along their edges rather than standing every one of them
    // on a node: two hundred people all starting at a tile centre set off in
    // formation and stay in it for a while.
    crowd.t[i] = random();
    place(crowd, i);
  }

  return crowd;
}

/**
 * Moves the whole crowd on by `dt` seconds.
 *
 * The loop is the feature: an add, a compare, and three lerps per person, with
 * the arrival branch taken by whoever happens to have reached the end of their
 * segment. Nothing here allocates and nothing here asks the terrain anything.
 */
export function stepCrowd(crowd: Crowd, dt: number): void {
  const step = Math.min(Math.max(dt, 0), MAX_STEP);
  if (step === 0) return;

  for (let i = 0; i < crowd.count; i++) {
    crowd.t[i]! += crowd.rate[i]! * step;
    if (crowd.t[i]! >= 1) arrive(crowd, i);
    place(crowd, i);
  }
}

/** Writes a person's position from the segment they are on. */
function place(crowd: Crowd, i: number): void {
  const t = crowd.t[i]!;
  crowd.x[i] = crowd.fromX[i]! + (crowd.toX[i]! - crowd.fromX[i]!) * t;
  crowd.y[i] = crowd.fromY[i]! + (crowd.toY[i]! - crowd.fromY[i]!) * t;
  crowd.z[i] = crowd.fromZ[i]! + (crowd.toZ[i]! - crowd.fromZ[i]!) * t;
}

/**
 * What happens when someone reaches the end of their segment.
 *
 * Three cases, and which one applies is entirely a question of where they are:
 * out on the sand, arriving at a gate, or walking the graph. The leftover `t` is
 * carried into the next segment rather than dropped, so a very short edge taken
 * at speed does not cost a frame of standing still.
 */
function arrive(crowd: Crowd, i: number): void {
  const leftover = crowd.t[i]! - 1;

  if (crowd.node[i] === ROAMING) {
    roamOn(crowd, i);
  } else {
    const arrived = crowd.node[i]!;
    const node = crowd.network.nodes[arrived]!;
    crowd.fromX[i] = node.x;
    crowd.fromY[i] = node.y;
    crowd.fromZ[i] = node.z;
    if (node.gate && crowd.network.beach && crowd.random() < ONTO_SAND) {
      crowd.gate[i] = arrived;
      crowd.node[i] = ROAMING;
      roamTo(crowd, i);
    } else {
      // The onward pick reads `cameFrom` to know what turning back would be, so
      // it has to happen before this arrival becomes the node walked in from.
      const next = nextNode(crowd, i, arrived);
      aim(crowd, i, next);
    }
    crowd.cameFrom[i] = arrived;
  }

  // Rounding on a very short segment can leave this at or past 1 again, which
  // would arrive twice in one frame; a fraction of the new segment is close
  // enough and cannot loop.
  crowd.t[i] = Math.min(leftover, 0.99);
}

/** A roamer picks another spot on the sand, or heads back in through its gate. */
function roamOn(crowd: Crowd, i: number): void {
  crowd.fromX[i] = crowd.toX[i]!;
  crowd.fromY[i] = crowd.toY[i]!;
  crowd.fromZ[i] = crowd.toZ[i]!;
  if (crowd.random() < OFF_SAND && crowd.gate[i]! >= 0) {
    // Aiming at the gate node puts them back on the graph the moment they get
    // there: arrival at a node is arrival at a node, whatever they crossed to
    // reach it.
    aim(crowd, i, crowd.gate[i]!);
    return;
  }
  roamTo(crowd, i);
}

/** Sends a roamer to a fresh point on the open sand. */
function roamTo(crowd: Crowd, i: number): void {
  const beach = crowd.network.beach;
  if (!beach) {
    aim(crowd, i, crowd.gate[i]! >= 0 ? crowd.gate[i]! : crowd.cameFrom[i]!);
    return;
  }
  const point = beachPointAt(beach, crowd.random, crowd.fromX[i]!);
  segment(crowd, i, point.x, BEACH_SURFACE, point.z);
}

/**
 * Which node a person walks to next.
 *
 * Anything but straight back the way they came, unless that is the only way out
 * — which is a dead-end spur, and turning round is the only thing to do on one.
 * Counting the candidates and then taking the n-th keeps this allocation-free,
 * which matters because it runs on every arrival.
 */
function nextNode(crowd: Crowd, i: number, at: number): number {
  const node = crowd.network.nodes[at]!;
  const back = crowd.cameFrom[i]!;
  // Every adjacency is stored in both directions, so a node somebody walked to
  // always has at least the way back out of it. An isolated paved tile has none,
  // and nobody can have arrived at one.
  if (node.exits.length === 0) return at;

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

/** Starts a person on the segment from where they stand to a node. */
function aim(crowd: Crowd, i: number, node: number): void {
  const target = crowd.network.nodes[node]!;
  crowd.node[i] = node;
  segment(crowd, i, target.x, target.y, target.z);
}

/**
 * Starts a person on a segment to a point, working out the two things that only
 * change when a segment does: how fast `t` runs, and which way they face.
 *
 * A zero-length segment would divide by zero, so it is given a rate that gets
 * the person off it next frame, and the heading they already had.
 */
function segment(crowd: Crowd, i: number, x: number, y: number, z: number): void {
  crowd.toX[i] = x;
  crowd.toY[i] = y;
  crowd.toZ[i] = z;
  const dx = x - crowd.fromX[i]!;
  const dz = z - crowd.fromZ[i]!;
  const length = Math.hypot(dx, y - crowd.fromY[i]!, dz);
  crowd.rate[i] = length > 0 ? crowd.speed[i]! / length : Number.POSITIVE_INFINITY;
  if (length > 0) crowd.heading[i] = Math.atan2(dx, dz);
  crowd.t[i] = 0;
}
