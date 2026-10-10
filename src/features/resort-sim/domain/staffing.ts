import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { type Crowd, holdAt, putOnPlot } from '../../crowd/domain/crowd';
import { type NodeIndex, nodeIndexFor } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { ownedBounds } from '../../land/domain/landRights';
import type { TileRect } from '../../layout/domain/parkShapes';
import { type Shore, beachTilesOf } from '../../layout/domain/shoreline';
import { type Depot, depotForShift } from '../../sim/domain/depots';
import { doorsFor } from '../../sim/domain/doors';
import type { Lodging } from '../../sim/domain/lodgings';
import {
  type Roster,
  type StaffRole,
  STAFF_ROLES,
  onDuty,
  rosterFor,
  rosterOf,
  shiftChange,
  workplacesOf,
} from '../../sim/domain/staff';
import type { Venue } from '../../sim/domain/venues';
import { isBroken } from '../../sim/domain/breakdowns';
import { openNow } from '../../sim/domain/hours';
import {
  type Evening,
  finishesFirst,
  isStaffNight,
  offForTheNight,
  onShiftOf,
} from '../../sim/domain/staffNight';
import { createStaffTask } from '../../sim/domain/staffRouter';
import { weatherEffect } from '../../sim/domain/weather';
import {
  NO_ZONE,
  type Zones,
  anyZone,
  dealZones,
  workplaceZones,
  zonesIn,
  zonesOf,
} from '../../sim/domain/zones';
import type { PlotFacts } from './plotFacts';
import type { SimNow } from './simNow';
import type { SimState } from './simState';

// The live rights, not the plan's: a path laid on land bought since the last settle gets litter too.
export const litterWindowOf = (resort: Pick<SimState, 'rights' | 'plan'>): TileRect | undefined =>
  resort.rights ? ownedBounds(resort.rights, resort.plan) : undefined;

const pavingIndices = new WeakMap<WalkNetwork, NodeIndex>();

// The crowd is handed this very graph, so the first litter draw finds its index built.
export const knowPaving = (facts: PlotFacts): void => {
  pavingIndices.set(facts.network, facts.paving);
};

export function pavingIndexOf(network: WalkNetwork): NodeIndex {
  let index = pavingIndices.get(network);
  if (!index) {
    index = nodeIndexFor(network);
    pavingIndices.set(network, index);
  }
  return index;
}

export interface TileAt {
  readonly tileX: number;
  readonly tileZ: number;
}

// The shore never moves with an edit, so a resort sweeps its sand once.
const beachTileLists = new WeakMap<Shore, readonly TileAt[]>();

export function beachTilesFor(shore: Shore | null): readonly TileAt[] {
  if (!shore) return [];
  let tiles = beachTileLists.get(shore);
  if (!tiles) {
    tiles = beachTilesOf(shore).map(({ x, z }) => ({ tileX: x, tileZ: z }));
    beachTileLists.set(shore, tiles);
  }
  return tiles;
}

// Stood at the node first, or a body dealt on an empty plot walks in from the origin.
function enterAt(crowd: Crowd, i: number, node: number): void {
  const at = crowd.network.nodes[node];
  if (at) holdAt(crowd, i, at.x, at.y, at.z, crowd.heading[i] ?? 0);
  putOnPlot(crowd, i, node);
}

// After the relocate, so the arrival node is on the graph the staff crowd now walks. Rezoned
// before anybody clocks on, so a zoned worker starts at a depot in their zone.
export function staffTheResort(resort: SimState): void {
  const { recommended, roster, duty, onShift } = rosterNow(resort);
  const workers = resort.staff.crowd;
  const shift = shiftChange(onShift, workers.offPlot);
  resort.recommended = recommended;
  resort.roster = roster;
  resort.duty = duty;
  resort.onShift = onShift;
  rezone(resort);
  for (const worker of shift.leaving) resort.staffRouter.clockOff(worker);
  // No paving yet: they are owed their shift at the next edit that lays some.
  if (workers.network.edges.length === 0) return;
  const entries = clockOnNodes(resort, shift.starting);
  for (const [turn, worker] of shift.starting.entries()) {
    enterAt(workers, worker, entries[turn]!);
    resort.staffRouter.clockOn(worker);
  }
}

// With no staff house, at the entrance; with no entrance either, at node 0: anywhere on the
// paving beats waiting for a gate.
function clockOnNodes(resort: SimState, starting: readonly number[]): readonly number[] {
  const network = resort.staff.crowd.network;
  const index = pavingIndexOf(network);
  const doors = resort.depots
    .map((depot) => ({ depot, node: doorsFor(depot, index).nodes[0] ?? -1 }))
    .filter((door) => door.node >= 0);
  const depotZones = zonesOfPlaces(
    resort.zones,
    doors.map((door) => door.depot),
    network,
  );
  const arrival = Math.max(0, resort.router.arrivalNode);
  return starting.map((worker, turn) => {
    const depot = depotForShift(turn, resort.zoneOf[worker] ?? NO_ZONE, depotZones);
    return depot < 0 ? arrival : doors[depot]!.node;
  });
}

// A zone holds a workplace for a role wherever that role's task choice could send somebody, so
// nobody is dealt to a zone with no work for them. Cleaners sweep paving and sand and make up
// rooms, so those count too.
export function rezone(resort: SimState): void {
  const { zones, venues, lodgings } = resort;
  if (!anyZone(zones)) {
    resort.venueZones = new Int32Array(venues.length);
    resort.lodgingZones = new Int32Array(lodgings.length);
    resort.zoneOf = new Int8Array(resort.staffPool.count).fill(NO_ZONE);
    return;
  }
  const network = resort.staff.crowd.network;
  resort.venueZones = zonesOfPlaces(zones, venues, network);
  resort.lodgingZones = zonesOfPlaces(zones, lodgings, network);
  const held = workplaceZones(zones, venues, resort.venueZones, {
    paved: network.nodes,
    towers: network.posts.map((seat) => tileUnder(network.seats[seat]!)),
    beach: beachTilesFor(resort.shore),
  });
  held.cleaner = resort.lodgingZones.reduce((mask, each) => mask | each, held.cleaner);
  const roles = resort.staffPool.role.map((role) => STAFF_ROLES.indexOf(role));
  resort.zoneOf = dealZones(
    roles,
    resort.duty,
    STAFF_ROLES.map((role) => zonesIn(held[role])),
  );
}

function zonesOfPlaces(
  zones: Zones,
  places: readonly (Venue | Lodging | Depot)[],
  network: WalkNetwork,
): Int32Array {
  const index = pavingIndexOf(network);
  return Int32Array.from(places, (place) =>
    zonesOf(
      zones,
      place,
      doorsFor(place, index).nodes.map((node) => network.nodes[node]!),
    ),
  );
}

const tileUnder = (spot: { readonly x: number; readonly z: number }) => ({
  tileX: Math.floor(spot.x / TILE_VOXELS),
  tileZ: Math.floor(spot.z / TILE_VOXELS),
});

// Shared with a load, which sets the duty without a shift change: the saved staff crowd already
// has everyone where the save left them.
export function rosterNow(resort: SimState): {
  readonly recommended: Roster;
  readonly roster: Roster;
  readonly duty: Uint8Array;
  readonly onShift: Uint8Array;
} {
  const recommended = rosterFor(
    workplacesOf(resort.venues, resort.staff.crowd.network.posts, resort.lodgings),
  );
  const roster = rosterOf(resort.hiring, recommended);
  const duty = onDuty(resort.staffPool, roster);
  return { recommended, roster, duty, onShift: onShiftOf(duty, resort.staffOff) };
}

export function eveningOf(resort: SimState, clock: SimNow): Evening {
  const effect = weatherEffect(clock.weather);
  const { tickOfDay } = clock;
  const lateOpen = resort.venues.some(
    (venue, index) =>
      venue.hours !== undefined &&
      !isBroken(resort.breakdowns, index) &&
      openNow(venue, effect, tickOfDay),
  );
  let swimmers = 0;
  for (const venue of resort.siteVenues) {
    if (venue.bathing !== true || !openNow(venue, effect, tickOfDay)) continue;
    swimmers += resort.router.occupancyOf(venue.key)?.inside ?? 0;
  }
  return { tickOfDay, eventOn: resort.events.runs.length > 0, lateOpen, swimmers };
}

const midSpell = createStaffTask();

function leavingTonight(resort: SimState, clock: SimNow): readonly number[] {
  const leaving: number[] = [];
  let evening: Evening | null = null;
  for (let worker = 0; worker < resort.staffPool.count; worker++) {
    if (resort.onShift[worker] !== 1) continue;
    const role = resort.staffPool.role[worker]!;
    evening ??= eveningOf(resort, clock);
    if (!offForTheNight(role, evening)) continue;
    if (finishesFirst(role) && resort.staffRouter.taskOf(worker, midSpell).working) continue;
    leaving.push(worker);
  }
  return leaving;
}

// Once a frame. The way home is the one a worker taken off the roster walks, to the staff house
// or the entrance; the way back in is an ordinary shift change.
export function keepStaffHours(resort: SimState, clock: SimNow): void {
  if (!isStaffNight(clock.tickOfDay)) {
    if (!resort.staffOff.includes(1)) return;
    resort.staffOff = new Uint8Array(resort.staffPool.count);
    staffTheResort(resort);
    return;
  }
  const leaving = leavingTonight(resort, clock);
  if (leaving.length === 0) return;
  const off = resort.staffOff.slice();
  for (const worker of leaving) off[worker] = 1;
  resort.staffOff = off;
  resort.onShift = onShiftOf(resort.duty, off);
  for (const worker of leaving) resort.staffRouter.clockOff(worker);
}

// Lifeguards gone for the night leave no water unwatched: it is shut to them until morning.
export const offTonight = (resort: Pick<SimState, 'staffPool' | 'staffOff'>, role: StaffRole) =>
  resort.staffPool.role.some((each, worker) => each === role && resort.staffOff[worker] === 1);
