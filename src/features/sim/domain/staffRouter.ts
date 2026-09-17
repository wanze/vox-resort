/**
 * Where a cleaner walks: to the dirtiest venue that wants cleaning, and then to
 * the next one.
 *
 * The same three pieces the guests' router is built from - `flowFieldFor` for
 * the way there, `doorsFor` for where "there" is, and `holdAt` for standing
 * still while working - assembled into a much smaller decision. What it is
 * **not** is a second copy of `router.ts`: a cleaner has no needs, never queues,
 * is never asleep and never leaves the plot, so none of that machinery appears
 * here.
 *
 * ## A second crowd, not a second kind of guest
 *
 * This file is the whole of what makes the staff different. They walk on
 * `crowd.ts`'s own code, with a `routeOf` of their own and nothing else - which
 * is the claim `crowd.ts` has made since plan 013, that it is about walking and
 * knows nothing about guests. It cost no change there.
 *
 * ## Its own fields, shared with nothing
 *
 * A field is per graph and per source set, and the guests' router memoises its
 * own behind a venue index of its own - which includes a synthetic beach this
 * file never sees. Two routers sweeping the same doors is a handful of
 * milliseconds once per venue walked to, and sharing them would mean one of the
 * two owning the other's memoisation across a rebuild.
 *
 * ## Nothing here is random but the length of a spell
 *
 * `docs/rendering.md` requires a bench run to replay the same scene, so the one
 * draw the staff make comes off a seeded generator, exactly as the guests'
 * dwells do.
 */

import { holdAt, releaseTo, type Crowd } from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { createRandom } from '../../layout/domain/random';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import type { Staff } from './staff';
import {
  cleanliness,
  dirtiest,
  NEEDS_CLEANING,
  scrub,
  SCRUB_PER_SPELL,
  type Upkeep,
} from './upkeep';
import type { Venue } from './venues';

/**
 * How long one spell of work lasts, in ticks, which are simulated minutes.
 *
 * About twenty minutes, drawn a little either way so two cleaners who set off
 * together do not finish on the same tick for ever. Long enough that a cleaner
 * is visibly *at* a venue rather than touching it and moving on, short enough
 * that three spells - a ruined venue back to spotless, see {@link SCRUB_PER_SPELL} -
 * is an hour of work and not an afternoon.
 */
const SPELL_TICKS = { min: 15, max: 25 } as const;

/** Nobody is assigned to this venue, and nothing is assigned to this worker. */
const NOBODY = -1;

export interface StaffRouter {
  /** Where this worker walks from the node they just reached, or -1 to wander. */
  step(worker: number, at: number): number;
  /** One tick: whoever has finished a spell of work leaves it cleaner and moves on. */
  tick(now: number): void;
  /** Throws away every field and every assignment: the graph changed. */
  rebuild(venues: readonly Venue[], network: WalkNetwork): void;
  /** What each worker is doing, for the inspector and the stats row. */
  atWork(worker: number): Venue | null;
  readonly workingCount: number;
}

export function createStaffRouter(parts: {
  readonly staff: Staff;
  readonly venues: readonly Venue[];
  readonly network: WalkNetwork;
  /** How clean each venue is, late-bound for the reason `router.ts` takes it so. */
  readonly upkeep: () => Upkeep;
  /** The staff crowd as it stands, late-bound: it is built with this router. */
  readonly crowd: () => Crowd;
  /** What the length of each spell is drawn from; see {@link SPELL_TICKS}. */
  readonly seed: number;
}): StaffRouter {
  const { staff } = parts;
  const random = createRandom(parts.seed);

  let venues = parts.venues;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  /** One entry per venue, swept on the first worker who walks to that one. */
  let fields: (FlowField | null)[] = venues.map(() => null);
  /** Which worker is walking to or working at each venue, or {@link NOBODY}. */
  let claimedBy = new Int32Array(venues.length).fill(NOBODY);
  /** The venue each worker has taken, or {@link NOBODY}. */
  let assigned = new Int32Array(staff.count).fill(NOBODY);
  /** The tick each worker's spell of work ends on; only read while working. */
  let until = new Int32Array(staff.count);
  /** 1 for somebody standing at a venue working on it. */
  let working = new Uint8Array(staff.count);
  /** The node each worker walked in by, so the spell ends where it began. */
  let doorOf = new Int32Array(staff.count).fill(NOBODY);
  let workingCount = 0;
  let now = 0;

  /** How long one spell lasts, off the seeded generator; see {@link SPELL_TICKS}. */
  const spellTicks = (): number =>
    SPELL_TICKS.min + Math.round(random() * (SPELL_TICKS.max - SPELL_TICKS.min));

  /**
   * The venue's field, swept on first use.
   *
   * A venue whose doors reach no paving sweeps to a field of -1 throughout,
   * which reads as "no way there from anywhere" at every node and is exactly
   * how {@link pick} comes to pass over it. The same `doorsFor` the guests'
   * router uses, so a venue a guest can reach is one a cleaner can.
   */
  const fieldFor = (venue: number): FlowField =>
    (fields[venue] ??= flowFieldFor(network, doorsFor(venues[venue]!, index).nodes));

  /**
   * The dirtiest venue this worker could actually get to from `at`, claimed for
   * them, or {@link NOBODY}.
   *
   * Dirtiest first and then downwards, so the field of a venue nothing can walk
   * to is swept once and the next one down is taken instead - rather than every
   * venue on the plot being swept to answer one worker.
   */
  const pick = (worker: number, at: number): number => {
    const passedOver = new Set<number>();
    for (let attempt = 0; attempt < venues.length; attempt++) {
      const venue = dirtiest(
        parts.upkeep(),
        (each) => claimedBy[each] === NOBODY && !passedOver.has(each),
        NEEDS_CLEANING,
      );
      if (venue < 0) return NOBODY;
      if (fieldFor(venue).next[at]! >= 0) {
        claimedBy[venue] = worker;
        assigned[worker] = venue;
        return venue;
      }
      passedOver.add(venue);
    }
    return NOBODY;
  };

  /**
   * Stands a worker at the venue they have reached and starts their spell.
   *
   * The middle of the footprint at the door node's height, exactly as a guest
   * inside a venue is stood: a cleaner at work should be under the roof rather
   * than in the doorway, and a venue knows where its middle is and not how high
   * the ground is there.
   */
  const setToWork = (worker: number, venue: number, door: number): void => {
    const people = parts.crowd();
    const place = venues[venue]!;
    holdAt(people, worker, place.x, network.nodes[door]!.y, place.z, people.heading[worker] ?? 0);
    doorOf[worker] = door;
    until[worker] = now + spellTicks();
    working[worker] = 1;
    workingCount++;
  };

  /** The end of one spell: the venue is that much cleaner and the worker is free. */
  const finish = (worker: number): void => {
    const venue = assigned[worker]!;
    scrub(parts.upkeep(), venue, SCRUB_PER_SPELL);
    claimedBy[venue] = NOBODY;
    assigned[worker] = NOBODY;
    working[worker] = 0;
    workingCount--;
    const door = doorOf[worker]!;
    doorOf[worker] = NOBODY;
    // Back onto the graph where they came in, and the next arrival is where
    // they decide again - which is `step`, and not a second decision here.
    if (door >= 0 && door < network.nodes.length) releaseTo(parts.crowd(), worker, door);
  };

  /** Gives up a venue a worker can no longer get to, so somebody else may take it. */
  const giveUp = (worker: number): void => {
    const venue = assigned[worker]!;
    if (venue >= 0 && claimedBy[venue] === worker) claimedBy[venue] = NOBODY;
    assigned[worker] = NOBODY;
  };

  return {
    step(worker, at) {
      // Somebody at work is held, so the crowd never asks; the guard is here
      // because a rebuild can let go of anybody at any moment.
      if (working[worker] === 1 || at < 0) return -1;
      const venue = assigned[worker]! >= 0 ? assigned[worker]! : pick(worker, at);
      if (venue < 0) return -1;
      const onward = fieldFor(venue).next[at] ?? -1;
      // The graph no longer reaches it from here: let it go rather than stand
      // still, and wander until the next arrival asks again.
      if (onward < 0) {
        giveUp(worker);
        return -1;
      }
      if (onward !== at) return onward;
      setToWork(worker, venue, at);
      return -1;
    },

    tick(at) {
      now = at;
      if (workingCount === 0) return;
      for (let worker = 0; worker < staff.count; worker++) {
        if (working[worker] === 1 && now >= until[worker]!) finish(worker);
      }
    },

    rebuild(nextVenues, nextNetwork) {
      venues = nextVenues;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      // Every field: a node index means nothing on the graph that has just
      // replaced them. Every claim with them: a venue index means nothing
      // either, and a claim left standing would hold a venue nobody is walking
      // to against every cleaner on the plot.
      fields = venues.map(() => null);
      claimedBy = new Int32Array(venues.length).fill(NOBODY);
      assigned = new Int32Array(staff.count).fill(NOBODY);
      until = new Int32Array(staff.count);
      working = new Uint8Array(staff.count);
      doorOf = new Int32Array(staff.count).fill(NOBODY);
      workingCount = 0;
      // Nobody is let go here, for the reason `router.ts` lets nobody go: the
      // crowd is relocated onto the new graph in the same breath, which is what
      // puts whoever was held back on it.
    },

    atWork(worker) {
      if (working[worker] !== 1) return null;
      return venues[assigned[worker]!] ?? null;
    },

    get workingCount() {
      return workingCount;
    },
  };
}

/** The mean cleanliness of the venues standing, or 1 on a plot with none. */
export function meanCleanliness(upkeep: Upkeep, venues: number): number {
  if (venues <= 0) return 1;
  let total = 0;
  for (let venue = 0; venue < venues; venue++) total += cleanliness(upkeep, venue);
  return total / venues;
}
