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
 * ## Everything is thrown away when the graph is
 *
 * A node index means nothing across a rebuild, so {@link Router.rebuild} drops
 * the fields, the goals and the occupancy together. A field kept across an edit
 * is the one bug this design can have, and it shows up as guests walking
 * confidently into a wall.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { holdAt, releaseTo, type Crowd } from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Guests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { chooseVenue } from './chooseVenue';
import { doorNodesFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import {
  clearAllGoals,
  clearPartyGoal,
  createGoals,
  NO_GOAL,
  setPartyGoal,
  type Goals,
} from './goals';
import { relieve, type Needs } from './needs';
import { arriveAt, createOccupancy, sweepOccupancy, VISIT, type Occupancy } from './occupancy';
import { queueSpotAt } from './queueSpot';
import type { Venue } from './venues';

/**
 * Simulated seconds one tick covers: a tick is a simulated minute, which is
 * `simClock.ts`'s own `TICK_SIM_SECONDS`. Named again here rather than imported,
 * because that one is private to the clock and turning a declared dwell into
 * ticks is this module's arithmetic rather than the calendar's.
 */
const TICK_SECONDS = 60;

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
  /** Throws away every field, every goal and every visit: the graph changed. */
  rebuild(venues: readonly Venue[], network: WalkNetwork): void;
  /** How many fields have actually been built, for the stats readout. */
  readonly fieldCount: number;
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
  readonly network: WalkNetwork;
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
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  /** One entry per venue, filled in on the first guest who walks to that one. */
  let fields: (FlowField | null)[] = venues.map(() => null);
  let built = 0;
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

  const fieldFor = (venue: number): FlowField => {
    const existing = fields[venue];
    if (existing) return existing;
    const field = flowFieldFor(network, doorNodesFor(venues[venue]!, index));
    fields[venue] = field;
    built++;
    return field;
  };

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
  const stand = (person: number, venue: Venue, door: number, waiting: boolean): void => {
    const people = crowd();
    const node = network.nodes[door]!;
    const spot = waiting
      ? queueSpotAt(node, venue, occupancy.slot[person]!)
      : { x: venue.x, z: venue.z, y: node.y, heading: people.heading[person] ?? 0 };
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

    const outcome = arriveAt(occupancy, person, goal, venue.capacity, dwellTicksFor(venue), now);
    if (outcome === 'balked') {
      // The line was already as long as anybody will join. Their goal goes and
      // they decide again on this same node - and `chooseVenue` is handed the
      // same queue lengths, so the place that just turned them away is not a
      // candidate and they do not set off for it a second time.
      clearPartyGoal(goals, guests, person);
      return false;
    }
    doorOf[person] = at;
    stand(person, venue, at, outcome === 'waiting');
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

  return {
    step(person, at) {
      if (person < 0 || person >= goals.count) return -1;
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
        stand(person, venues[occupancy.at[person]!]!, doorOf[person]!, false);
      }
      for (const person of swept.moved) {
        stand(person, venues[occupancy.at[person]!]!, doorOf[person]!, true);
      }
    },

    rebuild(nextVenues, nextNetwork) {
      venues = nextVenues;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      fields = nextVenues.map(() => null);
      built = 0;
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
