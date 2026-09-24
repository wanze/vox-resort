import { holdAt, releaseTo, type Crowd } from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { createRandom } from '../../layout/domain/random';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import { mostLittered, sweep, SWEEP_ABOVE, type Litter } from './litter';
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

// A sweep is a broom along one tile, shorter than scrubbing a venue.
const SWEEP_TICKS = { min: 4, max: 8 } as const;

// Tasks are few, so a handful of fields covers them; a map that grows for a week is a leak.
const MAX_TILE_FIELDS = 64;

// A plot in pieces could otherwise sweep a field per littered tile on every step.
const MAX_TILE_TRIES = 8;

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
  // Late-bound: the roster follows the plot. Omitted, everybody is on duty.
  readonly duty?: () => Uint8Array;
  // Late-bound for the reason upkeep is. Omitted, nothing is ever swept.
  readonly litter?: () => Litter;
  // Seeded so a bench run replays the same scene.
  readonly seed: number;
}): StaffRouter {
  const { staff } = parts;
  const random = createRandom(parts.seed);
  const weatherNow = parts.weather ?? ((): Weather => 'clear');
  const isOnDuty = (worker: number): boolean => (parts.duty?.()[worker] ?? 1) === 1;

  let venues = parts.venues;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  let fields: (FlowField | null)[] = venues.map(() => null);
  let claimedBy = new Int32Array(venues.length).fill(NOBODY);
  let assigned = new Int32Array(staff.count).fill(NOBODY);
  let until = new Int32Array(staff.count);
  let working = new Uint8Array(staff.count);
  let doorOf = new Int32Array(staff.count).fill(NOBODY);
  // Apart from the venue claims: a tile index and a venue index are different numbers.
  let tileOf = new Int32Array(staff.count).fill(NOBODY);
  let tileClaimedBy = new Int32Array(0);
  const tileFields = new Map<number, FlowField>();
  let workingCount = 0;
  let now = 0;

  const ticksIn = (range: { readonly min: number; readonly max: number }): number =>
    range.min + Math.round(random() * (range.max - range.min));

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
    until[worker] = now + ticksIn(SPELL_TICKS);
    working[worker] = 1;
    workingCount++;
  };

  // Sized to the litter grid on first use, which is not known until the resort is.
  const tileClaims = (litter: Litter): Int32Array => {
    if (tileClaimedBy.length !== litter.level.length) {
      tileClaimedBy = new Int32Array(litter.level.length).fill(NOBODY);
    }
    return tileClaimedBy;
  };

  const nodeOnTile = (litter: Litter, tile: number): number =>
    index.at(tile % litter.tilesX, Math.floor(tile / litter.tilesX))?.[0] ?? NOBODY;

  const tileFieldFor = (node: number): FlowField => {
    const known = tileFields.get(node);
    if (known) return known;
    if (tileFields.size >= MAX_TILE_FIELDS) tileFields.clear();
    const field = flowFieldFor(network, [node]);
    tileFields.set(node, field);
    return field;
  };

  const pickTile = (worker: number, at: number, litter: Litter): number => {
    const claims = tileClaims(litter);
    const passedOver = new Set<number>();
    for (let attempt = 0; attempt < MAX_TILE_TRIES; attempt++) {
      const tile = mostLittered(
        litter,
        (each) => claims[each] === NOBODY && !passedOver.has(each) && nodeOnTile(litter, each) >= 0,
        SWEEP_ABOVE,
      );
      if (tile < 0) return NOBODY;
      if (tileFieldFor(nodeOnTile(litter, tile)).next[at]! >= 0) {
        claims[tile] = worker;
        tileOf[worker] = tile;
        return tile;
      }
      passedOver.add(tile);
    }
    return NOBODY;
  };

  const giveUpTile = (worker: number): void => {
    const tile = tileOf[worker]!;
    if (tile >= 0 && tileClaimedBy[tile] === worker) tileClaimedBy[tile] = NOBODY;
    tileOf[worker] = NOBODY;
  };

  const setToSweep = (worker: number, node: number): void => {
    const people = parts.crowd();
    const at = network.nodes[node]!;
    holdAt(people, worker, at.x, at.y, at.z, people.heading[worker] ?? 0);
    doorOf[worker] = node;
    until[worker] = now + ticksIn(SWEEP_TICKS);
    working[worker] = 1;
    workingCount++;
  };

  const stepToTile = (worker: number, at: number, litter: Litter): number => {
    const node = nodeOnTile(litter, tileOf[worker]!);
    const onward = node >= 0 ? (tileFieldFor(node).next[at] ?? -1) : -1;
    if (onward < 0) {
      giveUpTile(worker);
      return -1;
    }
    if (onward !== at) return onward;
    setToSweep(worker, at);
    return -1;
  };

  // Only once no venue wants a cleaner: a dirty venue is worse than a dirty path.
  const litterStep = (worker: number, at: number): number => {
    const litter = parts.litter?.();
    if (!litter) return -1;
    if (tileOf[worker]! < 0 && pickTile(worker, at, litter) < 0) return -1;
    return stepToTile(worker, at, litter);
  };

  const finishWork = (worker: number): void => {
    const tile = tileOf[worker]!;
    const litter = parts.litter?.();
    if (tile >= 0) {
      if (litter) sweep(litter, tile % litter.tilesX, Math.floor(tile / litter.tilesX));
      giveUpTile(worker);
      return;
    }
    const venue = assigned[worker]!;
    scrub(parts.upkeep(), venue, SCRUB_PER_SPELL);
    claimedBy[venue] = NOBODY;
    assigned[worker] = NOBODY;
  };

  const finish = (worker: number): void => {
    finishWork(worker);
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

  // A worker already sent to a tile sees it through before looking at venues again.
  const venueFor = (worker: number, at: number): number => {
    if (tileOf[worker]! >= 0) return NOBODY;
    return assigned[worker]! >= 0 ? assigned[worker]! : pick(worker, at);
  };

  const venueStep = (worker: number, at: number, venue: number): number => {
    const onward = fieldFor(venue).next[at] ?? -1;
    if (onward < 0) {
      giveUp(worker);
      return -1;
    }
    if (onward !== at) return onward;
    setToWork(worker, venue, at);
    return -1;
  };

  return {
    step(worker, at) {
      // A rebuild can let go of anybody at any moment, hence the guard.
      if (working[worker] === 1 || at < 0 || !isOnDuty(worker)) return -1;
      const venue = venueFor(worker, at);
      return venue < 0 ? litterStep(worker, at) : venueStep(worker, at, venue);
    },

    tick(at) {
      now = at;
      if (workingCount === 0) return;
      for (let worker = 0; worker < staff.count; worker++) {
        // Let off duty mid-spell, they finish it: a half-scrubbed venue would keep its claim for ever.
        const done = now >= until[worker]! || !isOnDuty(worker);
        if (working[worker] === 1 && done) finish(worker);
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
      tileOf = new Int32Array(staff.count).fill(NOBODY);
      tileClaimedBy = new Int32Array(0);
      tileFields.clear();
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
