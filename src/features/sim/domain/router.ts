/**
 * What joins wanting something to walking towards it, and to waiting for it.
 *
 * `chooseVenue.ts` says where a guest would go, `flowField.ts` says which way
 * that is from here, and `occupancy.ts` says whether there is room when they
 * get there; this is the one module that holds all three, and it is the only
 * thing the crowd ever calls. Everything about needs and venues stops at this
 * boundary: `crowd.ts` is handed a function of `(person, node) -> node` and a
 * pair of "stand here" / "off you go" calls, and does not learn what a bakery
 * is. See `CrowdOptions.routeOf` and `holdAt`.
 *
 * ## One field per venue, built on the first guest who walks there
 *
 * `plans/README.md`'s decision 2 originally said one field per *need kind*.
 * Plan 017 kept the mechanism and moved the sources, because a per-need field
 * routes everybody to the nearest venue serving that need - and `chooseVenue`
 * exists precisely to weigh a good venue further off against a weak one nearby.
 * A field per need would compute that choice and then ignore it.
 *
 * The cost that argued for per-need fields is not there: one sweep of the
 * reference plot's 2 260 nodes measures 0.47 ms, and eighty of them 5.82 ms. See
 * the ceiling in `flowField.test.ts`. Built lazily, a venue nobody walks to
 * costs nothing at all.
 *
 * ## A visit takes time, and the relief comes at the end of it
 *
 * Arriving at a door is the *start* of a visit, not the whole of it. The guest
 * is stood still - inside if there is room, in the line if there is not - and
 * `relieve` is applied when they come out again, {@link Router.tick} ticks
 * later. A guest who queued twenty minutes is fed twenty minutes later, which
 * is the number plan 020 turns into unhappiness.
 *
 * ## The line runs back along the paving, and is only as long as the paving
 *
 * Each venue's queue lane is laid beside its flow field, from the same doors and
 * at the same moment - see `queueLane.ts`. A lane that runs out of graph is a
 * shorter queue: a venue at the end of a two-tile spur takes a line of two, and
 * the third guest balks. The same length is what `chooseVenue` is handed, so a
 * guest never crosses the plot for a line that will refuse them.
 *
 * ## At night everybody with a bed goes to it
 *
 * Bedtime comes before any venue: a guest whose party's bedtime it is walks
 * home instead, on a field whose sources are their lodging's doors, and is held
 * in the middle of it until their wake tick. `plans/README.md`'s decision 2
 * called going home the case for a cached per-party route; a field memoised per
 * *lodging* is that cache, shared by every party under the same roof rather
 * than worked out per party, which is strictly less work - parties in the same
 * hotel walk to the same door. See `night.ts` for when, and `lodgings.ts` for
 * why a lodging is never a venue.
 *
 * ## A building on the beach is reached over the sand
 *
 * Nothing standing on sand is paved to, so a beach shower has no door node and
 * no field could ever be swept from one. Its doors are points on the open sand
 * instead - see `doors.ts` - and `sandRoute.ts` finds, once and lazily, a route
 * over beach tiles from each gate that can reach one. The field is swept from
 * those gates, so a guest walks the graph to a gate exactly as they walk to any
 * door; at the gate the router walks them the sand leg a waypoint at a time,
 * through `walkSandTo` and the crowd asking again with `ON_SAND` on arrival,
 * and at the end of it they arrive as they would at a door - inside, or in a
 * line laid straight out across the sand (`sandLaneFor`). The visit over, they
 * walk the same route back and are let onto the graph at the gate they left it
 * by. The crowd learns two calls and nothing about why.
 *
 * ## Everything is thrown away when the graph is
 *
 * A node index means nothing across a rebuild, so {@link Router.rebuild} drops
 * the fields, the lanes, the sand routes, the goals, the occupancy and who is
 * asleep together. A field kept across an edit
 * is the one bug this design can have, and it shows up as guests walking
 * confidently into a wall.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  holdAt,
  ON_SAND,
  releaseTo,
  rouseSunbathers,
  stepOntoSand,
  walkSandTo,
  type Crowd,
} from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { homeOf, type Guests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { chooseVenue } from './chooseVenue';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import {
  clearAllGoals,
  clearPartyGoal,
  createGoals,
  NO_GOAL,
  setPartyGoal,
  type Goals,
} from './goals';
import { lodgingFor, type Lodging } from './lodgings';
import { relieve, type Needs } from './needs';
import { isBedtime, NIGHT_RELIEF } from './night';
import { beachVenueFor, isBeach } from './beach';
import {
  arriveAt,
  createOccupancy,
  type ArrivalOutcome,
  leaveVenue,
  sweepOccupancy,
  VISIT,
  type Occupancy,
} from './occupancy';
import { MAX_QUEUE_SHOWN, queueLaneFor, sandLaneFor, type QueueSpot } from './queueLane';
import { sandRoutesFor, type SandRoute } from './sandRoute';
import { TICKS_PER_DAY } from './simClock';
import type { Venue } from './venues';

/**
 * Simulated seconds one tick covers: a tick is a simulated minute, which is
 * `simClock.ts`'s own `TICK_SIM_SECONDS`. Named again here rather than imported,
 * because that one is private to the clock and turning a declared dwell into
 * ticks is this module's arithmetic rather than the calendar's.
 */
const TICK_SECONDS = 60;

/**
 * What the night answers when it has nothing to say about where somebody goes:
 * decide as by day. Apart from -1, which is an answer - "stand where you are",
 * or "wander" - rather than the absence of one.
 */
const BY_DAY = -2;

/**
 * How far over the beach a building standing on it is looked for from a gate,
 * in tile steps. The furthest a beach building on the reference plot stands
 * from its nearest gate is 448 voxels, 28 tiles in a straight line; forty
 * leaves room for the way round whatever stands between.
 */
const SAND_ROUTE_TILES = 40;

/**
 * Who is walking a sand leg, and how far along it, one column each: the venue
 * whose route it is or -1, which of its routes, the waypoint being walked to,
 * and 1 on the way back to the gate rather than out to the door.
 */
interface Errands {
  readonly venue: Int32Array;
  readonly route: Int32Array;
  readonly leg: Int32Array;
  readonly back: Uint8Array;
}

const createErrands = (people: number): Errands => ({
  venue: new Int32Array(people).fill(-1),
  route: new Int32Array(people),
  leg: new Int32Array(people),
  back: new Uint8Array(people),
});

/** How many people are inside a venue and how many are in the line outside. */
export interface VenueOccupancy {
  readonly inside: number;
  readonly waiting: number;
}

/**
 * What one person is doing about a venue right now, for the inspector.
 *
 * Read once a frame for the one guest selected, so it allocates a small object
 * rather than handing back three columns; everything the simulation itself does
 * with the same facts goes through `occupancy.ts` and allocates nothing.
 */
export interface Visit {
  readonly venue: Venue;
  /** Standing in the line outside rather than in. */
  readonly waiting: boolean;
  /** Their place in that line, from 0; meaningless once they are inside. */
  readonly place: number;
}

export interface Router {
  /**
   * Where this person should walk from the node they just reached, or -1 to let
   * the crowd wander as it always has - which is also what a person who has just
   * been stood still gets, since nothing is to aim them anywhere.
   *
   * Called once per arrival per person, which is a handful of calls a frame
   * across the whole plot. Everything expensive - the fields - is memoised
   * behind it.
   *
   * `at` is `ON_SAND` rather than a node for somebody this router sent over the
   * sand, who has reached the point they were sent to; they are sent on, stood
   * still or let back onto the graph, and -1 comes back.
   */
  step(person: number, at: number): number;
  /**
   * Whether the beach should give this person up: their visit to it is over,
   * or it is their bedtime, they have a bed and they are not in it yet. The
   * crowd's `offTheSand`.
   *
   * Needed beside {@link step} because `step` is asked at a node and the sand
   * has none: without it a guest out on the beach never heard that it was night
   * and roamed until morning.
   *
   * **Not a venue goal.** Calling in everybody whose party had an errand
   * emptied the beach by the afternoon - 113 roamers at ten on the reference
   * plot became 1 by four - because nearly every party has an errand going at
   * any moment.
   */
  offTheSand(person: number): boolean;
  /**
   * One tick of every venue. Whoever is done is let go and sent on their way,
   * the front of each line goes in, and the rest of each line shuffles up a
   * place.
   */
  tick(now: number): void;
  /**
   * Throws away every field, every lane, every goal, every visit and every
   * night's sleep: the graph changed.
   */
  rebuild(venues: readonly Venue[], lodgings: readonly Lodging[], network: WalkNetwork): void;
  /** How many fields have actually been built, venues and lodgings both, for the stats readout. */
  readonly fieldCount: number;
  /** Everybody in bed right now: what the windows are lit from, and a stats row. */
  readonly asleepCount: number;
  isAsleep(person: number): boolean;
  /**
   * The lodging a person is asleep in or walking home to, or null while the
   * night has nothing to do with where they are going. Read by the inspector.
   */
  homewardTo(person: number): Lodging | null;
  /** Everybody inside anything and everybody in a line, for the stats readout. */
  readonly occupancyTotals: VenueOccupancy;
  /** The venue a person is heading for, or null. Read by the inspector. */
  goalOf(person: number): Venue | null;
  /** Who is inside and who is waiting at one venue, for the inspector. */
  occupancyOf(venueKey: string): VenueOccupancy | null;
  /** What one person is doing about a venue, or null while they are walking. */
  visitOf(person: number): Visit | null;
}

export function createRouter(parts: {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly venues: readonly Venue[];
  /** Where everybody sleeps, as it stands on the plot; see `lodgings.ts`. */
  readonly lodgings: readonly Lodging[];
  readonly network: WalkNetwork;
  /**
   * The tick of the day it is now, 0..1439, late-bound for the reason the crowd
   * is: an arrival happens between ticks, and the clock is what knows the hour.
   */
  readonly tickOfDay: () => number;
  /**
   * The crowd as it stands, late-bound: the crowd is built with the router and
   * `relocate` replaces it, so a router holding one of its own would be moving
   * the people from before the edit.
   */
  readonly crowd: () => Crowd;
  /** What the dwell of each visit is drawn from; see {@link dwellTicksFor}. */
  readonly seed: number;
}): Router {
  const { guests, needs, crowd } = parts;
  const goals: Goals = createGoals(guests.count);
  const random = createRandom(parts.seed);

  let venues = withBeach(parts.venues, parts.network);
  let lodgings = parts.lodgings;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  /** One entry per venue, filled in on the first guest who walks to that one. */
  let fields: (FlowField | null)[] = venues.map(() => null);
  /** Each venue's queue lane, laid when its field is and dropped with it. */
  let lanes: (readonly QueueSpot[] | null)[] = venues.map(() => null);
  /**
   * Each venue's routes over the sand, laid when its field is and dropped with
   * it: empty for everything but a building on the beach no paving reaches.
   */
  let sandRoutes: (readonly SandRoute[] | null)[] = venues.map(() => null);
  let errands = createErrands(guests.count);
  /** One entry per lodging, filled in on the first guest who walks home to it. */
  let homeFields: (FlowField | null)[] = lodgings.map(() => null);
  let built = 0;
  /**
   * Which lodging each person sleeps in, or -1: their `Home` looked up once
   * rather than by key on every arrival, and again whenever the lodgings are
   * replaced, since a bulldozed hotel is a home that is no longer standing.
   */
  let homeLodging = new Int32Array(guests.count);
  const findHomes = (): void => {
    for (let person = 0; person < guests.count; person++) {
      const home = homeOf(guests, person);
      homeLodging[person] = home ? lodgingFor(lodgings, home.key) : -1;
    }
  };
  findHomes();
  /** 1 for somebody held in bed until their wake tick. */
  let asleep = new Uint8Array(guests.count);
  let asleepCount = 0;
  /**
   * 1 for somebody whose last arrival sent them home rather than anywhere else,
   * for the inspector's wording and nothing more.
   */
  let homeward = new Uint8Array(guests.count);
  /**
   * 1 for somebody whose visit to the beach is over and who is out on the sand
   * making for a gate. Cleared the moment they reach a node.
   */
  let calledIn = new Uint8Array(guests.count);
  let occupancy: Occupancy = createOccupancy(guests.count, venues.length);
  /**
   * The node each person walked in by, so letting them out puts them back on
   * the paving they left rather than on a search for it. One column, written on
   * arrival and read once.
   */
  let doorOf = new Int32Array(guests.count).fill(-1);
  /**
   * The tick the clock last ran. An arrival happens between ticks and has to be
   * stamped with one, and the last one run is the simulated minute it is.
   */
  let now = 0;

  /**
   * One sweep of the graph, venue, lodging or beach alike, counted for the stats
   * readout. The caches differ only in where they keep the answer.
   */
  const sweep = (sources: readonly number[]): FlowField => {
    built++;
    return flowFieldFor(network, sources);
  };

  const fieldFor = (venue: number): FlowField => {
    const existing = fields[venue];
    if (existing) return existing;
    const declared = venues[venue]!;
    if (isBeach(declared)) {
      // Every gate is a way in, and nobody queues for sand: no lane is laid, so
      // the line holds the ceiling and is never joined.
      const field = sweep(network.gates);
      fields[venue] = field;
      return field;
    }
    const doors = doorsFor(declared, index, network);
    // A building on the beach that no paving reaches is walked up to over the
    // sand, from whichever gates can reach it, and those gates are its sources.
    const overSand =
      doors.nodes.length === 0 ? sandRoutesFor(network, doors.sand, SAND_ROUTE_TILES) : [];
    sandRoutes[venue] = overSand;
    const field = sweep(
      overSand.length > 0
        ? overSand.map((route) => route.gate).toSorted((a, b) => a - b)
        : doors.nodes,
    );
    fields[venue] = field;
    lanes[venue] =
      overSand.length > 0
        ? longestSandLane(network, overSand)
        : longestLane(network, doors.nodes, declared);
    return field;
  };

  const homeFieldFor = (lodging: number): FlowField => {
    const existing = homeFields[lodging];
    if (existing) return existing;
    const field = sweep(doorsFor(lodgings[lodging]!, index).nodes);
    homeFields[lodging] = field;
    return field;
  };

  /**
   * The rest of the way to a building on the beach from the gate a field leads
   * to: the length of that gate's sand leg, or 0 for any other venue. Found by
   * following the field to its source, which is as many steps as the hops the
   * caller has just read.
   */
  const sandLegFrom = (venue: number, field: FlowField, at: number): number => {
    const routes = sandRoutes[venue];
    if (!routes || routes.length === 0) return 0;
    let gate = at;
    while (field.next[gate]! !== gate) gate = field.next[gate]!;
    return routes.find((route) => route.gate === gate)?.length ?? 0;
  };

  /**
   * How many may wait at a venue: its own lane's length, or the ceiling where no
   * guest has walked there yet and so no lane is laid. Nobody can be waiting at
   * such a venue, so the ceiling is never the wrong answer there.
   */
  const queueLimit = (venue: number): number => lanes[venue]?.length ?? MAX_QUEUE_SHOWN;

  /**
   * How long one visit here lasts, in whole ticks, drawn afresh per visitor.
   *
   * Off the router's own seeded generator rather than `Math.random`, because
   * `docs/rendering.md` requires a bench run to replay the same scene: an
   * unseeded dwell makes two runs incomparable, and the difference shows up as
   * noise in the frame times rather than as a bug.
   *
   * Never zero. A beach shower is 30 simulated seconds, which is half a tick,
   * and a zero-tick visit would admit and release somebody in the same call so
   * no queue would ever form behind them. `arriveAt` clamps it again.
   */
  const dwellTicksFor = (venue: Venue): number => {
    const { min, max } = venue.dwellSeconds;
    return Math.max(1, Math.round((min + random() * (max - min)) / TICK_SECONDS));
  };

  /**
   * How far a person at `at` would walk to each venue, for `chooseVenue`.
   *
   * Only off a field that has **already been built**: sweeping the graph for
   * every venue merely to score them is exactly the cost this design is careful
   * about, and it would turn a lazy build into an eager one. A venue nobody has
   * walked to yet is scored on the straight line, which is a cheap and near
   * enough estimate - and the first guest who does walk there corrects it for
   * everybody after them.
   */
  const walkingDistanceAt =
    (at: number) =>
    (venue: number): number => {
      // The beach is swept on the first guest who considers it: its middle is
      // the middle of a band, and a straight line to that says nothing about
      // how far the nearest gate is.
      const field = fields[venue] ?? (isBeach(venues[venue]!) ? fieldFor(venue) : null);
      if (!field) {
        const { x, z } = venues[venue]!;
        const node = network.nodes[at];
        return node ? Math.hypot(x - node.x, z - node.z) : Number.POSITIVE_INFINITY;
      }
      const hops = field.hops[at] ?? -1;
      if (hops < 0) return Number.POSITIVE_INFINITY;
      return hops * TILE_VOXELS + sandLegFrom(venue, field, at);
    };

  const queueLength = (venue: number): number => occupancy.queues[venue]?.length ?? 0;

  /**
   * Somebody at a venue's door: in, in the line, or turned away. A line as long
   * as the ground in front of the door holds is a full line, however far short
   * of the ceiling `arriveAt` counts to.
   */
  const admitAt = (person: number, venue: number): ArrivalOutcome => {
    if (queueLength(venue) >= queueLimit(venue)) return 'balked';
    const declared = venues[venue]!;
    return arriveAt(occupancy, person, venue, declared.capacity, dwellTicksFor(declared), now);
  };

  /** Decides where this person goes next, and sets their party going with them. */
  const decide = (person: number, at: number): void => {
    const people = crowd();
    const choice = chooseVenue({
      needs,
      guests,
      person,
      venues,
      x: people.x[person] ?? 0,
      z: people.z[person] ?? 0,
      walkingDistance: walkingDistanceAt(at),
      queueLength,
      queueLimit,
    });
    if (choice) setPartyGoal(goals, guests, person, choice);
  };

  /**
   * Stands somebody at the venue they have just been let into, or at their
   * place in the line outside it.
   *
   * Inside is the middle of the footprint, so a guest having lunch is under the
   * roof rather than standing in the doorway; the height is the door node's,
   * because a venue knows where its middle is and not how high the ground is
   * there. Heading is kept as it was, which is the way they walked up. A
   * building on the beach has no door node, and its middle is at the sand's
   * height.
   */
  const stand = (person: number, venue: number, door: number, waiting: boolean): void => {
    const people = crowd();
    const lane = lanes[venue] ?? [];
    const onSand = (sandRoutes[venue]?.length ?? 0) > 0;
    const spot =
      waiting && lane.length > 0
        ? lane[Math.min(occupancy.slot[person]!, lane.length - 1)]!
        : {
            x: venues[venue]!.x,
            z: venues[venue]!.z,
            y: onSand ? BEACH_SURFACE : network.nodes[door]!.y,
            heading: people.heading[person] ?? 0,
          };
    holdAt(people, person, spot.x, spot.y, spot.z, spot.heading);
  };

  /**
   * Whether this arrival is the one the person was walking towards, and what
   * happens if it is.
   *
   * A source's own entry in its field is itself, which is how a node is known to
   * be one of the venue's doors without anything holding a door list per person.
   *
   * Hands back whether they have been taken in hand: somebody inside or in a
   * line is standing still, and the crowd must not aim them anywhere.
   */
  const arriveIfThere = (person: number, at: number): boolean => {
    const goal = goals.venue[person]!;
    if (goal === NO_GOAL || goal >= venues.length) return false;
    const venue = venues[goal]!;
    if (fieldFor(goal).next[at] !== at) return false;
    const overSand = sandRoutes[goal] ?? [];
    if (overSand.length > 0) return setOffOverSand(person, goal, at, overSand);

    const outcome = admitAt(person, goal);
    if (outcome === 'balked') {
      // The line was already as long as anybody will join. Their goal goes and
      // they decide again on this same node - and `chooseVenue` is handed the
      // same queue lengths, so the place that just turned them away is not a
      // candidate and they do not set off for it a second time.
      clearPartyGoal(goals, guests, person);
      return false;
    }
    doorOf[person] = at;
    // A visit to the beach is spent walking about on it rather than stood
    // inside: see `beach.ts`.
    if (isBeach(venue)) stepOntoSand(crowd(), person, at);
    else stand(person, goal, at, outcome === 'waiting');
    return true;
  };

  /**
   * Somebody at a gate their venue on the beach is reached from, set off along
   * that gate's sand leg; or, where its line is already full, turned away here
   * rather than at the end of the walk. Hands back whether they were set off.
   */
  const setOffOverSand = (
    person: number,
    venue: number,
    gate: number,
    routes: readonly SandRoute[],
  ): boolean => {
    const route = routes.findIndex((each) => each.gate === gate);
    if (route === -1 || queueLength(venue) >= queueLimit(venue)) {
      clearPartyGoal(goals, guests, person);
      return false;
    }
    errands.venue[person] = venue;
    errands.route[person] = route;
    errands.leg[person] = 0;
    errands.back[person] = 0;
    const first = routes[route]!.waypoints[0]!;
    walkSandTo(crowd(), person, first.x, first.z);
    return true;
  };

  /** The sand leg a person is walking, or undefined for anybody not on one. */
  const errandOf = (person: number): SandRoute | undefined => {
    const venue = errands.venue[person]!;
    return venue < 0 ? undefined : sandRoutes[venue]?.[errands.route[person]!];
  };

  /**
   * One step back along a sand leg: to the waypoint before, or off the last of
   * them onto the graph at the gate. Somebody leaving a building is at its door
   * or inside it, one step past the last waypoint, so the first step back is to
   * the door.
   */
  const walkBack = (person: number, route: SandRoute): void => {
    errands.back[person] = 1;
    const leg = errands.leg[person]! - 1;
    errands.leg[person] = leg;
    const point = route.waypoints[leg];
    if (point) {
      walkSandTo(crowd(), person, point.x, point.z);
      return;
    }
    errands.venue[person] = -1;
    if (route.gate < network.nodes.length) releaseTo(crowd(), person, route.gate);
  };

  /**
   * Somebody sent over the sand has reached the point they were sent to: on to
   * the next, or at the last of them the door. Anybody this router did not send
   * - it has been rebuilt since - is left alone, and the crowd turns them into a
   * roamer. Always -1, which is `step`'s answer for somebody the crowd must not
   * aim anywhere.
   */
  const alongTheSand = (person: number): number => {
    const route = person >= 0 && person < goals.count ? errandOf(person) : undefined;
    if (!route) return -1;
    if (errands.back[person] === 1) {
      walkBack(person, route);
      return -1;
    }
    const leg = errands.leg[person]! + 1;
    errands.leg[person] = leg;
    const next = route.waypoints[leg];
    if (next) walkSandTo(crowd(), person, next.x, next.z);
    else reachSandDoor(person, route);
    return -1;
  };

  /**
   * At the door of a building on the beach: in, in the line on the sand, or
   * turned away - and somebody turned away walks back to the gate, where they
   * decide again on the graph.
   */
  const reachSandDoor = (person: number, route: SandRoute): void => {
    const venue = errands.venue[person]!;
    const outcome = admitAt(person, venue);
    if (outcome !== 'balked') {
      stand(person, venue, -1, outcome === 'waiting');
      return;
    }
    clearPartyGoal(goals, guests, person);
    walkBack(person, route);
  };

  /**
   * Somebody reaching a node is back on the paving, whatever brought them off
   * the sand: the end of their visit, their bedtime, or the crowd's own chance
   * of wandering back in. A visit to the beach still running ends here, with its
   * relief, rather than on a tick that would find them somewhere else entirely.
   * So does a sand leg the crowd gave up on for them.
   */
  const backOffTheSand = (person: number): void => {
    if (person < 0 || person >= goals.count) return;
    calledIn[person] = 0;
    errands.venue[person] = -1;
    if (occupancy.state[person] !== VISIT.inside) return;
    const venue = venues[occupancy.at[person]!];
    if (!venue || !isBeach(venue)) return;
    leaveVenue(occupancy, person);
    relieve(needs, person, venue.satisfies);
    clearPartyGoal(goals, guests, person);
    doorOf[person] = -1;
  };

  /**
   * One person's visit ending: the need is seen to, the goal is let go, and
   * they walk out of the door they came in by.
   *
   * **This is where the relief happens**, and not on arrival. It is the whole
   * difference between a visit that takes the dwell the art declared and plan
   * 017's instantaneous one.
   */
  const leave = (person: number, venue: number): void => {
    relieve(needs, person, venues[venue]!.satisfies);
    clearPartyGoal(goals, guests, person);
    const door = doorOf[person]!;
    doorOf[person] = -1;
    const overSand = errands.venue[person] === venue ? errandOf(person) : undefined;
    // Out on the sand rather than stood at a door: a straight line to the gate
    // they came in by could cross a bay, so they are called in and walk to the
    // nearest gate the way a roamer does. See `Router.offTheSand`.
    if (isBeach(venues[venue]!)) calledIn[person] = 1;
    // Out of a building on the beach, back the way they came over the sand.
    else if (overSand) walkBack(person, overSand);
    else if (door >= 0 && door < network.nodes.length) releaseTo(crowd(), person, door);
  };

  /**
   * Where somebody whose bedtime it is walks from here: the next node home, -1
   * for somebody who has just reached their door and is now in bed, or
   * {@link BY_DAY}.
   *
   * {@link BY_DAY} is somebody with no bed, or whose bed was bulldozed, and they
   * walk all night: that is the state the resort should be able to show, and
   * plan 020 is what makes them unhappy about it. Somebody whose lodging no
   * paving reaches is the same guest by another route. Both carry on as they
   * would by day, venues and all.
   *
   * A guest inside a venue or in its line when the clock strikes ten is never
   * asked: this is only reached on an arrival, and they are held until their
   * visit ends. Nobody walks out of a restaurant mid-meal because it is late.
   */
  const homewardStep = (person: number, at: number): number => {
    const lodging = homeLodging[person]!;
    if (lodging < 0) return BY_DAY;
    const onward = homeFieldFor(lodging).next[at] ?? -1;
    if (onward < 0) return BY_DAY;
    homeward[person] = 1;
    if (onward !== at) return onward;
    fallAsleep(person, lodging, at);
    return -1;
  };

  /**
   * Puts somebody to bed: held in the middle of their lodging, where the walls
   * hide them, until {@link wakeWhoeverIsUp} lets them go.
   *
   * Their party's goal goes, so the morning starts with a fresh decision rather
   * than with last night's errand. The door is remembered in the column a visit
   * uses, which nobody asleep is on, so they get up and walk out of the door
   * they came in by.
   */
  const fallAsleep = (person: number, lodging: number, door: number): void => {
    const people = crowd();
    const { x, z } = lodgings[lodging]!;
    holdAt(people, person, x, network.nodes[door]!.y, z, people.heading[person] ?? 0);
    clearPartyGoal(goals, guests, person);
    doorOf[person] = door;
    asleep[person] = 1;
    asleepCount++;
  };

  /**
   * Gets up everybody whose night is over, rested.
   *
   * "Not bedtime any more" rather than "the tick is their wake tick": a clock
   * dragged past the morning, or twelve ticks run in one frame, would otherwise
   * step over the one tick that wakes somebody and leave them in bed a day.
   */
  const wakeWhoeverIsUp = (tickOfDay: number): void => {
    for (let person = 0; person < guests.count && asleepCount > 0; person++) {
      if (asleep[person] === 0 || isBedtime(guests.party[person]!, tickOfDay)) continue;
      asleep[person] = 0;
      homeward[person] = 0;
      asleepCount--;
      relieve(needs, person, NIGHT_RELIEF);
      const door = doorOf[person]!;
      doorOf[person] = -1;
      if (door >= 0 && door < network.nodes.length) releaseTo(crowd(), person, door);
    }
  };

  /**
   * What the night makes of this arrival, or {@link BY_DAY}. Asked before any
   * venue, and the one place a person index nobody could have meant is turned
   * away, since everything after it reads a column by it.
   */
  const nightStep = (person: number, at: number): number => {
    if (person < 0 || person >= goals.count) return -1;
    // Held in bed; the crowd does not ask again until they are let go.
    if (asleep[person] === 1) return -1;
    homeward[person] = 0;
    if (!isBedtime(guests.party[person]!, parts.tickOfDay())) return BY_DAY;
    return homewardStep(person, at);
  };

  return {
    step(person, at) {
      if (at === ON_SAND) return alongTheSand(person);
      backOffTheSand(person);
      const night = nightStep(person, at);
      if (night !== BY_DAY) return night;
      if (arriveIfThere(person, at)) return -1;
      if (goals.venue[person] === NO_GOAL) decide(person, at);

      const chosen = goals.venue[person]!;
      if (chosen === NO_GOAL || chosen >= venues.length) return -1;
      const onward = fieldFor(chosen).next[at] ?? -1;
      // Unreachable from here, or a venue with no door at all. Forget it rather
      // than ask again at every arrival: they wander on and decide afresh at the
      // next node, which may well be one the venue can be reached from.
      if (onward < 0) {
        clearPartyGoal(goals, guests, person);
        return -1;
      }
      return onward;
    },

    offTheSand(person) {
      if (person < 0 || person >= goals.count || asleep[person] === 1) return false;
      if (calledIn[person] === 1) return true;
      return homeLodging[person]! >= 0 && isBedtime(guests.party[person]!, parts.tickOfDay());
    },

    tick(at) {
      now = at;
      const swept = sweepOccupancy(
        occupancy,
        (venue) => venues[venue]?.capacity ?? 0,
        (venue) => {
          const declared = venues[venue];
          return declared ? dwellTicksFor(declared) : 1;
        },
        at,
      );
      for (let each = 0; each < swept.left.length; each++) {
        leave(swept.left[each]!, swept.leftFrom[each]!);
      }
      // The people the sweep let in and the people it shuffled up are both
      // already held; they are only stood somewhere else.
      for (const person of swept.admitted) {
        stand(person, occupancy.at[person]!, doorOf[person]!, false);
      }
      for (const person of swept.moved) {
        stand(person, occupancy.at[person]!, doorOf[person]!, true);
      }
      if (asleepCount > 0) wakeWhoeverIsUp(at % TICKS_PER_DAY);
      // Once a simulated minute, so a sunbather whose bedtime it is is not left
      // lying on the beach in the dark until the lie is over.
      rouseSunbathers(crowd());
    },

    rebuild(nextVenues, nextLodgings, nextNetwork) {
      venues = withBeach(nextVenues, nextNetwork);
      lodgings = nextLodgings;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      fields = venues.map(() => null);
      lanes = venues.map(() => null);
      sandRoutes = venues.map(() => null);
      errands = createErrands(guests.count);
      homeFields = nextLodgings.map(() => null);
      built = 0;
      findHomes();
      // Everybody is woken, with no night's relief: a guest left asleep across
      // a rebuild is held for ever at a point that no longer means anything,
      // and whoever it is still bedtime for walks home again on the new graph.
      asleep = new Uint8Array(guests.count);
      asleepCount = 0;
      homeward = new Uint8Array(guests.count);
      // A fresh one rather than an emptied one: the per-venue arrays are as long
      // as the venue list, and the list has just been replaced.
      occupancy = createOccupancy(guests.count, venues.length);
      doorOf = new Int32Array(guests.count).fill(-1);
      calledIn = new Uint8Array(guests.count);
      // Everybody, not only the parties whose venue went: a goal is an index
      // into the venue list that has just been replaced, over nodes that have
      // just been renumbered, so none of them means anything now.
      clearAllGoals(goals);
      // Nobody is let go here. Whoever was held is standing on a point of a
      // graph that no longer exists, and `reseatCrowd` walks every one of them
      // to the node nearest where they stand - held people included, with no
      // branch of its own. See the note in `crowd.ts`.
    },

    get fieldCount() {
      return built;
    },

    get asleepCount() {
      return asleepCount;
    },

    isAsleep(person) {
      return asleep[person] === 1;
    },

    homewardTo(person) {
      if (homeward[person] !== 1) return null;
      return lodgings[homeLodging[person]!] ?? null;
    },

    get occupancyTotals() {
      let inside = 0;
      let waiting = 0;
      for (let venue = 0; venue < venues.length; venue++) {
        inside += occupancy.inside[venue] ?? 0;
        waiting += queueLength(venue);
      }
      return { inside, waiting };
    },

    goalOf(person) {
      if (person < 0 || person >= goals.count) return null;
      const goal = goals.venue[person]!;
      return goal === NO_GOAL ? null : (venues[goal] ?? null);
    },

    visitOf(person) {
      if (person < 0 || person >= occupancy.people) return null;
      const state = occupancy.state[person];
      if (state === VISIT.away) return null;
      const venue = venues[occupancy.at[person]!];
      if (!venue) return null;
      return { venue, waiting: state === VISIT.waiting, place: occupancy.slot[person]! };
    },

    occupancyOf(venueKey) {
      const venue = venues.findIndex((candidate) => candidate.key === venueKey);
      if (venue === -1) return null;
      return { inside: occupancy.inside[venue] ?? 0, waiting: queueLength(venue) };
    },
  };
}

/**
 * The venues the plot's art declares, and the beach after them when the plot has
 * one to walk onto. Last, so every building keeps the index `venuesOn` gave it.
 */
function withBeach(venues: readonly Venue[], network: WalkNetwork): readonly Venue[] {
  const beach = beachVenueFor(network);
  return beach ? [...venues, beach] : venues;
}

/**
 * The longest line any sand door of a building on the beach can lay, each run
 * out towards the way its nearest route walks up; of lines as long as each
 * other, the one at the door of the nearest route.
 *
 * One line per venue for the reason {@link longestLane} gives.
 */
function longestSandLane(network: WalkNetwork, routes: readonly SandRoute[]): readonly QueueSpot[] {
  let best: readonly QueueSpot[] = [];
  const doors = new Set<string>();
  for (const route of routes) {
    const door = route.waypoints.at(-1)!;
    const key = `${door.x},${door.z}`;
    if (doors.has(key)) continue;
    doors.add(key);
    const lane = sandLaneFor(network, door, route.waypoints.at(-2) ?? network.nodes[route.gate]!);
    if (lane.length > best.length) best = lane;
  }
  return best;
}

/**
 * The longest lane any of a venue's doors can lay; of lanes as long as each
 * other, the one from the door nearest the venue's middle, and then the lower
 * node.
 *
 * One lane per venue rather than one per door, because a venue has one queue:
 * a line split between two doors would stand slot 3 at one of them with slots 0
 * to 2 at the other. With a declared door there is almost always one node to
 * choose from; the choice only matters on the fallback ring, where the door
 * with the most paving in front of it is the one that can hold the line, and a
 * ring corner the line merely passes is not where it should start.
 *
 * Empty for a venue with no doors at all, which nobody can reach to wait at.
 */
function longestLane(
  network: WalkNetwork,
  doors: readonly number[],
  venue: Venue,
): readonly QueueSpot[] {
  let best: readonly QueueSpot[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const door of doors) {
    const lane = queueLaneFor(network, door, venue);
    const { x, z } = network.nodes[door]!;
    const distance = Math.hypot(x - venue.x, z - venue.z);
    if (lane.length < best.length) continue;
    if (lane.length === best.length && distance >= bestDistance) continue;
    best = lane;
    bestDistance = distance;
  }
  return best;
}
