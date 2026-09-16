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
 * ## A visit to the beach is a stay at a pitch
 *
 * The same walk takes a guest on a visit to the beach itself out to a spot on
 * the sand. The first of a party to reach a gate chooses the party's pitch -
 * see `beachPitch.ts` - and every member who follows is routed to their own
 * spot at it and held there, on a lounger or lying or sitting on the sand, for
 * the whole visit. The visit over, or their bedtime come, they walk back and
 * are let onto the graph at the gate. Nobody roams: the crowd is told not to,
 * through `CrowdOptions.roamsBeach`, by whatever builds it.
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
  holdOnSeat,
  isWaiting,
  ON_SAND,
  releaseTo,
  RESTING,
  seatIsFree,
  walkSandTo,
  type Crowd,
} from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { homeOf, partyOf, type Guests } from '../../guests/domain/guests';
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
import { relieve, strongestNeed, type Needs } from './needs';
import { isBedtime, NIGHT_RELIEF } from './night';
import { beachVenueFor, isBeach } from './beach';
import { pitchFor, type Pitch } from './beachPitch';
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
import { sandFieldFor, sandRoutesFor, type SandField, type SandRoute } from './sandRoute';
import { TICKS_PER_DAY } from './simClock';
import { reliefAt, type Venue } from './venues';

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
 * How loudly a need has to pull before somebody settled on the beach gets up to
 * see to it at a bar, a kiosk or a shower on the sand.
 *
 * Twice `needs.ts`'s "content" line. Below it a guest on a stay stays put: an
 * afternoon on the sand is worth a little thirst, and a beach where everybody
 * jumps up every few minutes is a beach nobody is lying on.
 */
const FETCH_URGENCY = 0.4;

/**
 * Simulated minutes before somebody who found nothing on the sand worth getting
 * up for looks again.
 *
 * The look costs a `chooseVenue` pass over the venue list, so it is cheap; what
 * it guards against is the guest whose nearest kiosk cannot be routed to, who
 * would otherwise pay for a sweep of the beach every tick for the whole stay.
 */
const LOOK_AGAIN_TICKS = 15;

/**
 * Who is walking a sand leg, and how far along it, one column each: the venue
 * it is for or -1, the route itself, the waypoint being walked to, and 1 on the
 * way back to the gate rather than out to the door.
 *
 * The route is the person's own rather than an index into a venue's list,
 * because a stay on the beach walks each member of a party to a spot of their
 * own; a building's routes are shared by everybody walking to it all the same.
 */
interface Errands {
  readonly venue: Int32Array;
  readonly route: (SandRoute | null)[];
  readonly leg: Int32Array;
  readonly back: Uint8Array;
}

const createErrands = (people: number): Errands => ({
  venue: new Int32Array(people).fill(-1),
  route: Array.from({ length: people }, () => null),
  leg: new Int32Array(people),
  back: new Uint8Array(people),
});

/**
 * A pitch as the router holds it: the routes over the sand to its middle from
 * every gate that can reach it, and how many are stopping at it. Freed when
 * the last of them leaves.
 */
interface Claim {
  readonly pitch: Pitch;
  readonly routes: readonly SandRoute[];
  holders: number;
}

/** Where a guest on a stay at the beach is in it: on the way out, settled, or on the way back. */
export type BeachStay = 'arriving' | 'resting' | 'leaving';

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
   * Whether the beach should give this person up: it is their bedtime, they
   * have a bed and they are not in it yet. The crowd's `offTheSand`.
   *
   * Only ever read of a roamer, who is on no stay and so on nothing this router
   * can end: a crowd built to roam, or a stray. Needed beside {@link step}
   * because `step` is asked at a node and the sand has none: without it a guest
   * out on the beach never heard that it was night and roamed until morning.
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
  /** Where one person is in a stay at the beach, or null while they are on none. */
  stayOf(person: number): BeachStay | null;
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
  /** Each party's pitch on the beach, or null while none of them is stopping there. */
  let partyPitches: (Claim | null)[] = guests.parties.map(() => null);
  /** The pitch each person is stopping at, and which of its spots is theirs. */
  let stays: (Claim | null)[] = Array.from({ length: guests.count }, () => null);
  let spotOf = new Int32Array(guests.count);
  /** Beach tiles pitched on, and loungers promised to a pitch, so no two parties share either. */
  let pitched = new Set<number>();
  let promised = new Set<number>();
  /**
   * The venue on the sand each person has got up from their pitch for, or -1.
   * See {@link sendOnErrands}.
   */
  let fetching = new Int32Array(guests.count).fill(-1);
  /** The tick their stay was to have ended on, and the walk back to their gate, while they are. */
  let stayUntil = new Int32Array(guests.count);
  let stayRoutes: (SandRoute | null)[] = Array.from({ length: guests.count }, () => null);
  /** The earliest tick each person looks for something on the sand again. */
  let lookAgainAt = new Int32Array(guests.count);
  /**
   * Each building on the sand as a sweep of the beach, kept for the guests who
   * walk to it from a pitch rather than from a gate; and whether each venue is
   * one at all, which is a question about its doors, asked once.
   */
  let sandFields: (SandField | null)[] = venues.map(() => null);
  let standsOnSand = new Int8Array(venues.length).fill(-1);
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

  /**
   * Whether a venue is a building standing on the sand: no door any paving
   * reaches, and a way in off the beach. Asked of the doors once per venue,
   * because a stay looks for somewhere to go every quarter of an hour.
   */
  const isOnSand = (venue: number): boolean => {
    const known = standsOnSand[venue]!;
    if (known >= 0) return known === 1;
    const declared = venues[venue]!;
    const doors = isBeach(declared) ? null : doorsFor(declared, index, network);
    const answer = doors !== null && doors.nodes.length === 0 && doors.sand.length > 0;
    standsOnSand[venue] = answer ? 1 : 0;
    return answer;
  };

  /** A building on the sand as a sweep of the beach, kept: see {@link SandField}. */
  const sandFieldOf = (venue: number): SandField => {
    const existing = sandFields[venue];
    if (existing) return existing;
    const field = sandFieldFor(
      network,
      doorsFor(venues[venue]!, index, network).sand,
      SAND_ROUTE_TILES,
    );
    sandFields[venue] = field;
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
    const onSand = door < 0 || (sandRoutes[venue]?.length ?? 0) > 0;
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
    if (!isBeach(venue)) {
      stand(person, goal, at, outcome === 'waiting');
      return true;
    }
    if (settleOnSand(person, at)) return true;
    // Nowhere near this gate to put a towel down. The visit ends here, relief
    // and all, rather than being walked about in: they decide again on the
    // graph, and the relief keeps them from choosing the same gate again.
    endVisitAtTheGate(person, venue);
    return false;
  };

  /** A visit that ends where it began, with its relief. */
  const endVisitAtTheGate = (person: number, venue: Venue): void => {
    leaveVenue(occupancy, person);
    relieve(needs, person, venue.satisfies);
    clearPartyGoal(goals, guests, person);
    doorOf[person] = -1;
  };

  /**
   * Somebody on a visit to the beach at a gate, set off over the sand to their
   * spot at their party's pitch - chosen now by the first of them to get here -
   * or, where this gate cannot reach it, at a pitch of their own. Hands back
   * whether they were set off at all.
   */
  const settleOnSand = (person: number, gate: number): boolean => {
    const party = guests.party[person]!;
    const members = partyOf(guests, person);
    partyPitches[party] ??= claimPitch(gate, members);
    const shared = partyPitches[party];
    if (shared && stayAt(person, shared, members.indexOf(person), gate)) return true;
    if (shared) dropIfEmpty(shared, party);
    const own = claimPitch(gate, [person]);
    if (own && stayAt(person, own, 0, gate)) return true;
    if (own) dropIfEmpty(own, party);
    return false;
  };

  /** A pitch for these people near this gate, claimed so the next party pitches elsewhere. */
  const claimPitch = (gate: number, members: readonly number[]): Claim | null => {
    const people = crowd();
    const pitch = pitchFor({
      network,
      gate,
      members: members.map((member) => ({ child: guests.child[member] === 1 })),
      taken: pitched,
      loungerFree: (seat) => !promised.has(seat) && seatIsFree(people, seat),
    });
    if (!pitch) return null;
    pitched.add(pitch.tile);
    for (const spot of pitch.spots) if (spot.seat >= 0) promised.add(spot.seat);
    return { pitch, routes: sandRoutesFor(network, [pitch], SAND_ROUTE_TILES), holders: 0 };
  };

  /** Frees a pitch nobody is stopping at any more: its tile, its loungers, and the party's hold on it. */
  const dropIfEmpty = (claim: Claim, party: number): void => {
    if (claim.holders > 0) return;
    pitched.delete(claim.pitch.tile);
    for (const spot of claim.pitch.spots) promised.delete(spot.seat);
    if (partyPitches[party] === claim) partyPitches[party] = null;
  };

  /**
   * Sets somebody off from a gate to one spot of a pitch: the route to the
   * pitch's middle, then the step to their spot. False where the gate has no
   * route to it.
   */
  const stayAt = (person: number, claim: Claim, member: number, gate: number): boolean => {
    const route = claim.routes.find((each) => each.gate === gate);
    const spot = claim.pitch.spots[member];
    if (!route || !spot) return false;
    claim.holders++;
    stays[person] = claim;
    spotOf[person] = member;
    const last = route.waypoints.at(-1)!;
    const onward = Math.hypot(spot.x - last.x, spot.z - last.z);
    const toSpot: SandRoute =
      onward > 0
        ? { ...route, waypoints: [...route.waypoints, spot], length: route.length + onward }
        : route;
    setOffAlong(person, venues.length - 1, toSpot);
    return true;
  };

  /** Whoever was stopping at a pitch is not any more; the pitch goes with the last of them. */
  const leaveStay = (person: number): void => {
    const claim = stays[person];
    if (!claim) return;
    stays[person] = null;
    claim.holders--;
    dropIfEmpty(claim, guests.party[person]!);
  };

  /**
   * At their spot: on its lounger, or lying or sitting on the sand. A lounger
   * somebody got to first - a roamer, in a crowd that roams - leaves them lying
   * on the sand in the middle of the pitch instead.
   */
  const restAtSpot = (person: number, claim: Claim): void => {
    // The spot is the last waypoint and they are on it, so the walk back starts
    // with the one before.
    errands.leg[person]! -= 1;
    const people = crowd();
    const spot = claim.pitch.spots[spotOf[person]!]!;
    if (spot.seat >= 0 && holdOnSeat(people, person, spot.seat)) return;
    if (spot.seat >= 0) {
      holdAt(people, person, claim.pitch.x, BEACH_SURFACE, claim.pitch.z, 0, RESTING.lying);
      return;
    }
    holdAt(people, person, spot.x, spot.y, spot.z, spot.heading, spot.pose);
  };

  /**
   * Gets up whoever has been lying on the sand long enough to want something
   * the beach itself does not give them, and sends them over it to whatever
   * does: a bar, a kiosk, a shower, a club.
   *
   * This is what makes a beach a place to spend a day rather than an hour. A
   * guest who had to walk back to the paving and decide again from there was a
   * guest who did not come back, and the sand emptied every time anybody got
   * thirsty. Their pitch, their spot and their lounger stay theirs while they
   * are gone, and the visit picks up where it left off.
   *
   * Only while somebody is on the beach at all, and only every
   * {@link LOOK_AGAIN_TICKS} per guest once they have found nothing.
   */
  const sendOnErrands = (): void => {
    const beach = beachIndex();
    if (beach < 0 || !(occupancy.inside[beach]! > 0)) return;
    const people = crowd();
    for (let person = 0; person < guests.count; person++) {
      if (!dueAnotherLook(person, beach, people)) continue;
      const wanted = strongestNeed(needs, guests, person);
      if (!wanted || wanted.urgency < FETCH_URGENCY) continue;
      // What they came to the beach for is what the beach is giving them.
      if (reliefAt(venues[beach]!, wanted.need) > 0) continue;
      lookAgainAt[person] = now + LOOK_AGAIN_TICKS;
      fetchOverTheSand(person, people);
    }
  };

  /**
   * Whether this person is settled on their pitch on the beach right now, and
   * has not looked round for something within the last {@link LOOK_AGAIN_TICKS}.
   */
  const dueAnotherLook = (person: number, beach: number, people: Crowd): boolean => {
    if (occupancy.state[person] !== VISIT.inside || occupancy.at[person] !== beach) return false;
    return isWaiting(people, person) && now >= lookAgainAt[person]!;
  };

  /**
   * Sends one guest from their pitch to the best thing on the sand for what they
   * want, if anything on it serves them and a walk over the beach reaches it.
   *
   * Scored by {@link chooseVenue} like any other choice, with everything off the
   * sand at `Infinity`: what is being chosen is where to go *without leaving the
   * beach*, and a restaurant up in the town is a different decision, taken when
   * the stay ends. The party's goal is untouched, because this is one guest
   * fetching an ice cream and not the family moving on.
   */
  const fetchOverTheSand = (person: number, people: Crowd): void => {
    const claim = stays[person];
    if (!claim) return;
    const choice = chooseVenue({
      needs,
      guests,
      person,
      venues,
      x: people.x[person] ?? 0,
      z: people.z[person] ?? 0,
      walkingDistance: acrossTheSandFrom(people.x[person] ?? 0, people.z[person] ?? 0),
      queueLength,
      queueLimit,
    });
    if (!choice) return;
    // Its lane and its own routes off the beach, which the walk home will want.
    fieldFor(choice.venue);
    const waypoints = sandFieldOf(choice.venue).routeFrom(claim.pitch);
    if (!waypoints) return;
    stayUntil[person] = occupancy.until[person]!;
    stayRoutes[person] = errands.route[person] ?? null;
    // Out of the beach's own count while they are away, or the sweep would end
    // a stay for somebody standing at a bar; {@link backToThePitch} puts them
    // back in it with the time they had left.
    leaveVenue(occupancy, person);
    fetching[person] = choice.venue;
    setOffAlong(person, choice.venue, { gate: -1, waypoints, length: 0 });
  };

  /** How far each venue is over the sand alone: a straight line, or `Infinity` off the beach. */
  const acrossTheSandFrom =
    (x: number, z: number) =>
    (venue: number): number =>
      isOnSand(venue)
        ? Math.hypot(venues[venue]!.x - x, venues[venue]!.z - z)
        : Number.POSITIVE_INFINITY;

  /**
   * Back at the pitch with whatever they went for: into the beach's count again
   * for the time the stay had left, and out to their own spot.
   *
   * At least a tick of it, even where the stay ran out while they queued: the
   * sweep then ends it on the next tick, from the spot, so they walk back to
   * the gate the way anybody leaving the beach does rather than from a bar.
   */
  const backToThePitch = (person: number): void => {
    fetching[person] = -1;
    const beach = beachIndex();
    const route = stayRoutes[person];
    const claim = stays[person];
    if (beach < 0 || !route || !claim) return;
    arriveAt(
      occupancy,
      person,
      beach,
      venues[beach]!.capacity,
      Math.max(1, stayUntil[person]! - now),
      now,
    );
    errands.venue[person] = beach;
    errands.route[person] = route;
    errands.back[person] = 0;
    errands.leg[person] = route.waypoints.length - 1;
    const spot = route.waypoints.at(-1)!;
    walkSandTo(crowd(), person, spot.x, spot.z);
  };

  /**
   * The end of a visit somebody made from their pitch: back to it with the rest
   * of their stay, or - where the stay has run out or it is their bedtime - off
   * the beach by the gate the building's own routes come from.
   */
  const leaveErrand = (person: number, venue: number): void => {
    relieve(needs, person, venues[venue]!.satisfies);
    const route = errandOf(person);
    const staying = stays[person] !== null && now < stayUntil[person]! && !dueInBed(person);
    if (route && staying) {
      walkBack(person, route);
      return;
    }
    endStayFromErrand(person, venue);
  };

  /** Their day on the sand ends here: the beach's relief, the pitch given up, and a walk to a gate. */
  const endStayFromErrand = (person: number, venue: number): void => {
    const beach = beachIndex();
    if (beach >= 0) relieve(needs, person, venues[beach]!.satisfies);
    leaveStay(person);
    fetching[person] = -1;
    stayRoutes[person] = null;
    clearPartyGoal(goals, guests, person);
    const home = sandRoutes[venue]?.[0];
    if (!home) {
      errands.venue[person] = -1;
      return;
    }
    errands.venue[person] = venue;
    errands.route[person] = home;
    errands.leg[person] = home.waypoints.length;
    walkBack(person, home);
  };

  /** Whether this person has a bed and it is their party's bedtime. */
  const dueInBed = (person: number): boolean =>
    homeLodging[person]! >= 0 && isBedtime(guests.party[person]!, parts.tickOfDay());

  /** Which venue the beach is, or -1 on a plot with none. */
  const beachIndex = (): number => {
    const last = venues.length - 1;
    return last >= 0 && isBeach(venues[last]!) ? last : -1;
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
    const route = routes.find((each) => each.gate === gate);
    if (!route || queueLength(venue) >= queueLimit(venue)) {
      clearPartyGoal(goals, guests, person);
      return false;
    }
    setOffAlong(person, venue, route);
    return true;
  };

  /** Starts somebody at a gate along a sand leg, to its first waypoint. */
  const setOffAlong = (person: number, venue: number, route: SandRoute): void => {
    errands.venue[person] = venue;
    errands.route[person] = route;
    errands.leg[person] = 0;
    errands.back[person] = 0;
    const first = route.waypoints[0]!;
    walkSandTo(crowd(), person, first.x, first.z);
  };

  /** The sand leg a person is walking, or undefined for anybody not on one. */
  const errandOf = (person: number): SandRoute | undefined =>
    errands.venue[person]! < 0 ? undefined : (errands.route[person] ?? undefined);

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
    // The far end of an errand from a pitch is the pitch, not a gate: a walk
    // over the sand that started on it never touched the graph.
    if (fetching[person]! >= 0) {
      backToThePitch(person);
      return;
    }
    if (route.gate >= 0 && route.gate < network.nodes.length) {
      releaseTo(crowd(), person, route.gate);
    }
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
    const stay = stays[person];
    if (next) walkSandTo(crowd(), person, next.x, next.z);
    // At a door, whether they walked from a gate or up off their own towel.
    else if (fetching[person]! >= 0) reachSandDoor(person, route);
    else if (stay) restAtSpot(person, stay);
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
    // Somebody who walked up from their own pitch keeps their party's goal: the
    // beach is where they still are, and the line is all they were refused.
    if (fetching[person]! < 0) clearPartyGoal(goals, guests, person);
    walkBack(person, route);
  };

  /**
   * Somebody reaching a node is back on the paving, so whatever sand leg they
   * were on is over - the walk back from a door or a pitch ends at the gate, and
   * one the crowd gave up on for them ends wherever they came in.
   */
  const backOffTheSand = (person: number): void => {
    if (person < 0 || person >= goals.count) return;
    errands.venue[person] = -1;
  };

  /**
   * Ends the stay of everybody on the beach whose bedtime it is and who has a
   * bed to go to, with the relief of the visit, and walks them back: nobody
   * lies on the sand in the dark. Only looked for while somebody is on it.
   */
  const callInForBed = (tickOfDay: number): void => {
    const beach = venues.length - 1;
    const venue = venues[beach];
    if (!venue || !isBeach(venue) || !(occupancy.inside[beach]! > 0)) return;
    for (let person = 0; person < guests.count; person++) {
      if (occupancy.state[person] !== VISIT.inside || occupancy.at[person] !== beach) continue;
      if (homeLodging[person]! < 0 || !isBedtime(guests.party[person]!, tickOfDay)) continue;
      leaveVenue(occupancy, person);
      leave(person, beach);
    }
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
    if (fetching[person] === venue) {
      leaveErrand(person, venue);
      return;
    }
    relieve(needs, person, venues[venue]!.satisfies);
    clearPartyGoal(goals, guests, person);
    const door = doorOf[person]!;
    doorOf[person] = -1;
    const overSand = errands.venue[person] === venue ? errandOf(person) : undefined;
    leaveStay(person);
    // Out of a building on the beach, or up off their pitch, back the way they
    // came over the sand.
    if (overSand) walkBack(person, overSand);
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
      callInForBed(at % TICKS_PER_DAY);
      sendOnErrands();
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
      // Every pitch too: its routes name gate nodes, and its loungers seats, of
      // the graph that has just gone.
      partyPitches = guests.parties.map(() => null);
      stays = Array.from({ length: guests.count }, () => null);
      spotOf = new Int32Array(guests.count);
      pitched = new Set();
      promised = new Set();
      fetching = new Int32Array(guests.count).fill(-1);
      stayUntil = new Int32Array(guests.count);
      stayRoutes = Array.from({ length: guests.count }, () => null);
      lookAgainAt = new Int32Array(guests.count);
      sandFields = venues.map(() => null);
      standsOnSand = new Int8Array(venues.length).fill(-1);
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
      // What they are walking to right now, which for somebody who has got up
      // off their towel for an ice cream is not their party's goal.
      if (fetching[person]! >= 0) return venues[fetching[person]!] ?? null;
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

    stayOf(person) {
      if (person < 0 || person >= goals.count) return null;
      // On an errand off their pitch: walking back to it is walking to the
      // beach, and walking to the bar is the bar's own line.
      if (fetching[person]! >= 0) return errands.back[person] === 1 ? 'arriving' : null;
      const venue = venues[errands.venue[person]!];
      if (!venue || !isBeach(venue)) return null;
      if (errands.back[person] === 1) return 'leaving';
      return isWaiting(crowd(), person) ? 'resting' : 'arriving';
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
