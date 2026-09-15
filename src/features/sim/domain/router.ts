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
 * ## Everything is thrown away when the graph is
 *
 * A node index means nothing across a rebuild, so {@link Router.rebuild} drops
 * the fields, the lanes, the goals, the occupancy and who is asleep together. A field kept across an edit
 * is the one bug this design can have, and it shows up as guests walking
 * confidently into a wall.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { holdAt, releaseTo, type Crowd } from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { homeOf, type Guests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { chooseVenue } from './chooseVenue';
import { doorsFor, type VenueDoors } from './doors';
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
import { arriveAt, createOccupancy, sweepOccupancy, VISIT, type Occupancy } from './occupancy';
import { MAX_QUEUE_SHOWN, queueLaneFor, type QueueSpot } from './queueLane';
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
   */
  step(person: number, at: number): number;
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

  let venues = parts.venues;
  let lodgings = parts.lodgings;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  /** One entry per venue, filled in on the first guest who walks to that one. */
  let fields: (FlowField | null)[] = venues.map(() => null);
  /** Each venue's queue lane, laid when its field is and dropped with it. */
  let lanes: (readonly QueueSpot[] | null)[] = venues.map(() => null);
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
   * One sweep out from a building's doors, venue or lodging alike, counted for
   * the stats readout. The two caches differ only in where they keep the answer.
   */
  const sweepFrom = (footprint: Venue | Lodging): { doors: VenueDoors; field: FlowField } => {
    const doors = doorsFor(footprint, index);
    built++;
    return { doors, field: flowFieldFor(network, doors.nodes) };
  };

  const fieldFor = (venue: number): FlowField => {
    const existing = fields[venue];
    if (existing) return existing;
    const declared = venues[venue]!;
    const { doors, field } = sweepFrom(declared);
    fields[venue] = field;
    lanes[venue] = longestLane(network, doors.nodes, declared);
    return field;
  };

  const homeFieldFor = (lodging: number): FlowField => {
    const existing = homeFields[lodging];
    if (existing) return existing;
    const { field } = sweepFrom(lodgings[lodging]!);
    homeFields[lodging] = field;
    return field;
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
      const field = fields[venue];
      if (!field) {
        const { x, z } = venues[venue]!;
        const node = network.nodes[at];
        return node ? Math.hypot(x - node.x, z - node.z) : Number.POSITIVE_INFINITY;
      }
      const hops = field.hops[at] ?? -1;
      return hops < 0 ? Number.POSITIVE_INFINITY : hops * TILE_VOXELS;
    };

  const queueLength = (venue: number): number => occupancy.queues[venue]?.length ?? 0;

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
   * there. Heading is kept as it was, which is the way they walked up.
   */
  const stand = (person: number, venue: number, door: number, waiting: boolean): void => {
    const people = crowd();
    const node = network.nodes[door]!;
    const lane = lanes[venue] ?? [];
    const spot =
      waiting && lane.length > 0
        ? lane[Math.min(occupancy.slot[person]!, lane.length - 1)]!
        : {
            x: venues[venue]!.x,
            z: venues[venue]!.z,
            y: node.y,
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

    // A line as long as the paving in front of the door is a full line, however
    // far short of the ceiling `arriveAt` counts to.
    const outcome =
      queueLength(goal) >= queueLimit(goal)
        ? 'balked'
        : arriveAt(occupancy, person, goal, venue.capacity, dwellTicksFor(venue), now);
    if (outcome === 'balked') {
      // The line was already as long as anybody will join. Their goal goes and
      // they decide again on this same node - and `chooseVenue` is handed the
      // same queue lengths, so the place that just turned them away is not a
      // candidate and they do not set off for it a second time.
      clearPartyGoal(goals, guests, person);
      return false;
    }
    doorOf[person] = at;
    stand(person, goal, at, outcome === 'waiting');
    return true;
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
    if (door >= 0 && door < network.nodes.length) releaseTo(crowd(), person, door);
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
    },

    rebuild(nextVenues, nextLodgings, nextNetwork) {
      venues = nextVenues;
      lodgings = nextLodgings;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      fields = nextVenues.map(() => null);
      lanes = nextVenues.map(() => null);
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
      occupancy = createOccupancy(guests.count, nextVenues.length);
      doorOf = new Int32Array(guests.count).fill(-1);
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
