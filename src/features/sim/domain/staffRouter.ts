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
import { shelterOf, type Venue } from './venues';
import { isOpenIn, weatherEffect, type Weather } from './weather';

// In ticks (simulated minutes), drawn either way so cleaners who set off together do not finish together for ever.
const SPELL_TICKS = { min: 15, max: 25 } as const;

const NOBODY = -1;

export interface StaffRouter {
  step(worker: number, at: number): number;
  tick(now: number): void;
  rebuild(venues: readonly Venue[], network: WalkNetwork): void;
  atWork(worker: number): Venue | null;
  readonly workingCount: number;
}

export function createStaffRouter(parts: {
  readonly staff: Staff;
  readonly venues: readonly Venue[];
  readonly network: WalkNetwork;
  readonly upkeep: () => Upkeep;
  // Late-bound: it is built with this router.
  readonly crowd: () => Crowd;
  // A venue the rain has shut gets no cleaner; it is scrubbed when it reopens.
  readonly weather?: () => Weather;
  // Seeded so a bench run replays the same scene.
  readonly seed: number;
}): StaffRouter {
  const { staff } = parts;
  const random = createRandom(parts.seed);
  const weatherNow = parts.weather ?? ((): Weather => 'clear');

  let venues = parts.venues;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  let fields: (FlowField | null)[] = venues.map(() => null);
  let claimedBy = new Int32Array(venues.length).fill(NOBODY);
  let assigned = new Int32Array(staff.count).fill(NOBODY);
  let until = new Int32Array(staff.count);
  let working = new Uint8Array(staff.count);
  let doorOf = new Int32Array(staff.count).fill(NOBODY);
  let workingCount = 0;
  let now = 0;

  const spellTicks = (): number =>
    SPELL_TICKS.min + Math.round(random() * (SPELL_TICKS.max - SPELL_TICKS.min));

  // A venue whose doors reach no paving sweeps to -1 throughout, which is how pick passes over it.
  const fieldFor = (venue: number): FlowField =>
    (fields[venue] ??= flowFieldFor(network, doorsFor(venues[venue]!, index).nodes));

  // Dirtiest first, so an unreachable venue is swept once instead of every venue being swept per worker.
  const pick = (worker: number, at: number): number => {
    const passedOver = new Set<number>();
    for (let attempt = 0; attempt < venues.length; attempt++) {
      const effect = weatherEffect(weatherNow());
      const venue = dirtiest(
        parts.upkeep(),
        (each) =>
          claimedBy[each] === NOBODY &&
          !passedOver.has(each) &&
          isOpenIn(shelterOf(venues[each]!), effect),
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

  // The middle of the footprint, so a cleaner at work is under the roof rather than in the doorway.
  const setToWork = (worker: number, venue: number, door: number): void => {
    const people = parts.crowd();
    const place = venues[venue]!;
    holdAt(people, worker, place.x, network.nodes[door]!.y, place.z, people.heading[worker] ?? 0);
    doorOf[worker] = door;
    until[worker] = now + spellTicks();
    working[worker] = 1;
    workingCount++;
  };

  const finish = (worker: number): void => {
    const venue = assigned[worker]!;
    scrub(parts.upkeep(), venue, SCRUB_PER_SPELL);
    claimedBy[venue] = NOBODY;
    assigned[worker] = NOBODY;
    working[worker] = 0;
    workingCount--;
    const door = doorOf[worker]!;
    doorOf[worker] = NOBODY;
    if (door >= 0 && door < network.nodes.length) releaseTo(parts.crowd(), worker, door);
  };

  const giveUp = (worker: number): void => {
    const venue = assigned[worker]!;
    if (venue >= 0 && claimedBy[venue] === worker) claimedBy[venue] = NOBODY;
    assigned[worker] = NOBODY;
  };

  return {
    step(worker, at) {
      // A rebuild can let go of anybody at any moment, hence the guard.
      if (working[worker] === 1 || at < 0) return -1;
      const venue = assigned[worker]! >= 0 ? assigned[worker]! : pick(worker, at);
      if (venue < 0) return -1;
      const onward = fieldFor(venue).next[at] ?? -1;
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
      // Node and venue indices mean nothing on the new graph, and a stale claim would hold a venue against every cleaner.
      fields = venues.map(() => null);
      claimedBy = new Int32Array(venues.length).fill(NOBODY);
      assigned = new Int32Array(staff.count).fill(NOBODY);
      until = new Int32Array(staff.count);
      working = new Uint8Array(staff.count);
      doorOf = new Int32Array(staff.count).fill(NOBODY);
      workingCount = 0;
      // Nobody is released: the crowd is relocated onto the new graph in the same step.
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

export function meanCleanliness(upkeep: Upkeep, venues: number): number {
  if (venues <= 0) return 1;
  let total = 0;
  for (let venue = 0; venue < venues; venue++) total += cleanliness(upkeep, venue);
  return total / venues;
}
