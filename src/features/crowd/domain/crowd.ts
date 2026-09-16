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
 * ## Sitting down is a segment too
 *
 * Somebody on a bench is the one person who is genuinely not walking, and they
 * are still stored as a segment: `from` and `to` are the **same point** — the
 * seat — and `rate` is `1 / seconds`, so the parameter that measures how far
 * along a walk somebody is measures how much of a sit is left instead. The
 * per-frame loop does not learn a thing; it advances `t` and lerps a point onto
 * itself, and when `t` passes 1 the ordinary arrival branch stands the person
 * up.
 *
 * A lounger is the same thing with a different pose and a different way in:
 * nothing on the beach is paved, so a seat out there hangs off no node, and a
 * roamer picks one out of the handful within a few columns of them instead of
 * walking to a spot. They get up onto the sand again rather than onto a path.
 *
 * That is the whole trick, and it is worth being explicit about what it saves:
 * a `sitting` flag tested per person per frame would put a branch in the one
 * loop this file exists to keep branchless, to serve the handful of people on
 * the plot who are sitting at any moment. What sits in the columns instead is
 * one integer per person — the seat they hold — read only when somebody arrives
 * somewhere.
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
 * The longest step one integration takes, in seconds.
 *
 * Small enough that everybody moves about a body's width in it, which is what
 * `avoidance.ts`'s spatial hash is sized for and what lets the arrival branch
 * carry at most one segment's leftover. Also the bench's fixed step: see the note
 * at the top of the file.
 *
 * It is **not** the most time one call may advance. {@link stepCrowd} runs a
 * longer step as several of these; see {@link MAX_SUBSTEPS}.
 */
export const MAX_STEP = 0.1;

/**
 * The most steps of {@link MAX_STEP} one call to {@link stepCrowd} will run, and
 * so the ceiling on how many times faster than real time the crowd may walk.
 *
 * The one number plan 026 trades against. A crowd walking at the simulation's
 * pace runs `stepCrowd` this many times over at most, and each of those is a
 * full avoidance pass: past it a guest's day fits the clock and the frame does
 * not fit the budget. `sim/domain/crowdRate.ts` caps the crowd's speed-up here
 * rather than at a number of its own, so the two can never disagree.
 *
 * It keeps `MAX_STEP`'s old job too: a backgrounded tab reports the whole time
 * it was away as one frame, and the crowd moves at most this many steps on it
 * rather than arriving somewhere else at once.
 */
export const MAX_SUBSTEPS = 32;

/**
 * How far short of a whole step the remainder may be and still not count as
 * another one. Ten steps of `MAX_STEP` summed are a hair over a second in binary,
 * and without this they would run an eleventh step of nothing.
 */
const SUBSTEP_EPSILON = 1e-9;

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
 * Chance per arrival at a node with a free seat beside it that a person takes
 * it.
 *
 * Rolled only where there is something free to sit on, which is a hundred-odd
 * nodes among a couple of thousand, so unlike {@link ONTO_SAND} it can be a
 * number a person would recognise. It has to be read together with
 * {@link SIT_SECONDS}, because between them they decide how much of the crowd
 * is sitting at any moment: the two are what the measurement below is of.
 *
 * One in four was the first pass and it emptied the paths. The reference plot
 * offers 287 reachable seats to 600 people, and at a quarter with sits of up to
 * three minutes 155 of them were sitting — a quarter of the crowd, on top of
 * the quarter out on the sand, which left the promenade looking closed. At
 * these two numbers it is 56, which reads as benches in use.
 */
const ONTO_SEAT = 0.12;

/**
 * How long a person sits, in seconds: drawn between these two.
 *
 * Twenty seconds to a minute and a half, which is a rest rather than an
 * afternoon. The upper bound is the load-bearing one and it is a matter of
 * looks rather than of cost: a seat held for ten minutes is a figure that has
 * not moved for as long as anybody looks at the plot, which reads as a mesh
 * somebody forgot to animate rather than as a person.
 */
const SIT_SECONDS = { min: 20, max: 90 } as const;

/**
 * How long a person lies on a lounger, in seconds: longer than they sit.
 *
 * A minute to five. The argument against a long hold is that a figure which has
 * not moved for as long as anybody looks at the plot reads as a bug — and that
 * argument is much weaker lying down: somebody stretched out on a sun lounger
 * is *supposed* to be still, where somebody motionless on a bench is a person
 * who forgot what they were doing. It is also what a beach looks like: the
 * loungers stay taken while the paths keep moving.
 */
const LIE_SECONDS = { min: 60, max: 300 } as const;

/**
 * How far a roamer will walk to a lounger, in tile columns.
 *
 * The same three columns a roamer picks their next spot within, and for the
 * same reason it is a correctness rule there rather than a nicety: they walk to
 * it in a **straight line**, and the coast wanders, so a lounger picked from the
 * whole beach could have a bay between it and the person walking to it. See
 * `ROAM_COLUMNS` in `walkNetwork.ts`.
 */
const SEAT_COLUMNS = 3;

/**
 * A person heading back to the path is aimed at this node; while roaming they
 * have none.
 */
const ROAMING = -1;

/** Walking off the graph to a seat they have already claimed. */
const TO_SEAT = -2;

/** Sitting on it. See the note on sitting at the top of the file. */
const SEATED = -3;

/**
 * Standing where the simulation put them: in a queue at a door, or inside
 * somewhere. Held rather than timed, because what ends it is a place having
 * room rather than a clock - see `sim/domain/occupancy.ts`.
 */
const HELD = -4;

/**
 * Walking over the sand to a point the simulation named: a leg of the way to a
 * building on the beach, or back from one. See {@link walkSandTo}.
 *
 * A state of its own rather than {@link ROAMING}, and the two must not merge: a
 * roamer drifts and rolls dice at every spot, and somebody on an errand is
 * steered and draws nothing. Folding them together is how a crowd with no
 * router stops replaying the afternoon it always has.
 */
const ERRAND = -5;

/**
 * What `routeOf` is asked with in place of a node, when somebody sent over the
 * sand by {@link walkSandTo} reaches the point they were sent to. Never a node
 * index, which is why it can be exported without anybody comparing it against
 * the wrong column.
 */
export const ON_SAND = -1;

/**
 * How far off the beach's surface a person may stand and still be stood on sand,
 * in voxels. Paving puts feet two voxels above the ground it is laid
 * on, and the sand's surface is a fraction of a voxel up, so anything close is
 * sand and nothing on a path is.
 */
const ON_SAND_TOLERANCE = 0.5;

/**
 * How many spots on the sand a roamer considers before standing still for a
 * moment instead.
 *
 * A spot is refused when it is inside something or the straight line to it
 * passes through something — see `sandGrid.ts`. Eight is plenty on a beach laid
 * with lines of loungers, and the bound is what keeps a roamer boxed in by
 * furniture from costing a frame of retries.
 */
const ROAM_TRIES = 8;

/** Seconds a roamer with nowhere clear to go stands and looks about. */
const PAUSE_SECONDS = 1.5;

/**
 * Voxels at either end of a walk that are not asked about obstacles.
 *
 * A roamer getting up from a lounger is standing *in* it, and one walking to a
 * lounger is walking into it; a gate is on paving that lamps stand beside. The
 * line in between is what must be clear.
 */
const SEAT_CLEAR = 8;
const GATE_CLEAR = TILE_VOXELS / 2 + 2;

/**
 * What a person is doing, as the thing that draws them needs it: 0 walking,
 * 1 standing, 2 sitting, 3 lying.
 *
 * A number rather than a set of flags because it is written straight into an
 * instanced buffer and the shader takes it apart with arithmetic — see
 * `crowdField.ts`. **The order is load-bearing**: `figureField.ts` separates the
 * four with `min`, `max` and a subtraction rather than a branch, and walking has
 * to be the only one below 1 and lying the only one above 2.
 *
 * On a seat, sitting and lying are the *seat's* pose, not the person's. Somebody
 * the simulation holds still carries a pose of their own instead - standing in
 * a queue, or sitting and lying on the sand - because they are on no seat to
 * read one off. See {@link Crowd.holdPose}.
 */
export const RESTING = { none: 0, standing: 1, sitting: 2, lying: 3 } as const;

/**
 * How far above the ground somebody sitting on it has their hips, in voxels.
 *
 * The sitting figure swings its legs forward and down by half a leg - see
 * `SIT_RISE` in `figureField.ts` - so hips on the ground would bury the feet;
 * this keeps an adult's feet on the surface rather than in it. Exported for
 * whatever stands somebody sitting on open ground, and read here to know that
 * the ground under a sitter is where their feet are, not their hips.
 */
export const GROUND_SIT_RISE = 1.5;

export interface Crowd extends Walkers {
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

  /**
   * Node being walked to, or one of the sentinels above: out on the sand, on
   * the way to a seat, sitting on one, held still by the simulation, or sent
   * across the sand by it.
   */
  readonly node: Int32Array;
  /** Node walked in from, so a person does not turn straight back round. */
  readonly cameFrom: Int32Array;
  /** The gate a roamer came out of, and will go back in by. */
  readonly gate: Int32Array;
  /**
   * The seat each person holds, or -1. Held from the moment they set off for it
   * until they get up, so nobody sits down on somebody's lap.
   */
  readonly seat: Int32Array;
  /**
   * Who holds each seat of the network, or -1 where it is free. One entry per
   * `network.seats`, which is why it lives on the crowd rather than on the
   * network: the network is derived from the plot and never changes, and this
   * changes every time somebody stands up.
   */
  readonly seatBy: Int32Array;
  /**
   * The pose somebody the simulation holds still is drawn in, one of
   * {@link RESTING}; read only while they are held. Standing for a queue or a
   * bed, sitting or lying for somebody settled on the sand.
   */
  readonly holdPose: Uint8Array;
  /**
   * 1 for somebody who is not on the plot at all: they are held still, they are
   * not drawn, and nothing asks them anything. What a guest between check-out
   * and the next check-in is; see `sim/domain/checkIn.ts`.
   *
   * A column rather than a shrunken `count`, because a person index is a body
   * and the mesh that draws it was sized for that body when the crowd was built.
   * See `crowdField.ts`.
   */
  readonly offPlot: Uint8Array;

  /** Every draw the crowd makes, so the same seed replays the same afternoon. */
  readonly random: () => number;
  /**
   * What decides where somebody with somewhere to be walks next, or undefined
   * on a crowd nothing is routing. See {@link CrowdOptions.routeOf}.
   *
   * Beside `random` because it is the other thing injected from outside rather
   * than derived from the graph, and like everything else that is not named
   * after it, `reseatCrowd` carries it across an edit for free: the spread keeps
   * it, and the router is rebuilt on the same graph the crowd is put back on.
   */
  readonly routeOf: ((person: number, at: number) => number) | undefined;
  /**
   * Whether somebody has somewhere to be and so no business on the sand, or
   * undefined on a crowd nothing is routing. See {@link CrowdOptions.offTheSand}.
   */
  readonly offTheSand: ((person: number) => boolean) | undefined;
  /** Whether people wander the beach on their own. See {@link CrowdOptions.roamsBeach}. */
  readonly roamsBeach: boolean;
}

export interface CrowdOptions {
  readonly network: WalkNetwork;
  /** How many people to put on the plot. */
  readonly count: number;
  /** How many person models the scene has to draw them with. */
  readonly variants: number;
  readonly seed: number;
  /**
   * Which person model each walker is drawn with, when something else has
   * decided - the guest registry, so that a child is drawn as a child. Omit it
   * and the crowd draws its own at random, which is what a fixture wants.
   */
  readonly variantOf?: (index: number) => number;
  /**
   * Where a person should walk from the node they have just reached, when
   * something above the crowd has an opinion: the node to aim at, or -1 to
   * wander as usual.
   *
   * Injected for the reason {@link CrowdOptions.variantOf} is. What a guest
   * wants and which bakery serves it are facts about the simulation, and this
   * file is about walking; a crowd handed no router walks exactly as it did
   * before there was one, which is what every fixture in `crowd.test.ts` wants.
   */
  readonly routeOf?: (person: number, at: number) => number;
  /**
   * Whether a person has somewhere to be, so the beach should give them up:
   * they do not step off the paving onto it, a roamer heads for the nearest
   * gate, and a sunbather gets up.
   *
   * The other half of {@link CrowdOptions.routeOf}, and needed for the reason
   * that one cannot do the job: a router is asked at a node, and the sand has
   * none, so somebody out on the beach was never asked anything - they roamed
   * on all night. What counts as somewhere to be is the router's business; see
   * `Router.offTheSand`. Omit it and the beach is roamed exactly as it was.
   */
  readonly offTheSand?: (person: number) => boolean;
  /**
   * Whether people wander the beach on their own: spawned on it, stepping onto
   * it by chance at a gate, and roaming spot to spot. Omit it and they do, which
   * is every fixture and the replay the benchmark depends on. A crowd whose
   * simulation sends people to the beach on purpose passes false, and anybody
   * who still finds themselves roaming walks back to the paving.
   */
  readonly roamsBeach?: boolean;
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
    // The draw happens either way, even when it is thrown away: the generator is
    // the same sequence for the whole crowd, and skipping a draw for some people
    // would shift every number after it - which is a different afternoon, and a
    // different benchmark. See the note on seeding at the top of this file.
    const drawn = Math.min(variants - 1, Math.floor(random() * variants));
    crowd.variant[i] = options.variantOf
      ? Math.min(variants - 1, Math.max(0, Math.floor(options.variantOf(i))))
      : drawn;
    crowd.phase[i] = random() * Math.PI * 2;
    crowd.speed[i] = WALK_SPEED * (1 + (random() * 2 - 1) * SPEED_SPREAD);
    crowd.cameFrom[i] = -1;
    crowd.gate[i] = -1;

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
    // Spread the crowd along their edges rather than standing every one of them
    // on a node: two hundred people all starting at a tile centre set off in
    // formation and stay in it for a while.
    crowd.t[i] = random();
    place(crowd, i);
  }

  return crowd;
}

/**
 * The same people, on a graph that has been rebuilt underneath them.
 *
 * Called when something is built or taken away, which changes what is paved and
 * so changes every node index there is. Five of the crowd's columns are indices
 * into the network — `node`, `cameFrom`, `gate`, `seat` and `seatBy` — and all
 * five are meaningless afterwards. Everything else is about the person rather
 * than about the graph: where they are, which way they face, how fast they walk,
 * which model they are drawn as, and from plan 014 who they are. Those are
 * carried across untouched, which is the whole point — putting a bench down must
 * not cost the resort its guests.
 *
 * A new `Crowd` value rather than a mutation, because `network` is readonly and
 * should be: the arrays are reused, so this allocates one object and one
 * `seatBy`, not a crowd.
 *
 * **Everybody gives up their seat.** A seat index names a seat of the old
 * network, and the object it was on may not be standing any more. Somebody sat
 * on a bench that is still there stands up and may sit down again a moment
 * later, which is a small and very rare oddity next to the alternative of
 * somebody sitting on a bench that was demolished.
 *
 * **Whoever is out on the sand stays there**, when the new network still has a
 * beach and a gate to go back in by: a roamer, and a sunbather getting up off a
 * lounger, which hangs off no node. An edit does not move the beach, so where
 * they stand is still somewhere to stand, and snapping them to the nearest node
 * would march the whole beach back onto the boardwalk every time a flowerbed
 * went down. So does anybody the simulation had out on the sand - on an errand
 * over it, or held in a line on it - who carries on as a roamer: the router's
 * record of where they were going is thrown away on a rebuild. Everybody else
 * is walked from where they are to the node nearest them, and carries on from
 * there.
 *
 * **Whoever is off the plot stays off it**, untouched: they are a body waiting
 * for whoever checks in next, and the point they are held at means nothing to
 * anybody. See {@link Crowd.offPlot}.
 *
 * A network with no edges — every path taken up — hands back a crowd with
 * `count` 0. Nobody is drawn and nobody is stepped, and paving one tile brings
 * everybody back, because capacity and every column were kept.
 */
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
    // Off the plot stays off it. Every column below is about where somebody is
    // walking, and a body waiting for whoever checks in next is walking nowhere:
    // re-anchoring them would stand every checked-out guest back on the paving,
    // in the middle of the promenade, the first time anything was built.
    if (crowd.offPlot[i] === 1) continue;
    const seat = crowd.seat[i]!;
    const lounging = seat >= 0 && previous.seats[seat]?.node === OFF_THE_GRAPH;
    crowd.seat[i] = -1;
    // The start of a segment is the point on their *line*, and they may be
    // stood aside of it: the same undoing `standOnLine` does, from where they
    // actually are rather than from where their old segment began.
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
    // Somebody held in a queue or inside a venue is re-anchored like any other
    // walker, with no branch of their own: the simulation's own record of who
    // is where is thrown away on a rebuild too. See `sim/domain/router.ts`.
    aim(reseated, i, nearestNodeTo(network, index, crowd.x[i]!, crowd.z[i]!, TILE_VOXELS));
  }
  crowd.seat.fill(-1, count);
  return reseated;
}

/**
 * Moves the whole crowd on by `dt` seconds.
 *
 * The loop is the feature: an add, a compare, and three lerps per person, with
 * the arrival branch taken by whoever happens to have reached the end of their
 * segment. Nothing here allocates and nothing here asks the terrain anything.
 *
 * Getting past each other comes first, as one pass of its own: it decides how
 * far aside everybody is and how fast they are going, and the loop below then
 * spends both as a multiply and an offset. See `avoidance.ts`.
 *
 * ## A long step is several short ones
 *
 * `dt` may be many times {@link MAX_STEP} - the crowd walks faster than real
 * time when the calendar does, see `sim/domain/crowdRate.ts` - and it is run as
 * that many whole steps of `MAX_STEP`, then the remainder. Whole steps rather
 * than an even split, so a crowd stepped once by `n * MAX_STEP` is the same crowd
 * as one stepped `n` times by `MAX_STEP`.
 *
 * **Avoidance runs once per step, not once per call.** Steering once and then
 * moving everybody several times looks like the free half of the saving and is
 * not: a sidestep decided for where somebody was three steps ago is somebody
 * walking through the person who has since arrived in front of them.
 */
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

/** One step of at most {@link MAX_STEP}: steer, then move everybody along. */
function integrate(crowd: Crowd, step: number): void {
  steerWalkers(crowd, step, crowd.network.sand);
  for (let i = 0; i < crowd.count; i++) {
    crowd.t[i]! += crowd.rate[i]! * crowd.pace[i]! * step;
    if (crowd.t[i]! >= 1) arrive(crowd, i);
    place(crowd, i);
  }
}

/**
 * Writes a person's position from the segment they are on, stood `side` voxels
 * to the right of it.
 */
function place(crowd: Crowd, i: number): void {
  const t = crowd.t[i]!;
  const side = crowd.side[i]!;
  crowd.x[i] = crowd.fromX[i]! + (crowd.toX[i]! - crowd.fromX[i]!) * t + crowd.dirZ[i]! * side;
  crowd.y[i] = crowd.fromY[i]! + (crowd.toY[i]! - crowd.fromY[i]!) * t;
  crowd.z[i] = crowd.fromZ[i]! + (crowd.toZ[i]! - crowd.fromZ[i]!) * t - crowd.dirX[i]! * side;
}

/** Whether a point on the sand is inside something standing there. */
function inObstacle(network: WalkNetwork, point: { readonly x: number; readonly z: number }) {
  return network.sand !== null && blockedAt(network.sand, point.x, point.z);
}

/**
 * What happens when someone reaches the end of their segment.
 *
 * Which one applies is entirely a question of what they were doing: out on the
 * sand, on their way to a seat, sitting on one, or walking the graph. The
 * leftover `t` is carried into the next segment rather than dropped, so a very
 * short edge taken at speed does not cost a frame of standing still — and so a
 * sit that ends mid-frame does not either.
 */
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

  // Rounding on a very short segment can leave this at or past 1 again, which
  // would arrive twice in one frame; a fraction of the new segment is close
  // enough and cannot loop.
  crowd.t[i] = Math.min(leftover, 0.99);
}

/**
 * Reaching a node of the graph, and what a person does next there: step off
 * onto the sand, sit down on something beside it, or walk on.
 *
 * The three are tried in that order and only one of them happens. The sand is
 * first because it is the rarer roll and a boardwalk tile is hardly ever a
 * bench tile too; walking on is what is left, which is what makes it the case
 * that needs no chance of its own.
 */
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
    // The onward pick reads `cameFrom` to know what turning back would be, so
    // it has to happen before this arrival becomes the node walked in from.
    const onward = nextNode(crowd, i, arrived);
    // Somebody the router stood still at this node, or sent out onto the sand,
    // is already on their way, and has no way they came worth remembering:
    // aiming them anywhere would walk them straight out of the queue they have
    // just joined.
    if (onward === HELD) return;
    aim(crowd, i, onward);
  }
  crowd.cameFrom[i] = arrived;
}

/**
 * Whether somebody arriving at a node steps off it onto the sand by chance.
 *
 * Only at a gate, and never for somebody with somewhere to be - who is asked
 * first, so they cost no draw: the sand is not a choice they have.
 */
function strollsOntoSand(crowd: Crowd, i: number, node: WalkNode): boolean {
  if (!crowd.roamsBeach || !node.gate || !crowd.network.beach || crowd.offTheSand?.(i)) {
    return false;
  }
  return crowd.random() < ONTO_SAND;
}

/**
 * Sends somebody at a gate out onto the sand, as a roamer who will go back in
 * by that gate: a router's way of turning somebody loose on the beach. The
 * resort's own router settles people on it instead - see `sim/domain/router.ts`.
 *
 * Called from inside `routeOf`, while the crowd is asking where they go next,
 * which is why `nextNode` checks for a roamer after asking: they are already on
 * their way, and aiming them at a node would walk them straight back off it.
 * Does nothing at a node that is not a gate, or on a plot with no beach.
 */
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

/**
 * A roamer reaching the spot they picked: a lounger, the way back in, or
 * another spot on the sand.
 *
 * The lounger is tried first and the gate second, which is the order the two
 * chances read best in — somebody who has just walked up to a free lounger
 * takes it rather than turning round and going home.
 */
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
    // Aiming at the gate node puts them back on the graph the moment they get
    // there: arrival at a node is arrival at a node, whatever they crossed to
    // reach it. The walk there is still over sand, so they step aside the way a
    // roamer does.
    aim(crowd, i, crowd.gate[i]!);
    crowd.lane[i] = LANE.sand;
    return;
  }
  roamTo(crowd, i);
}

/**
 * Whether a roamer heads back to the paving now rather than roaming on.
 *
 * A crowd that does not roam the beach has only strays out there - somebody an
 * edit or a forgotten errand left on the sand - and they make for the paving at
 * once, before anything is drawn for them. In one that does, a roamer with
 * somewhere to be does.
 */
function makesForThePaving(crowd: Crowd, i: number): boolean {
  return !crowd.roamsBeach || crowd.offTheSand?.(i) === true;
}

/**
 * The end of the walk somebody has just finished on the sand, as the start of
 * whatever they do next: a roamer reaching their spot, or somebody on an errand
 * reaching the point they were sent to.
 */
function standAtTheEnd(crowd: Crowd, i: number): void {
  crowd.fromX[i] = crowd.toX[i]!;
  crowd.fromY[i] = crowd.toY[i]!;
  crowd.fromZ[i] = crowd.toZ[i]!;
  standOnLine(crowd, i);
}

/**
 * Makes where a person is actually standing the start of their next segment,
 * with no sidestep left over.
 *
 * Called with `from` at the end of the segment they walked, which is where
 * their *line* ended rather than where they are if they were stood aside of it.
 * On the sand that difference matters: the walk onward is checked for obstacles
 * from `from`, and a check made from a point a few voxels off the person is a
 * check of a walk they will not take.
 */
function standOnLine(crowd: Crowd, i: number): void {
  const side = crowd.side[i]!;
  crowd.fromX[i]! += crowd.dirZ[i]! * side;
  crowd.fromZ[i]! -= crowd.dirX[i]! * side;
  crowd.side[i] = 0;
}

/**
 * A roamer with somewhere to be, making for the paving: straight to the nearest
 * gate within reach, or a hop along the sand towards the nearest gate of all.
 *
 * "Within reach" is {@link SEAT_COLUMNS}, and for the lounger's reason: the
 * walk is a straight line and the coast wanders, so a gate picked from the whole
 * beach could have a bay between it and the person walking to it. A roamer too
 * far from any gate hops the ordinary way, but of the spots they could hop to
 * takes the one nearest that gate, so a few hops bring one in reach.
 *
 * The gate they came out of is forgotten: somebody spawned on the sand was
 * given one anywhere on the plot, and walking the length of the beach to it is
 * no way to get home.
 */
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

/**
 * Gets up everybody lying on the sand who has somewhere to be.
 *
 * A sunbather is on no node and is not arriving anywhere, so nothing else would
 * ask them until their lie was over - which at the clock's pace can be a couple
 * of simulated hours of lying in the dark. Their rest is ended rather than cut
 * short by hand: `t` at 1 is the ordinary arrival branch standing them up on the
 * next step, onto the sand, where {@link leaveTheSand} takes them in.
 *
 * A scan of the loungers rather than of the crowd, because there are a few dozen
 * of them. Called once a simulated minute by whatever runs the clock.
 */
export function rouseSunbathers(crowd: Crowd): void {
  const wanted = crowd.offTheSand;
  if (!wanted) return;
  for (const seat of crowd.network.beachSeats) {
    const person = crowd.seatBy[seat]!;
    if (person < 0 || person >= crowd.count) continue;
    if (crowd.node[person] === SEATED && wanted(person)) crowd.t[person] = 1;
  }
}

/** Whether the straight walk from where a roamer stands to a node is clear. */
function clearTo(crowd: Crowd, i: number, node: number): boolean {
  const sand = crowd.network.sand;
  if (!sand) return true;
  const target = crowd.network.nodes[node]!;
  return clearLine(sand, crowd.fromX[i]!, crowd.fromZ[i]!, target.x, target.z, 0, GATE_CLEAR);
}

/**
 * Sends a roamer to a fresh point on the open sand that nothing stands on, and
 * that nothing stands between them and.
 *
 * `skipStart` is how far from where they stand obstacles are not asked about:
 * somebody getting up from a lounger is inside its box. A roamer with nowhere
 * clear to go stands still for {@link PAUSE_SECONDS} and tries again, which is a
 * zero-length segment like a sit and so costs the per-frame loop nothing.
 *
 * `towardX`, when given, is where they would rather be: every try is still
 * drawn and checked as usual, and of the ones that are clear the one nearest it
 * is taken. The draws are the same number either way.
 */
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

/**
 * Draws up to {@link ROAM_TRIES} spots near a roamer and sets them walking to
 * one that is clear: the first, or with `towardX` the one of them nearest it.
 * Hands back whether any was.
 */
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

/** Whether a spot on the sand is free, and the straight walk to it from a roamer is too. */
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

/** Whether a person is resting on a seat rather than walking. */
export function isSeated(crowd: Crowd, i: number): boolean {
  return crowd.node[i] === SEATED;
}

/**
 * Whether a person is out on the sand, off the walk graph.
 *
 * A predicate rather than the sentinel exported, so that nothing outside this
 * file can compare the wrong column against it.
 */
export function isRoaming(crowd: Crowd, i: number): boolean {
  return crowd.node[i] === ROAMING;
}

/**
 * Stands somebody still at a point until something lets them go.
 *
 * The same segment trick sitting down uses, with a rate of zero: `t` never
 * reaches 1, so the arrival branch never fires and nothing releases them but
 * {@link releaseTo}. `LANE.none` keeps avoidance from sliding them off the
 * spot, which is exactly what that lane is for - see `avoidance.ts`.
 *
 * Whatever this file knows about *why* somebody is standing there is nothing:
 * the caller is `sim/domain/router.ts`, and a queue at a bakery door and a
 * guest inside one arrive here as the same three numbers.
 */
export function holdAt(
  crowd: Crowd,
  i: number,
  x: number,
  y: number,
  z: number,
  heading: number,
  pose: number = RESTING.standing,
): void {
  // A seat is claimed from the moment somebody sets off for it, so anybody
  // taken in hand on the way to one has to let go of it or nobody else ever
  // sits there.
  giveUpSeat(crowd, i);
  standStill(crowd, i, x, y, z, heading, pose);
}

/**
 * Takes somebody off the plot: stood still where they are, and not drawn.
 *
 * Their columns are kept, because the body is going to be used again by whoever
 * checks in next. See {@link Crowd.offPlot}.
 *
 * As ignorant as {@link holdAt} of *why*: the caller is `sim/domain/router.ts`
 * walking a guest out of the gate at the end of a stay, and what arrives here is
 * a person index and a point.
 */
export function takeOffPlot(crowd: Crowd, i: number, x: number, y: number, z: number): void {
  if (i < 0 || i >= crowd.capacity) return;
  holdAt(crowd, i, x, y, z, crowd.heading[i] ?? 0);
  crowd.offPlot[i] = 1;
}

/**
 * Puts somebody back on the plot at a node, walking from it as anybody released
 * from a visit does.
 *
 * The flag is cleared **first**: {@link releaseTo} decides from where they are
 * standing whether they are coming off the sand, and a body that is still off
 * the plot has no business being asked anything.
 */
export function putOnPlot(crowd: Crowd, i: number, node: number): void {
  if (i < 0 || i >= crowd.capacity) return;
  crowd.offPlot[i] = 0;
  releaseTo(crowd, i, node);
}

/** Whether this body is holding nobody: see {@link Crowd.offPlot}. */
export function isOffPlot(crowd: Crowd, i: number): boolean {
  return crowd.offPlot[i] === 1;
}

/**
 * Lies somebody on a lounger - or sits them on whatever seat it is - until the
 * simulation lets them go: the venue-free way to settle a guest on the beach's
 * furniture rather than beside it.
 *
 * The seat is claimed as a roamer's is, so nobody else sets off for it, and it
 * stays claimed for as long as they are held. {@link releaseTo},
 * {@link walkSandTo} and {@link holdAt} each give it up.
 *
 * Refuses, changing nothing, for a seat the network does not have or one
 * somebody else holds; hands back whether they are on it.
 */
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

/** Whether nobody holds a seat of the network, or is on their way to it. */
export function seatIsFree(crowd: Crowd, seat: number): boolean {
  return crowd.seatBy[seat] === -1;
}

/** The hold itself, for {@link holdAt} and {@link holdOnSeat}: a segment of rate zero. */
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
  // Where they are drawn, now rather than on the next frame's `place`: a person
  // stood somewhere by the simulation is somewhere, and the caller reads it
  // back to decide what to do about them.
  crowd.x[i] = x;
  crowd.y[i] = y;
  crowd.z[i] = z;
}

/**
 * Sends somebody who was held on their way to a node of the graph.
 *
 * `cameFrom` is cleared because a held person has no meaningful way they came:
 * they have been standing at a door, and the rule it exists for - do not turn
 * straight back round - is about a walk that was interrupted rather than one
 * that ended. `aim` puts them back in {@link LANE.paved} itself.
 *
 * **Somebody let go out on the sand walks to the node over sand**, and steps
 * aside the way a roamer does, exactly as a roamer heading for their gate. That
 * is decided here from where they stand - on an errand over the sand, or held
 * at the sand's own height - rather than told: this file knows what the ground
 * is, and nothing about why they were there.
 */
export function releaseTo(crowd: Crowd, i: number, node: number): void {
  // Somebody held on a lounger holds it; nobody else on the way out does.
  giveUpSeat(crowd, i);
  const fromSand = crowd.node[i] === ERRAND || (crowd.node[i] === HELD && standsOnSand(crowd, i));
  stopPartWay(crowd, i);
  crowd.cameFrom[i] = -1;
  aim(crowd, i, node);
  if (fromSand) crowd.lane[i] = LANE.sand;
}

/**
 * Sends somebody off the graph to a point on the sand, and has the crowd say so
 * when they get there: `routeOf` is asked with {@link ON_SAND} rather than a
 * node.
 *
 * The other half of {@link holdAt}, and as ignorant as it is: the caller is
 * `sim/domain/router.ts` walking a guest over the beach to a building on it,
 * one waypoint at a time, and what arrives here is a point. Whether the walk is
 * clear is the caller's business too - see `sim/domain/sandRoute.ts`.
 *
 * On arrival the router may send them on to the next point, stand them still,
 * or let them back onto the graph. **If it does none of those** - it was
 * rebuilt and has forgotten them - they become an ordinary roamer, with the
 * nearest gate as their way back in, rather than stand on the last point for
 * ever.
 *
 * The walk starts where their segment does, which for every caller is where
 * they are: the node they have just arrived at, the point they have just
 * reached, or the spot they were held on. Does nothing on a plot with no beach.
 */
export function walkSandTo(crowd: Crowd, i: number, x: number, z: number): void {
  if (!crowd.network.beach) return;
  // A seat is claimed from the moment somebody sets off for it; see `holdAt`.
  giveUpSeat(crowd, i);
  stopPartWay(crowd, i);
  crowd.node[i] = ERRAND;
  crowd.lane[i] = LANE.sand;
  segment(crowd, i, x, BEACH_SURFACE, z);
}

/**
 * Makes the point somebody has got to on their line the start of whatever they
 * are sent on to, when they are sent part-way along a walk.
 *
 * Every other caller sends people on from the end of a segment - a node, a
 * waypoint, the spot they were held on - where `from` is already right. Turned
 * back half-way across the sand, `from` is where the walk began, and the new
 * segment starting there is a jump back across the beach.
 */
function stopPartWay(crowd: Crowd, i: number): void {
  const t = crowd.t[i]!;
  if (!(crowd.rate[i]! > 0) || !(t > 0 && t < 1)) return;
  crowd.fromX[i]! += (crowd.toX[i]! - crowd.fromX[i]!) * t;
  crowd.fromY[i]! += (crowd.toY[i]! - crowd.fromY[i]!) * t;
  crowd.fromZ[i]! += (crowd.toZ[i]! - crowd.fromZ[i]!) * t;
  crowd.t[i] = 0;
}

/**
 * Reaching a point {@link walkSandTo} sent somebody to, and asking the router
 * what next.
 *
 * Nothing is drawn from `random` unless the router has let go of them: a draw
 * for somebody the router is steering would move everybody else's afternoon,
 * which is the rule `nextNode` keeps for a held person. Whether it acted is
 * read off `t` - every one of its answers starts a new segment, which starts
 * `t` again, and nothing else does.
 */
function runErrand(crowd: Crowd, i: number): void {
  standAtTheEnd(crowd, i);
  crowd.routeOf?.(i, ON_SAND);
  if (crowd.t[i]! < 1) return;
  crowd.gate[i] = nearestGate(crowd.network, crowd.fromX[i]!, crowd.fromZ[i]!);
  crowd.node[i] = ROAMING;
  roamTo(crowd, i);
}

/** The gate nearest a point in a straight line, or -1 on a plot with none. */
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

/**
 * Whether somebody is standing on the beach's own surface rather than on paving:
 * their feet, which for somebody held sitting on the ground are a sitter's rise
 * below their hips.
 */
function standsOnSand(crowd: Crowd, i: number): boolean {
  const sitting = crowd.node[i] === HELD && crowd.holdPose[i] === RESTING.sitting;
  const feet = crowd.y[i]! - (sitting ? GROUND_SIT_RISE : 0);
  return crowd.network.beach !== null && Math.abs(feet - BEACH_SURFACE) < ON_SAND_TOLERANCE;
}

/**
 * Whether somebody is out on the sand in a way an edit should leave them there:
 * roaming, on an errand, or held on the sand's surface. See `reseatCrowd`.
 */
function outOnSand(crowd: Crowd, i: number): boolean {
  const node = crowd.node[i];
  return node === ROAMING || node === ERRAND || (node === HELD && standsOnSand(crowd, i));
}

/** Whether this person is standing where the simulation put them. */
export function isWaiting(crowd: Crowd, i: number): boolean {
  return i < crowd.count && crowd.node[i] === HELD;
}

/**
 * What a person is doing, as {@link RESTING} numbers it: the seat's pose for
 * somebody on a seat, the pose they were held in for somebody the simulation
 * holds still, and walking otherwise.
 */
export function restingOn(crowd: Crowd, i: number): number {
  if (crowd.node[i] === HELD) return crowd.holdPose[i]!;
  if (crowd.node[i] !== SEATED) return RESTING.none;
  return crowd.network.seats[crowd.seat[i]!]!.pose === 'lie' ? RESTING.lying : RESTING.sitting;
}

/**
 * A free lounger within reach of where a roamer stands, or -1.
 *
 * A scan rather than a lookup, and it can be: the list is the loungers on the
 * plot, the window is {@link SEAT_COLUMNS} wide, and this runs once every few
 * seconds per roamer rather than once per frame per person. Indexing the beach
 * by column would be a structure to build and keep for a loop that is already
 * far cheaper than the walk it interrupts.
 */
function nearbyBeachSeat(crowd: Crowd, i: number): number {
  const reach = SEAT_COLUMNS * TILE_VOXELS;
  const x = crowd.fromX[i]!;
  const z = crowd.fromZ[i]!;
  const sand = crowd.network.sand;
  for (const seat of crowd.network.beachSeats) {
    if (crowd.seatBy[seat] !== -1) continue;
    const spot = crowd.network.seats[seat]!;
    if (Math.abs(spot.x - x) > reach) continue;
    // One whose way in is blocked by the next lounger along is passed over for
    // one that is not, rather than walked to through it.
    if (sand && !clearLine(sand, x, z, spot.x, spot.z, 0, SEAT_CLEAR)) continue;
    return seat;
  }
  return -1;
}

/** The first free seat beside a node, or -1 when they are all taken. */
function freeSeat(crowd: Crowd, node: WalkNode): number {
  for (const seat of node.seats) {
    if (crowd.seatBy[seat] === -1) return seat;
  }
  return -1;
}

/**
 * Claims a seat and sets off for it.
 *
 * Claimed now rather than on arrival, which is the one rule that keeps two
 * people off one plank: the walk from the path to the seat takes a second or
 * two, and anybody arriving at the node in the meantime would otherwise see it
 * free and set off for the same voxel.
 */
function takeSeat(crowd: Crowd, i: number, seat: number): void {
  const spot = crowd.network.seats[seat]!;
  crowd.seat[i] = seat;
  crowd.seatBy[seat] = i;
  crowd.node[i] = TO_SEAT;
  crowd.lane[i] = LANE.seat;
  segment(crowd, i, spot.x, spot.y, spot.z);
}

/**
 * Arriving at the seat: the walk becomes a rest.
 *
 * Written out rather than handed to {@link segment}, because the two things
 * that function works out are exactly the two this case has to decide for
 * itself. A zero-length segment would be given a rate that ends it next frame,
 * where a sit's rate is how long the sit lasts; and it would keep the heading
 * of the last step taken, where a sitter faces the way the *seat* faces —
 * out over the front of the bench, not back up the path they came down.
 */
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
  // Eased back to the line on the way over; whatever is left of it goes, so a
  // sitter is exactly on the plank.
  crowd.lane[i] = LANE.none;
  crowd.side[i] = 0;
  crowd.pace[i] = 1;
  const rest = spot.pose === 'lie' ? LIE_SECONDS : SIT_SECONDS;
  crowd.rate[i] = 1 / (rest.min + crowd.random() * (rest.max - rest.min));
}

/**
 * The rest is over: the seat is given up and the walk starts again.
 *
 * Where they go is where they came from, which the seat itself says: back to
 * the node it hangs off, or back out onto the sand for a lounger, which hangs
 * off none. Both are one line because leaving a seat is the arrival that
 * brought them to it, run backwards.
 */
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
  // Back to the node the seat hangs off, which is the paving they left: from
  // there they are on the graph again and the onward pick takes over.
  aim(crowd, i, spot.node);
}

/**
 * Frees whatever seat a person is holding, if they hold one.
 *
 * A seat is claimed from the moment somebody sets off for it, so this is the
 * one undo for both halves of that - getting up off a bench, and being taken in
 * hand by a venue on the way to one.
 */
function giveUpSeat(crowd: Crowd, i: number): void {
  const seat = crowd.seat[i]!;
  if (seat < 0) return;
  crowd.seatBy[seat] = -1;
  crowd.seat[i] = -1;
}

/**
 * Which node a person walks to next: where they are going, a wander, or
 * {@link HELD} when the answer is that they are not walking anywhere at all.
 *
 * The first two are kept apart because they are two different rules and only
 * one of them was ever here. See {@link wanderFrom}, which is the rule this
 * file had before anything was routing anybody and which is what a crowd with
 * no router still does, to the voxel.
 */
function nextNode(crowd: Crowd, i: number, at: number): number {
  const node = crowd.network.nodes[at]!;
  // Every adjacency is stored in both directions, so a node somebody walked to
  // always has at least the way back out of it. An isolated paved tile has none,
  // and nobody can have arrived at one.
  if (node.exits.length === 0) return at;

  // Somewhere to be beats wandering, and doubling back towards it is correct
  // where wandering would refuse to: a guest who has walked past the bakery
  // turns round. The router hands back -1 for anybody with nowhere to be, which
  // is everybody on a plot with no venues on it.
  //
  // What it hands back is not checked against `exits`. A flow field only ever
  // names a neighbour, and a check here would be a scan of the exits on every
  // arrival on the plot, to defend against a bug in another module. The one
  // guard that is worth it is here: a router naming the node somebody is
  // standing on would pin them there for ever on a zero-length segment.
  const routed = crowd.routeOf?.(i, at) ?? -1;
  // Asking where somebody goes next can be answered by standing them still: a
  // router takes a guest in hand at a venue's door and puts them in the line or
  // inside. They are placed already, so there is nothing to aim - and the
  // wander below must not be reached for them either, because a draw made for
  // somebody who is not walking would move everybody else's afternoon. The same
  // goes for somebody the router has just sent out onto the sand, roaming or on
  // an errand. Before asking, `node` was the node they arrived at, so anything
  // below zero now is one of those three.
  if (crowd.node[i]! < 0) return HELD;
  if (routed >= 0 && routed !== at) return routed;

  return wanderFrom(crowd, i, node);
}

/**
 * Where somebody with nowhere to be goes from a node.
 *
 * Anything but straight back the way they came, unless that is the only way out
 * — which is a dead-end spur, and turning round is the only thing to do on one.
 * Counting the candidates and then taking the n-th keeps this allocation-free,
 * which matters because it runs on every arrival.
 */
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

/** Starts a person on the segment from where they stand to a node. */
function aim(crowd: Crowd, i: number, node: number): void {
  const target = crowd.network.nodes[node]!;
  crowd.node[i] = node;
  crowd.lane[i] = LANE.paved;
  segment(crowd, i, target.x, target.y, target.z);
}

/**
 * Starts a person on a segment to a point, working out the things that only
 * change when a segment does: how fast `t` runs, which way they face, and the
 * direction their sidestep is measured across.
 *
 * Somebody walking aside of their line keeps walking aside of the new one, so
 * the start of the new segment is moved by the difference between the old
 * sideways and the new: without it a person keeping right would jump across the
 * path at every corner.
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
