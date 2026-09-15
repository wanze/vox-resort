/**
 * What joins wanting something to walking towards it.
 *
 * `chooseVenue.ts` says where a guest would go and `flowField.ts` says which way
 * that is from here; this is the one module that holds both, and it is the only
 * thing the crowd ever calls. Everything about needs and venues stops at this
 * boundary: `crowd.ts` is handed a function of `(person, node) -> node` and does
 * not learn what a bakery is. See `CrowdOptions.routeOf`.
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
 * ## Everything is thrown away when the graph is
 *
 * A node index means nothing across a rebuild, so {@link Router.rebuild} drops
 * the fields and the goals together. A field kept across an edit is the one bug
 * this design can have, and it shows up as guests walking confidently into a
 * wall.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Guests } from '../../guests/domain/guests';
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
import type { Venue } from './venues';

export interface Router {
  /**
   * Where this person should walk from the node they just reached, or -1 to let
   * the crowd wander as it always has.
   *
   * Called once per arrival per person, which is a handful of calls a frame
   * across the whole plot. Everything expensive - the fields - is memoised
   * behind it.
   */
  step(person: number, at: number): number;
  /** Throws away every field and every goal: the graph or the venues changed. */
  rebuild(venues: readonly Venue[], network: WalkNetwork): void;
  /** How many fields have actually been built, for the stats readout. */
  readonly fieldCount: number;
  /** The venue a person is heading for, or null. Read by the inspector. */
  goalOf(person: number): Venue | null;
}

export function createRouter(parts: {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly venues: readonly Venue[];
  readonly network: WalkNetwork;
  /** Where a person is standing, in world voxels; the crowd's own columns. */
  readonly positionOf: (person: number) => { readonly x: number; readonly z: number };
}): Router {
  const { guests, needs, positionOf } = parts;
  const goals: Goals = createGoals(guests.count);

  let venues = parts.venues;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  /** One entry per venue, filled in on the first guest who walks to that one. */
  let fields: (FlowField | null)[] = venues.map(() => null);
  let built = 0;

  const fieldFor = (venue: number): FlowField => {
    const existing = fields[venue];
    if (existing) return existing;
    const field = flowFieldFor(network, doorNodesFor(venues[venue]!, index));
    fields[venue] = field;
    built++;
    return field;
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

  /** Decides where this person goes next, and sets their party going with them. */
  const decide = (person: number, at: number): void => {
    const { x, z } = positionOf(person);
    const choice = chooseVenue({
      needs,
      guests,
      person,
      venues,
      x,
      z,
      walkingDistance: walkingDistanceAt(at),
    });
    if (choice) setPartyGoal(goals, guests, person, choice);
  };

  /**
   * Whether this arrival is the one the person was walking towards, and what
   * happens if it is.
   *
   * A source's own entry in its field is itself, which is how a node is known to
   * be one of the venue's doors without anything holding a door list per person.
   *
   * **The visit takes no time at all.** Capacity, the queue at the door and the
   * dwell inside go exactly here, and they are plan 018; the goal is let go on
   * the same arrival, so a guest who has just eaten decides afresh and walks on
   * rather than standing in the doorway.
   */
  const arriveIfThere = (person: number, at: number): void => {
    const goal = goals.venue[person]!;
    if (goal === NO_GOAL || goal >= venues.length) return;
    if (fieldFor(goal).next[at] !== at) return;
    relieve(needs, person, venues[goal]!.satisfies);
    clearPartyGoal(goals, guests, person);
  };

  return {
    step(person, at) {
      if (person < 0 || person >= goals.count) return -1;
      arriveIfThere(person, at);
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

    rebuild(nextVenues, nextNetwork) {
      venues = nextVenues;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      fields = nextVenues.map(() => null);
      built = 0;
      // Everybody, not only the parties whose venue went: a goal is an index
      // into the venue list that has just been replaced, over nodes that have
      // just been renumbered, so none of them means anything now.
      clearAllGoals(goals);
    },

    get fieldCount() {
      return built;
    },

    goalOf(person) {
      if (person < 0 || person >= goals.count) return null;
      const goal = goals.venue[person]!;
      return goal === NO_GOAL ? null : (venues[goal] ?? null);
    },
  };
}
