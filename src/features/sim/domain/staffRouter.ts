import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  holdAt,
  holdOnSeat,
  ON_SAND,
  releaseTo,
  walkSandTo,
  type Crowd,
} from '../../crowd/domain/crowd';
import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import { blockedAt } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { createRandom, resumeRandom } from '../../layout/domain/random';
import { brokenFirst, isBroken, repair, type Breakdowns } from './breakdowns';
import type { Depot } from './depots';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import type { Lodging } from './lodgings';
import { mostLittered, sweep, SWEEP_ABOVE, type Litter } from './litter';
import { SAND_ROUTE_TILES } from './router';
import { sandRoutesFor, type SandPoint, type SandRoute } from './sandRoute';
import type { Staff } from './staff';
import { staffVenuesMatch, type StaffRouterSnapshot } from './staffRouterSnapshot';
import {
  cleanliness,
  dirtiest,
  NEEDS_CLEANING,
  scrub,
  SCRUB_PER_SPELL,
  type Upkeep,
} from './upkeep';
import { shelterOf, type Venue } from './venues';
import { isOpenIn, weatherEffect, type Weather, type WeatherEffect } from './weather';
import { NO_ZONE } from './zones';

// In ticks (simulated minutes), drawn either way so cleaners who set off together do not finish together for ever.
const SPELL_TICKS = { min: 15, max: 25 } as const;

// One room a spell, so a hotel after a busy morning is several spells, not one.
export const BEDS_PER_SPELL = 4;

// Four spells is a morning's round; a sweep needs no supplies, so it takes none.
export const SPELLS_PER_LOAD = 4;

// A quick stop at the shelves: the walk there and back is what a restock costs.
const RESTOCK_TICKS = { min: 5, max: 10 } as const;

// A sweep is a broom along one tile, shorter than scrubbing a venue.
const SWEEP_TICKS = { min: 4, max: 8 } as const;

// A show is an hour or two.
const SHOW_TICKS = { min: 60, max: 120 } as const;

// About an hour: long enough that a breakdown is felt, short enough for one mechanic to see
// several in a day.
export const REPAIR_TICKS = { min: 30, max: 60 } as const;

// A lifeguard's spell never runs out: only the weather, the roster or an edit moves them.
const FOR_EVER = 0x7fffffff;

// Tasks are few, so a handful of fields covers them; a map that grows for a week is a leak.
const MAX_NODE_FIELDS = 64;

// A plot in pieces could otherwise sweep a field per littered tile on every step.
const MAX_TILE_TRIES = 8;

// The seat is inside the tower's own footprint, which the sand grid blocks, so the leg ends on
// open sand beside it and the last step is the ladder.
const FOOT_REACH = [0.75, 1.25].map((tiles) => tiles * TILE_VOXELS);

const COMPASS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

const NOBODY = -1;

export interface StaffZones {
  readonly zoneOf: Int8Array;
  // A bitmask per venue, from zonesOf.
  readonly venueZones: Int32Array;
  // The same per lodging. Omitted, a zoned cleaner makes up no room.
  readonly lodgingZones?: Int32Array;
  readonly tileZone: (tileX: number, tileZ: number) => number;
}

export const STAFF_TASK_KINDS = [
  'off',
  'idle',
  'venue',
  'room',
  'sweep',
  'restock',
  'tower',
  'home',
] as const;

export type StaffTaskKind = (typeof STAFF_TASK_KINDS)[number];

// Mutable so a caller asking every frame can hand the same one back. An index is -1 where the
// task has none: a venue, a room's lodging, a litter tile, a tower's seat, a depot restocked in.
export interface StaffTask {
  kind: StaffTaskKind;
  venue: number;
  lodging: number;
  tile: number;
  seat: number;
  depot: number;
  // At it rather than on the way there.
  working: boolean;
  // Spells left in a cleaner's cart.
  load: number;
  // Sent there by an order rather than by their own choice.
  ordered: boolean;
}

export const createStaffTask = (): StaffTask => ({
  kind: 'off',
  venue: -1,
  lodging: -1,
  tile: -1,
  seat: -1,
  depot: -1,
  working: false,
  load: 0,
  ordered: false,
});

export type OrderRole = 'mechanic' | 'cleaner';

export type OrderTarget = { readonly venue: number } | { readonly tile: number };

// A tile is an index into the litter grid, tileZ * tilesX + tileX. Reserved for the nearest
// free worker until they step, taken once they have claimed the target.
export interface Order {
  readonly role: OrderRole;
  readonly venue: number;
  readonly tile: number;
  readonly worker: number;
  readonly taken: boolean;
}

// A handful is all a player gives at once; more would be a second job queue.
const MAX_ORDERS = 8;

export interface StaffRouter {
  step(worker: number, at: number): number;
  tick(now: number): void;
  rebuild(
    venues: readonly Venue[],
    network: WalkNetwork,
    lodgings?: readonly Lodging[],
    depots?: readonly Depot[],
  ): void;
  clockOn(worker: number): void;
  // Idempotent: a shift change lists a worker still walking home as leaving on every edit.
  clockOff(worker: number): void;
  atWork(worker: number): Venue | null;
  // A read for the HUD: what the worker is doing, without changing what they will do.
  taskOf(worker: number, into?: StaffTask): StaffTask;
  performingAt(venue: number): boolean;
  watching(venue: number): boolean;
  readonly watchingBeach: boolean;
  readonly workingCount: number;
  snapshot(): StaffRouterSnapshot;
  // Onto a router built on the venues and network the snapshot was taken on; throws otherwise.
  restore(snapshot: StaffRouterSnapshot): void;
  // False when it cannot be given: nothing to do there, already ordered, or too many open.
  order(role: OrderRole, target: OrderTarget): boolean;
  // The same array until an order is given, taken or ended, so a caller can compare it.
  ordersOf(): readonly Order[];
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
  // Late-bound for the reason upkeep is. Omitted, nothing is ever broken.
  readonly breakdowns?: () => Breakdowns;
  // Late-bound: the roster follows the plot. Omitted, everybody is on duty.
  readonly duty?: () => Uint8Array;
  // Late-bound for the reason upkeep is. Omitted, nothing is ever swept.
  readonly litter?: () => Litter;
  // Guests inside a venue, from the guests' router. Omitted, every stage and pool is as busy.
  readonly occupants?: (venue: number) => number;
  // Late-bound: painting or hiring deals the staff afresh. Omitted, nobody is zoned.
  readonly zones?: () => StaffZones;
  // Omitted, no lodging is ever made up.
  readonly lodgings?: readonly Lodging[];
  // Late-bound: the beds live on the guests, which a load replaces in place.
  readonly beds?: () => {
    readonly unmadeAt: (lodging: number) => number;
    readonly make: (lodging: number, most: number) => void;
  };
  // Omitted, and with no supply node, a cleaner restocks where they stand.
  readonly depots?: readonly Depot[];
  // Late-bound: the entrance moves with an edit. Where supplies come in with no depot.
  readonly supplyNode?: () => number;
  // Omitted, a worker let go walks home and stays on the plot.
  readonly onClockedOff?: (worker: number) => void;
  // Seeded so a bench run replays the same scene.
  readonly seed: number;
}): StaffRouter {
  const { staff } = parts;
  let random = createRandom(parts.seed);
  const weatherNow = parts.weather ?? ((): Weather => 'clear');
  const isOnDuty = (worker: number): boolean => (parts.duty?.()[worker] ?? 1) === 1;
  const isBrokenDown = (venue: number): boolean => {
    const breakdowns = parts.breakdowns?.();
    return breakdowns !== undefined && isBroken(breakdowns, venue);
  };

  let venues = parts.venues;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  let fields: (FlowField | null)[] = venues.map(() => null);
  let claimedBy = new Int32Array(venues.length).fill(NOBODY);
  // Apart from the cleaners' claims: a cleaner may scrub a venue while a show is on.
  let showBy = new Int32Array(venues.length).fill(NOBODY);
  let watchedBy = new Int32Array(venues.length).fill(NOBODY);
  let repairBy = new Int32Array(venues.length).fill(NOBODY);
  let assigned = new Int32Array(staff.count).fill(NOBODY);
  let until = new Int32Array(staff.count);
  let working = new Uint8Array(staff.count);
  let doorOf = new Int32Array(staff.count).fill(NOBODY);
  // Apart from the venue claims: a tile index and a venue index are different numbers.
  let tileOf = new Int32Array(staff.count).fill(NOBODY);
  let tileClaimedBy = new Int32Array(0);
  let lodgings = parts.lodgings ?? [];
  // Apart from the venue claims too: a lodging index is not a venue index.
  let roomOf = new Int32Array(staff.count).fill(NOBODY);
  let roomBy = new Int32Array(lodgings.length).fill(NOBODY);
  let roomFields: (FlowField | null)[] = lodgings.map(() => null);
  let lastStage = new Int32Array(staff.count).fill(NOBODY);
  let sheltering = new Uint8Array(staff.count);
  let towerOf = new Int32Array(staff.count).fill(NOBODY);
  let legOf = new Int32Array(staff.count);
  let legRoute: (SandRoute | null)[] = Array.from({ length: staff.count }, () => null);
  // Per body rather than per node, so kept across a rebuild: an edit must not refill every cart.
  let load = new Uint8Array(staff.count).fill(SPELLS_PER_LOAD);
  let restocking = new Uint8Array(staff.count);
  let goingHome = new Uint8Array(staff.count);
  let depots = parts.depots ?? [];
  // Undefined until swept; null when no depot door reaches the paving.
  let depotField: FlowField | null | undefined;
  const depotAtNode = new Map<number, number>();
  const towerBy = new Map<number, number>();
  const towerRoutes = new Map<number, readonly SandRoute[]>();
  const venueSandRoutes = new Map<number, readonly SandRoute[]>();
  const nodeFields = new Map<number, FlowField>();
  let workingCount = 0;
  let now = 0;

  const ticksIn = (range: { readonly min: number; readonly max: number }): number =>
    range.min + Math.round(random() * (range.max - range.min));

  // A venue whose doors reach no paving sweeps to -1 throughout, which is how pick passes over it.
  const fieldFor = (venue: number): FlowField =>
    (fields[venue] ??= flowFieldFor(network, doorsFor(venues[venue]!, index).nodes));

  // Asked once per choice rather than per candidate: the zones are dealt afresh by every paint.
  const zonedFor = (worker: number): StaffZones | null => {
    const zones = parts.zones?.();
    return zones && (zones.zoneOf[worker] ?? NO_ZONE) !== NO_ZONE ? zones : null;
  };

  const venueInZone = (worker: number): ((venue: number) => boolean) => {
    const zones = zonedFor(worker);
    if (!zones) return () => true;
    const zone = zones.zoneOf[worker]!;
    return (venue) => (((zones.venueZones[venue] ?? 0) >> zone) & 1) === 1;
  };

  const lodgingInZone = (worker: number): ((lodging: number) => boolean) => {
    const zones = zonedFor(worker);
    if (!zones) return () => true;
    const zone = zones.zoneOf[worker]!;
    return (lodging) => (((zones.lodgingZones?.[lodging] ?? 0) >> zone) & 1) === 1;
  };

  const tileInZone = (worker: number): ((tileX: number, tileZ: number) => boolean) => {
    const zones = zonedFor(worker);
    if (!zones) return () => true;
    const zone = zones.zoneOf[worker]!;
    return (tileX, tileZ) => zones.tileZone(tileX, tileZ) === zone;
  };

  const claimsOf = (worker: number): Int32Array => {
    const role = staff.role[worker];
    if (role === 'animator') return showBy;
    if (role === 'mechanic') return repairBy;
    return role === 'lifeguard' ? watchedBy : claimedBy;
  };

  const claim = (worker: number, venue: number): number => {
    if (venue < 0) return NOBODY;
    claimsOf(worker)[venue] = worker;
    assigned[worker] = venue;
    return venue;
  };

  // Dirtiest first, so an unreachable venue is swept once instead of every venue being swept per worker.
  const pick = (worker: number, at: number): number => {
    const passedOver = new Set<number>();
    const inZone = venueInZone(worker);
    for (let attempt = 0; attempt < venues.length; attempt++) {
      const effect = weatherEffect(weatherNow());
      const venue = dirtiest(
        parts.upkeep(),
        (each) =>
          claimedBy[each] === NOBODY &&
          !passedOver.has(each) &&
          inZone(each) &&
          !isBrokenDown(each) &&
          isOpenIn(shelterOf(venues[each]!), effect),
        NEEDS_CLEANING,
      );
      if (venue < 0) return NOBODY;
      if (fieldFor(venue).next[at]! >= 0) return claim(worker, venue);
      passedOver.add(venue);
    }
    return NOBODY;
  };

  // The busiest first: a show or a watch is worth most where most guests are. Guests are counted
  // before the field is swept, so only a better candidate costs a sweep.
  const busiest = (at: number, eligible: (venue: number) => boolean): number => {
    let best = NOBODY;
    let most = -1;
    for (let venue = 0; venue < venues.length; venue++) {
      if (!eligible(venue)) continue;
      const inside = parts.occupants?.(venue) ?? 0;
      if (inside <= most || fieldFor(venue).next[at]! < 0) continue;
      best = venue;
      most = inside;
    }
    return best;
  };

  const stageFree = (
    venue: number,
    effect: WeatherEffect,
    inZone: (venue: number) => boolean,
  ): boolean => {
    const place = venues[venue]!;
    return (
      place.stage === true &&
      inZone(venue) &&
      showBy[venue] === NOBODY &&
      !isBrokenDown(venue) &&
      isOpenIn(shelterOf(place), effect)
    );
  };

  // The last stage only when nothing else is free, so a show moves round the plot.
  const pickStage = (worker: number, at: number): number => {
    const effect = weatherEffect(weatherNow());
    const last = lastStage[worker]!;
    const inZone = venueInZone(worker);
    const elsewhere = busiest(at, (venue) => venue !== last && stageFree(venue, effect, inZone));
    if (elsewhere >= 0 || last < 0) return claim(worker, elsewhere);
    return claim(
      worker,
      busiest(at, (venue) => venue === last && stageFree(venue, effect, inZone)),
    );
  };

  const pickWater = (worker: number, at: number): number => {
    const effect = weatherEffect(weatherNow());
    const inZone = venueInZone(worker);
    const unwatched = (venue: number): boolean => {
      const place = venues[venue]!;
      return (
        place.bathing === true &&
        watchedBy[venue] === NOBODY &&
        inZone(venue) &&
        isOpenIn(shelterOf(place), effect)
      );
    };
    return claim(worker, busiest(at, unwatched));
  };

  // A beach building has no door on the paving, so a mechanic walks the last leg over the sand.
  const sandRouteTo = (venue: number, at: number): SandRoute | undefined => {
    let routes = venueSandRoutes.get(venue);
    if (!routes) {
      const sand = doorsFor(venues[venue]!, index, network).sand;
      routes = sandRoutesFor(network, sand, SAND_ROUTE_TILES);
      venueSandRoutes.set(venue, routes);
    }
    return routes.find((route) => nodeFieldFor(route.gate).next[at]! >= 0);
  };

  // Weather is no bar: a machine is mended under a roof or in the rain alike.
  const pickRepair = (worker: number, at: number): number => {
    const breakdowns = parts.breakdowns?.();
    if (!breakdowns) return NOBODY;
    const passedOver = new Set<number>();
    const inZone = venueInZone(worker);
    for (let attempt = 0; attempt < venues.length; attempt++) {
      const venue = brokenFirst(
        breakdowns,
        (each) =>
          each < venues.length &&
          repairBy[each] === NOBODY &&
          !passedOver.has(each) &&
          inZone(each),
      );
      if (venue < 0) return NOBODY;
      if (fieldFor(venue).next[at]! >= 0) return claim(worker, venue);
      const overSand = sandRouteTo(venue, at);
      if (overSand) {
        legRoute[worker] = overSand;
        return claim(worker, venue);
      }
      passedOver.add(venue);
    }
    return NOBODY;
  };

  const standAt = (worker: number, node: number): void => {
    const people = parts.crowd();
    const at = network.nodes[node]!;
    holdAt(people, worker, at.x, at.y, at.z, people.heading[worker] ?? 0);
  };

  // The middle of the footprint, so somebody at work is under the roof rather than in the doorway.
  const standIn = (
    worker: number,
    place: { readonly x: number; readonly z: number },
    door: number,
  ): void => {
    const people = parts.crowd();
    holdAt(people, worker, place.x, network.nodes[door]!.y, place.z, people.heading[worker] ?? 0);
  };

  const standInside = (worker: number, venue: number, door: number): void =>
    standIn(worker, venues[venue]!, door);

  const spellFor = (worker: number): number => {
    const role = staff.role[worker];
    if (role === 'lifeguard') return FOR_EVER;
    if (role === 'mechanic') return now + ticksIn(REPAIR_TICKS);
    return now + ticksIn(role === 'animator' ? SHOW_TICKS : SPELL_TICKS);
  };

  const roomFieldFor = (lodging: number): FlowField =>
    (roomFields[lodging] ??= flowFieldFor(network, doorsFor(lodgings[lodging]!, index).nodes));

  // The most unmade beds first: a bed that cannot be sold is worse than a dirty venue. Beds are
  // counted before the field is swept, so only a better candidate costs a sweep.
  const pickRoom = (worker: number, at: number): number => {
    const beds = parts.beds?.();
    if (!beds) return NOBODY;
    const inZone = lodgingInZone(worker);
    let best = NOBODY;
    let most = 0;
    for (let lodging = 0; lodging < lodgings.length; lodging++) {
      if (roomBy[lodging] !== NOBODY || !inZone(lodging)) continue;
      const unmade = beds.unmadeAt(lodging);
      if (unmade <= most || roomFieldFor(lodging).next[at]! < 0) continue;
      best = lodging;
      most = unmade;
    }
    if (best >= 0) {
      roomBy[best] = worker;
      roomOf[worker] = best;
    }
    return best;
  };

  const giveUpRoom = (worker: number): void => {
    const room = roomOf[worker]!;
    if (room >= 0 && roomBy[room] === worker) roomBy[room] = NOBODY;
    roomOf[worker] = NOBODY;
  };

  const setToMakeUp = (worker: number, room: number, door: number): void => {
    standIn(worker, lodgings[room]!, door);
    doorOf[worker] = door;
    until[worker] = now + ticksIn(SPELL_TICKS);
    working[worker] = 1;
    workingCount++;
  };

  const roomStep = (worker: number, at: number): number => {
    const room = roomOf[worker]!;
    const onward = roomFieldFor(room).next[at] ?? -1;
    if (onward < 0) {
      giveUpRoom(worker);
      return -1;
    }
    if (onward !== at) return onward;
    setToMakeUp(worker, room, at);
    return -1;
  };

  // Only a cleaner with nothing on hand looks for a room: one already sent somewhere sees it through.
  const roomFor = (worker: number, at: number): number => {
    if (roomOf[worker]! >= 0) return roomOf[worker]!;
    return assigned[worker]! < 0 && tileOf[worker]! < 0 ? pickRoom(worker, at) : NOBODY;
  };

  const setToWork = (worker: number, venue: number, door: number): void => {
    standInside(worker, venue, door);
    doorOf[worker] = door;
    until[worker] = spellFor(worker);
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

  const nodeFieldFor = (node: number): FlowField => {
    const known = nodeFields.get(node);
    if (known) return known;
    if (nodeFields.size >= MAX_NODE_FIELDS) nodeFields.clear();
    const field = flowFieldFor(network, [node]);
    nodeFields.set(node, field);
    return field;
  };

  const depotFieldNow = (): FlowField | null => {
    if (depotField !== undefined) return depotField;
    depotAtNode.clear();
    depots.forEach((depot, each) => {
      for (const node of doorsFor(depot, index).nodes) {
        if (!depotAtNode.has(node)) depotAtNode.set(node, each);
      }
    });
    const nodes = [...depotAtNode.keys()].toSorted((a, b) => a - b);
    depotField = nodes.length > 0 ? flowFieldFor(network, nodes) : null;
    return depotField;
  };

  // The entrance is asked afresh every time, as it moves with an edit that keeps this router.
  const supplyField = (): FlowField | null => {
    const depot = depotFieldNow();
    if (depot) return depot;
    const node = parts.supplyNode?.() ?? -1;
    return node >= 0 && node < network.nodes.length ? nodeFieldFor(node) : null;
  };

  const pickTile = (worker: number, at: number, litter: Litter): number => {
    const claims = tileClaims(litter);
    const passedOver = new Set<number>();
    const inZone = tileInZone(worker);
    for (let attempt = 0; attempt < MAX_TILE_TRIES; attempt++) {
      const tile = mostLittered(
        litter,
        (each) =>
          claims[each] === NOBODY &&
          !passedOver.has(each) &&
          inZone(each % litter.tilesX, Math.floor(each / litter.tilesX)) &&
          nodeOnTile(litter, each) >= 0,
        SWEEP_ABOVE,
      );
      if (tile < 0) return NOBODY;
      if (nodeFieldFor(nodeOnTile(litter, tile)).next[at]! >= 0) {
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
    standAt(worker, node);
    doorOf[worker] = node;
    until[worker] = now + ticksIn(SWEEP_TICKS);
    working[worker] = 1;
    workingCount++;
  };

  const stepToTile = (worker: number, at: number, litter: Litter): number => {
    const node = nodeOnTile(litter, tileOf[worker]!);
    const onward = node >= 0 ? (nodeFieldFor(node).next[at] ?? -1) : -1;
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

  const feetOf = (spot: SandPoint): readonly SandPoint[] => {
    const sand = network.sand;
    const open = (point: SandPoint): boolean => !sand || !blockedAt(sand, point.x, point.z);
    if (open(spot)) return [{ x: spot.x, z: spot.z }];
    for (const reach of FOOT_REACH) {
      const feet = COMPASS.map(([dx, dz]) => ({ x: spot.x + dx * reach, z: spot.z + dz * reach }));
      const clear = feet.filter(open);
      if (clear.length > 0) return clear;
    }
    return [];
  };

  const towerRoutesFor = (seat: number): readonly SandRoute[] => {
    let routes = towerRoutes.get(seat);
    if (!routes) {
      routes = sandRoutesFor(network, feetOf(network.seats[seat]!), SAND_ROUTE_TILES);
      towerRoutes.set(seat, routes);
    }
    return routes;
  };

  // By the tile under the seat, so painting the sand under a tower zones it.
  const pickTower = (worker: number, at: number): number => {
    const inZone = tileInZone(worker);
    for (const seat of network.posts) {
      if (towerBy.has(seat)) continue;
      const spot = network.seats[seat]!;
      if (!inZone(Math.floor(spot.x / TILE_VOXELS), Math.floor(spot.z / TILE_VOXELS))) continue;
      const route = towerRoutesFor(seat).find((each) => nodeFieldFor(each.gate).next[at]! >= 0);
      if (!route) continue;
      towerBy.set(seat, worker);
      towerOf[worker] = seat;
      legRoute[worker] = route;
      return seat;
    }
    return NOBODY;
  };

  const giveUpTower = (worker: number): void => {
    const seat = towerOf[worker]!;
    if (seat >= 0 && towerBy.get(seat) === worker) towerBy.delete(seat);
    towerOf[worker] = NOBODY;
    legRoute[worker] = null;
  };

  const climbTower = (worker: number, route: SandRoute): void => {
    if (!holdOnSeat(parts.crowd(), worker, towerOf[worker]!)) {
      giveUpTower(worker);
      return;
    }
    doorOf[worker] = route.gate;
    until[worker] = FOR_EVER;
    working[worker] = 1;
    workingCount++;
  };

  // Released to the gate when done, which walks them back off the sand as a lifeguard comes down.
  const workOnSand = (worker: number, route: SandRoute): void => {
    const people = parts.crowd();
    const place = venues[assigned[worker]!]!;
    holdAt(people, worker, place.x, BEACH_SURFACE, place.z, people.heading[worker] ?? 0);
    doorOf[worker] = route.gate;
    until[worker] = spellFor(worker);
    working[worker] = 1;
    workingCount++;
  };

  // Acts on every call, or the crowd turns the lifeguard into a beach roamer at the end of a leg.
  const alongTheSand = (worker: number): number => {
    const route = legRoute[worker];
    if (!route || working[worker] === 1 || !isOnDuty(worker)) return -1;
    const leg = legOf[worker]! + 1;
    legOf[worker] = leg;
    const next = route.waypoints[leg];
    if (next) walkSandTo(parts.crowd(), worker, next.x, next.z);
    else if (towerOf[worker]! >= 0) climbTower(worker, route);
    else workOnSand(worker, route);
    return -1;
  };

  const towardsTheSand = (worker: number, at: number): number => {
    const route = legRoute[worker]!;
    const onward = nodeFieldFor(route.gate).next[at] ?? -1;
    if (onward < 0) {
      if (towerOf[worker]! >= 0) giveUpTower(worker);
      else giveUp(worker);
      return -1;
    }
    if (onward !== at) return onward;
    legOf[worker] = -1;
    return alongTheSand(worker);
  };

  const giveUp = (worker: number): void => {
    const venue = assigned[worker]!;
    const claims = claimsOf(worker);
    if (venue >= 0 && claims[venue] === worker) claims[venue] = NOBODY;
    assigned[worker] = NOBODY;
    legRoute[worker] = null;
  };

  const mend = (venue: number): void => {
    const breakdowns = parts.breakdowns?.();
    if (breakdowns) repair(breakdowns, venue);
  };

  const finishAtVenue = (worker: number): void => {
    const venue = assigned[worker]!;
    const role = staff.role[worker];
    if (role === 'cleaner') {
      scrub(parts.upkeep(), venue, SCRUB_PER_SPELL);
      spend(worker);
    }
    if (role === 'animator') lastStage[worker] = venue;
    if (role === 'mechanic') mend(venue);
    sheltering[worker] = 0;
    giveUp(worker);
  };

  const spend = (worker: number): void => {
    load[worker] = Math.max(0, load[worker]! - 1);
  };

  const finishWork = (worker: number): void => {
    if (restocking[worker] === 1) {
      restocking[worker] = 0;
      load[worker] = SPELLS_PER_LOAD;
      return;
    }
    const room = roomOf[worker]!;
    if (room >= 0) {
      parts.beds?.().make(room, BEDS_PER_SPELL);
      spend(worker);
      giveUpRoom(worker);
      return;
    }
    const tile = tileOf[worker]!;
    const litter = parts.litter?.();
    if (tile >= 0) {
      if (litter) sweep(litter, tile % litter.tilesX, Math.floor(tile / litter.tilesX));
      giveUpTile(worker);
      return;
    }
    if (towerOf[worker]! >= 0) {
      giveUpTower(worker);
      return;
    }
    finishAtVenue(worker);
  };

  const finish = (worker: number): void => {
    doneWith(worker);
    finishWork(worker);
    working[worker] = 0;
    workingCount--;
    const door = doorOf[worker]!;
    doorOf[worker] = NOBODY;
    if (door >= 0 && door < network.nodes.length) releaseTo(parts.crowd(), worker, door);
  };

  // A tower is kept through a storm: nobody is in the water to leave for, and a walk back over
  // the sand every storm is a lot of motion for nothing. A pool is waited out at its door.
  const mindTheWeather = (worker: number, effect: WeatherEffect): void => {
    const venue = assigned[worker]!;
    if (towerOf[worker]! >= 0 || venue < 0) return;
    const open = isOpenIn(shelterOf(venues[venue]!), effect);
    if (open === (sheltering[worker] === 0)) return;
    const door = doorOf[worker]!;
    if (open) standInside(worker, venue, door);
    else standAt(worker, door);
    sheltering[worker] = open ? 0 : 1;
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

  // Only an order sends a cleaner over the sand: their own choice is a venue on the paving.
  const cleanerWork = (worker: number, at: number): number => {
    takeOrder(worker, at);
    if (roomFor(worker, at) >= 0) return roomStep(worker, at);
    const venue = venueFor(worker, at);
    if (venue < 0) return litterStep(worker, at);
    return legRoute[worker] ? towardsTheSand(worker, at) : venueStep(worker, at, venue);
  };

  const setToRestock = (worker: number, node: number): void => {
    const depot = depotAtNode.get(node);
    if (depot === undefined) standAt(worker, node);
    else standIn(worker, depots[depot]!, node);
    doorOf[worker] = node;
    until[worker] = now + ticksIn(RESTOCK_TICKS);
    working[worker] = 1;
    restocking[worker] = 1;
    workingCount++;
  };

  // Nowhere to fetch from, or cut off from it, the cart is refilled on the spot: a cleaner who
  // cannot restock must not stand idle for ever.
  const restockStep = (worker: number, at: number): number => {
    const onward = supplyField()?.next[at] ?? -1;
    if (onward < 0) {
      load[worker] = SPELLS_PER_LOAD;
      return cleanerWork(worker, at);
    }
    if (onward !== at) return onward;
    setToRestock(worker, at);
    return -1;
  };

  // Only between tasks: one already sent somewhere sees it through, and a sweep needs no load.
  const cleanerStep = (worker: number, at: number): number => {
    const empty = load[worker] === 0;
    if (empty && assigned[worker]! < 0 && tileOf[worker]! < 0 && roomOf[worker]! < 0) {
      return restockStep(worker, at);
    }
    return cleanerWork(worker, at);
  };

  const dropTasks = (worker: number): void => {
    if (towerOf[worker]! >= 0) giveUpTower(worker);
    giveUp(worker);
    giveUpTile(worker);
    giveUpRoom(worker);
  };

  const clockedOff = (worker: number): void => {
    goingHome[worker] = 0;
    parts.onClockedOff?.(worker);
  };

  // Tasks are dropped on the way, so a venue is not held for somebody who is not coming.
  const homeStep = (worker: number, at: number): number => {
    dropTasks(worker);
    const onward = supplyField()?.next[at] ?? -1;
    if (onward >= 0 && onward !== at) return onward;
    clockedOff(worker);
    return -1;
  };

  const animatorStep = (worker: number, at: number): number => {
    const venue = assigned[worker]! >= 0 ? assigned[worker]! : pickStage(worker, at);
    return venue < 0 ? -1 : venueStep(worker, at, venue);
  };

  // Nothing broken, a mechanic stands where they are: there is nowhere they are meant to wait yet.
  const mechanicStep = (worker: number, at: number): number => {
    takeOrder(worker, at);
    const venue = assigned[worker]! >= 0 ? assigned[worker]! : pickRepair(worker, at);
    if (venue < 0) return -1;
    return legRoute[worker] ? towardsTheSand(worker, at) : venueStep(worker, at, venue);
  };

  // The water inside the resort first; a tower only for a lifeguard with no pool left to watch.
  const lifeguardStep = (worker: number, at: number): number => {
    if (towerOf[worker]! >= 0) return towardsTheSand(worker, at);
    const venue = assigned[worker]! >= 0 ? assigned[worker]! : pickWater(worker, at);
    if (venue >= 0) return venueStep(worker, at, venue);
    return pickTower(worker, at) >= 0 ? towardsTheSand(worker, at) : -1;
  };

  // Null for anybody not on their way home. Taken back on before they got there, they work on
  // from wherever they are; the sand has no node to walk home from, so they leave from it.
  const leavingStep = (worker: number, at: number): number | null => {
    if (goingHome[worker] !== 1) return null;
    if (isOnDuty(worker)) {
      goingHome[worker] = 0;
      return null;
    }
    if (working[worker] === 1) return -1;
    if (at !== ON_SAND) return at < 0 ? -1 : homeStep(worker, at);
    dropTasks(worker);
    clockedOff(worker);
    return -1;
  };

  const roleStep = (worker: number, at: number): number => {
    const role = staff.role[worker];
    if (role === 'lifeguard') return lifeguardStep(worker, at);
    if (role === 'animator') return animatorStep(worker, at);
    return role === 'mechanic' ? mechanicStep(worker, at) : cleanerStep(worker, at);
  };

  // Every claim index follows from who is assigned or posted where.
  const reclaim = (): void => {
    claimedBy.fill(NOBODY);
    showBy.fill(NOBODY);
    watchedBy.fill(NOBODY);
    repairBy.fill(NOBODY);
    towerBy.clear();
    roomBy = new Int32Array(lodgings.length).fill(NOBODY);
    const litter = parts.litter?.();
    tileClaimedBy = new Int32Array(litter?.level.length ?? 0).fill(NOBODY);
    for (let worker = 0; worker < staff.count; worker++) {
      const venue = assigned[worker]!;
      if (venue >= 0) claimsOf(worker)[venue] = worker;
      if (towerOf[worker]! >= 0) towerBy.set(towerOf[worker]!, worker);
      if (tileOf[worker]! >= 0) tileClaimedBy[tileOf[worker]!] = worker;
      if (roomOf[worker]! >= 0) roomBy[roomOf[worker]!] = worker;
    }
    workingCount = working.reduce((total, each) => total + each, 0);
  };

  // An empty cart with nothing on hand is on its way to fetch more.
  const unclaimedKind = (worker: number): StaffTaskKind => {
    if (assigned[worker]! >= 0) return 'venue';
    const empty = staff.role[worker] === 'cleaner' && load[worker] === 0;
    return empty ? 'restock' : 'idle';
  };

  const claimedKind = (worker: number): StaffTaskKind => {
    if (restocking[worker] === 1) return 'restock';
    if (roomOf[worker]! >= 0) return 'room';
    if (tileOf[worker]! >= 0) return 'sweep';
    return towerOf[worker]! >= 0 ? 'tower' : unclaimedKind(worker);
  };

  // Taken back on before reaching the door, a worker is no longer going home, whatever the flag
  // says until their next step.
  const kindOf = (worker: number): StaffTaskKind => {
    if (isOnDuty(worker)) return claimedKind(worker);
    return goingHome[worker] === 1 ? 'home' : 'off';
  };

  // The door map is filled lazily, and a restored router may not have filled it yet; the fill
  // is a cache, so it changes nothing the sim does.
  const depotOf = (worker: number): number => {
    if (restocking[worker] !== 1) return NOBODY;
    if (depotField === undefined) depotFieldNow();
    return depotAtNode.get(doorOf[worker]!) ?? NOBODY;
  };

  let orders: {
    role: OrderRole;
    venue: number;
    tile: number;
    worker: number;
    taken: boolean;
  }[] = [];
  let published: readonly Order[] = [];
  const publish = (): void => {
    published = orders.map((each) => ({ ...each }));
  };

  type OpenOrder = (typeof orders)[number];

  const orderApplies = (order: OpenOrder): boolean => {
    if (order.tile >= 0) {
      const litter = parts.litter?.();
      return litter !== undefined && (litter.level[order.tile] ?? 0) > 0;
    }
    if (order.venue >= venues.length) return false;
    if (order.role === 'mechanic') return isBrokenDown(order.venue);
    return cleanliness(parts.upkeep(), order.venue) < NEEDS_CLEANING;
  };

  const isFree = (worker: number): boolean =>
    isOnDuty(worker) &&
    goingHome[worker] === 0 &&
    working[worker] === 0 &&
    claimedKind(worker) === 'idle';

  const tileField = (order: OpenOrder): FlowField | null => {
    const litter = parts.litter?.();
    const node = litter ? nodeOnTile(litter, order.tile) : NOBODY;
    return node >= 0 ? nodeFieldFor(node) : null;
  };

  // A building with no door on the paving is reached over the sand from a gate, whoever is sent.
  const venueHops = (venue: number, at: number): number => {
    const paved = fieldFor(venue).hops[at] ?? NOBODY;
    if (paved >= 0) return paved;
    const route = sandRouteTo(venue, at);
    return route ? nodeFieldFor(route.gate).hops[at]! + route.waypoints.length : NOBODY;
  };

  // -1 for a target that cannot be reached from the node.
  const orderHops = (order: OpenOrder, at: number): number =>
    order.venue >= 0 ? venueHops(order.venue, at) : (tileField(order)?.hops[at] ?? NOBODY);

  const orderInZone = (worker: number, order: OpenOrder): boolean => {
    if (order.venue >= 0) return venueInZone(worker)(order.venue);
    const tilesX = parts.litter?.().tilesX ?? 1;
    return tileInZone(worker)(order.tile % tilesX, Math.floor(order.tile / tilesX));
  };

  // Hops from where the worker is walking to; -1 for anybody off the paving or cut off from it.
  const hopsTo = (order: OpenOrder, worker: number): number => {
    const at = parts.crowd().node[worker] ?? NOBODY;
    if (at < 0 || at >= network.nodes.length) return NOBODY;
    return orderHops(order, at);
  };

  const candidates = (order: OpenOrder, except: number): number[] => {
    const free: number[] = [];
    for (let worker = 0; worker < staff.count; worker++) {
      if (worker === except || staff.role[worker] !== order.role || !isFree(worker)) continue;
      if (hopsTo(order, worker) >= 0) free.push(worker);
    }
    return free;
  };

  // The nearest free worker of the role, from the zone the target is in if anybody there is.
  const nearestFor = (order: OpenOrder): number => {
    const free = candidates(order, NOBODY);
    const zoned = free.filter((worker) => orderInZone(worker, order));
    const pool = zoned.length > 0 ? zoned : free;
    let best = NOBODY;
    for (const worker of pool) {
      if (best < 0 || hopsTo(order, worker) < hopsTo(order, best)) best = worker;
    }
    return best;
  };

  const holderOf = (order: OpenOrder): number => {
    if (order.tile >= 0) return tileClaimedBy[order.tile] ?? NOBODY;
    return (order.role === 'mechanic' ? repairBy : claimedBy)[order.venue] ?? NOBODY;
  };

  const holds = (worker: number, order: OpenOrder): boolean =>
    order.tile >= 0 ? tileOf[worker] === order.tile : assigned[worker] === order.venue;

  // Somebody already on their way there serves the order; nobody is sent after them.
  const attachOrReserve = (order: OpenOrder): void => {
    const holder = holderOf(order);
    if (holder >= 0 && staff.role[holder] === order.role) {
      order.worker = holder;
      order.taken = true;
      return;
    }
    order.taken = false;
    order.worker = nearestFor(order);
  };

  const claimVenueOrder = (worker: number, at: number, order: OpenOrder): boolean => {
    if (fieldFor(order.venue).next[at]! >= 0) return claim(worker, order.venue) >= 0;
    const overSand = sandRouteTo(order.venue, at);
    if (!overSand) return false;
    legRoute[worker] = overSand;
    return claim(worker, order.venue) >= 0;
  };

  const claimTileOrder = (worker: number, at: number, order: OpenOrder): boolean => {
    const litter = parts.litter?.();
    if (!litter || (tileField(order)?.next[at] ?? NOBODY) < 0) return false;
    tileClaims(litter)[order.tile] = worker;
    tileOf[worker] = order.tile;
    return true;
  };

  const claimOrder = (worker: number, at: number, order: OpenOrder): boolean => {
    const holder = holderOf(order);
    if (holder >= 0 && holder !== worker) {
      attachOrReserve(order);
      publish();
      return false;
    }
    const claimed =
      order.tile >= 0 ? claimTileOrder(worker, at, order) : claimVenueOrder(worker, at, order);
    order.worker = claimed ? worker : NOBODY;
    order.taken = claimed;
    publish();
    return claimed;
  };

  // A worker outside the target's zone waits while somebody inside it is free to go.
  const mayTake = (worker: number, at: number, order: OpenOrder): boolean => {
    if (order.taken || order.role !== staff.role[worker]) return false;
    if (order.worker >= 0) return order.worker === worker;
    if (orderHops(order, at) < 0) return false;
    if (orderInZone(worker, order)) return true;
    return !candidates(order, worker).some((other) => orderInZone(other, order));
  };

  // Before any choice of their own, and only by a worker with nothing on hand. With no order open
  // it returns at once, so a resort nobody orders about runs as it always has.
  const takeOrder = (worker: number, at: number): void => {
    if (orders.length === 0 || claimedKind(worker) !== 'idle') return;
    const mine = orders.find((order) => order.worker === worker && !order.taken);
    const order = mine ?? orders.find((each) => mayTake(worker, at, each));
    if (order) claimOrder(worker, at, order);
  };

  const releaseOrder = (order: OpenOrder): void => {
    if (!order.taken || working[order.worker] === 1 || !holds(order.worker, order)) return;
    if (order.tile >= 0) giveUpTile(order.worker);
    else giveUp(order.worker);
  };

  // A worker who has let go of the target, by a rebuild, a clock-off or a dead end, frees the
  // order for somebody else; one who was only reserved and is busy now is passed over.
  const reconcile = (order: OpenOrder): void => {
    if (order.worker < 0) attachOrReserve(order);
    else if (order.taken ? !holds(order.worker, order) : !isFree(order.worker)) {
      attachOrReserve(order);
    }
  };

  const keepOrders = (): void => {
    if (orders.length === 0) return;
    // Eight small objects at most, and only while an order is open.
    const before = JSON.stringify(orders);
    const ended = orders.filter(
      (order) => !orderApplies(order) && !(order.taken && working[order.worker] === 1),
    );
    for (const order of ended) releaseOrder(order);
    orders = orders.filter((order) => !ended.includes(order));
    for (const order of orders) reconcile(order);
    if (JSON.stringify(orders) !== before) publish();
  };

  const doneWith = (worker: number): void => {
    if (orders.length === 0) return;
    const left = orders.filter(
      (order) => !(order.taken && order.worker === worker && holds(worker, order)),
    );
    if (left.length === orders.length) return;
    orders = left;
    publish();
  };

  const orderedTo = (worker: number): boolean =>
    orders.some((order) => order.taken && order.worker === worker);

  const placeOrder = (role: OrderRole, target: OrderTarget): boolean => {
    const venue = 'venue' in target ? target.venue : NOBODY;
    const tile = 'tile' in target ? target.tile : NOBODY;
    const order = { role, venue, tile, worker: NOBODY, taken: false };
    const same = (each: OpenOrder): boolean =>
      each.role === role && each.venue === venue && each.tile === tile;
    if (orders.length >= MAX_ORDERS || orders.some(same) || !orderApplies(order)) return false;
    if (venue < 0 && tile < 0) return false;
    attachOrReserve(order);
    orders = [...orders, order];
    publish();
    return true;
  };

  // By key across an edit, which renumbers venues; a tile is a tile of the same grid.
  const carryOrders = (was: readonly Venue[]): void => {
    if (orders.length === 0) return;
    const indexOf = new Map(venues.map((venue, at) => [venue.key, at]));
    orders = orders.flatMap((order) => {
      const venue =
        order.venue >= 0 ? (indexOf.get(was[order.venue]?.key ?? '') ?? NOBODY) : NOBODY;
      if (order.venue >= 0 && venue < 0) return [];
      return [{ ...order, venue, worker: NOBODY, taken: false }];
    });
    publish();
  };

  const claimedAndWorking = (claims: Int32Array, venue: number): boolean => {
    const worker = claims[venue] ?? NOBODY;
    return worker >= 0 && working[worker] === 1;
  };

  return {
    step(worker, at) {
      const leaving = leavingStep(worker, at);
      if (leaving !== null) return leaving;
      if (at === ON_SAND) return alongTheSand(worker);
      // A rebuild can let go of anybody at any moment, hence the guard.
      if (working[worker] === 1 || at < 0 || !isOnDuty(worker)) return -1;
      return roleStep(worker, at);
    },

    tick(at) {
      now = at;
      keepOrders();
      if (workingCount === 0) return;
      const effect = weatherEffect(weatherNow());
      for (let worker = 0; worker < staff.count; worker++) {
        if (working[worker] !== 1) continue;
        // Let off duty mid-spell, they finish it: a half-scrubbed venue would keep its claim for ever.
        if (now >= until[worker]! || !isOnDuty(worker)) finish(worker);
        else if (staff.role[worker] === 'lifeguard') mindTheWeather(worker, effect);
      }
    },

    rebuild(nextVenues, nextNetwork, nextLodgings = [], nextDepots = []) {
      const wasStanding = venues;
      venues = nextVenues;
      lodgings = nextLodgings;
      depots = nextDepots;
      depotField = undefined;
      restocking = new Uint8Array(staff.count);
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      // Node and venue indices mean nothing on the new graph, and a stale claim would hold a venue against every cleaner.
      fields = venues.map(() => null);
      claimedBy = new Int32Array(venues.length).fill(NOBODY);
      showBy = new Int32Array(venues.length).fill(NOBODY);
      watchedBy = new Int32Array(venues.length).fill(NOBODY);
      repairBy = new Int32Array(venues.length).fill(NOBODY);
      assigned = new Int32Array(staff.count).fill(NOBODY);
      until = new Int32Array(staff.count);
      working = new Uint8Array(staff.count);
      doorOf = new Int32Array(staff.count).fill(NOBODY);
      tileOf = new Int32Array(staff.count).fill(NOBODY);
      tileClaimedBy = new Int32Array(0);
      roomOf = new Int32Array(staff.count).fill(NOBODY);
      roomBy = new Int32Array(lodgings.length).fill(NOBODY);
      roomFields = lodgings.map(() => null);
      lastStage = new Int32Array(staff.count).fill(NOBODY);
      sheltering = new Uint8Array(staff.count);
      towerOf = new Int32Array(staff.count).fill(NOBODY);
      legOf = new Int32Array(staff.count);
      legRoute = Array.from({ length: staff.count }, () => null);
      towerBy.clear();
      towerRoutes.clear();
      venueSandRoutes.clear();
      nodeFields.clear();
      workingCount = 0;
      carryOrders(wasStanding);
      // Nobody is released: the crowd is relocated onto the new graph in the same step.
    },

    clockOn(worker) {
      load[worker] = SPELLS_PER_LOAD;
      goingHome[worker] = 0;
    },

    clockOff(worker) {
      if (goingHome[worker] === 1) return;
      goingHome[worker] = 1;
      if (!supplyField()) clockedOff(worker);
    },

    atWork(worker) {
      if (working[worker] !== 1) return null;
      return venues[assigned[worker]!] ?? null;
    },

    taskOf(worker, into = createStaffTask()) {
      into.kind = kindOf(worker);
      into.venue = assigned[worker] ?? NOBODY;
      into.lodging = roomOf[worker] ?? NOBODY;
      into.tile = tileOf[worker] ?? NOBODY;
      into.seat = towerOf[worker] ?? NOBODY;
      into.depot = depotOf(worker);
      into.working = working[worker] === 1;
      into.load = load[worker] ?? 0;
      into.ordered = orderedTo(worker);
      return into;
    },

    performingAt(venue) {
      return claimedAndWorking(showBy, venue);
    },

    watching(venue) {
      return claimedAndWorking(watchedBy, venue);
    },

    get watchingBeach() {
      for (const worker of towerBy.values()) if (working[worker] === 1) return true;
      return false;
    },

    get workingCount() {
      return workingCount;
    },

    snapshot() {
      return {
        assigned: assigned.slice(),
        until: until.slice(),
        working: working.slice(),
        doorOf: doorOf.slice(),
        tileOf: tileOf.slice(),
        roomOf: roomOf.slice(),
        lastStage: lastStage.slice(),
        sheltering: sheltering.slice(),
        towerOf: towerOf.slice(),
        legOf: legOf.slice(),
        legRoute: [...legRoute],
        load: load.slice(),
        restocking: restocking.slice(),
        goingHome: goingHome.slice(),
        now,
        random: random.state(),
        orders: published.map((order) => ({ ...order })),
      };
    },

    restore(snapshot) {
      if (!staffVenuesMatch(snapshot, venues.length, lodgings.length)) {
        throw new Error(`The save's staff work at venues this plot does not have`);
      }
      assigned = snapshot.assigned.slice();
      until = snapshot.until.slice();
      working = snapshot.working.slice();
      doorOf = snapshot.doorOf.slice();
      tileOf = snapshot.tileOf.slice();
      roomOf = snapshot.roomOf.slice();
      lastStage = snapshot.lastStage.slice();
      sheltering = snapshot.sheltering.slice();
      towerOf = snapshot.towerOf.slice();
      legOf = snapshot.legOf.slice();
      legRoute = [...snapshot.legRoute];
      load = snapshot.load.slice();
      restocking = snapshot.restocking.slice();
      goingHome = snapshot.goingHome.slice();
      now = snapshot.now;
      random = resumeRandom(snapshot.random);
      reclaim();
      const known = (worker: number): boolean => worker >= 0 && worker < staff.count;
      orders = (snapshot.orders ?? []).map(({ role, venue, tile, worker, taken }) => ({
        role,
        venue,
        tile,
        worker: known(worker) ? worker : NOBODY,
        taken: taken && known(worker),
      }));
      publish();
    },

    order: placeOrder,

    ordersOf() {
      return published;
    },
  };
}

export function meanCleanliness(upkeep: Upkeep, venues: number): number {
  if (venues <= 0) return 1;
  let total = 0;
  for (let venue = 0; venue < venues; venue++) total += cleanliness(upkeep, venue);
  return total / venues;
}
