import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  holdAt,
  holdOnSeat,
  isWaiting,
  ON_SAND,
  putOnPlot,
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
import { saltFor, tasteFor } from './appeal';
import { chooseVenue, TASTE_SPREAD } from './chooseVenue';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField } from './flowField';
import {
  clearAllGoals,
  clearPartyGoal,
  createGoals,
  NO_GOAL,
  setPartyGoal,
  setPartyVenue,
  type Goals,
} from './goals';
import { type Gateway } from './gateways';
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
import { cleanliness, soil, type Upkeep } from './upkeep';
import { isOpenIn, weatherEffect, type Weather } from './weather';
import { reliefAt, shelterOf, type Venue } from './venues';

// Duplicated rather than imported: simClock's constant is private to the clock.
const TICK_SECONDS = 60;

// -1 is an answer (stand still, or wander), not the absence of one.
const BY_DAY = -2;

// The furthest beach building on the reference plot is 28 tiles from a gate; 40 leaves
// room for detours.
const SAND_ROUTE_TILES = 40;

// Twice needs.ts's content line, so nobody on the sand jumps up every few minutes.
const FETCH_URGENCY = 0.4;

// Stops a guest whose nearest kiosk is unreachable from sweeping the beach every tick.
const LOOK_AGAIN_TICKS = 15;

// Routes are per person, not per venue: each party member walks to their own beach spot.
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

interface Claim {
  readonly pitch: Pitch;
  readonly routes: readonly SandRoute[];
  holders: number;
}

export type BeachStay = 'arriving' | 'resting' | 'leaving';

export interface VenueOccupancy {
  readonly inside: number;
  readonly waiting: number;
}

// Allocates, but is only read once a frame for the selected guest.
export interface Visit {
  readonly venue: Venue;
  readonly waiting: boolean;
  readonly place: number;
}

export interface Router {
  step(person: number, at: number): number;
  // Needed beside `step` because the sand has no nodes. Deliberately not tied to venue
  // goals: nearly every party always has an errand, and that emptied the beach by afternoon.
  offTheSand(person: number): boolean;
  tick(now: number): void;
  // Node indices mean nothing across a rebuild; a stale field walks guests into walls.
  rebuild(
    venues: readonly Venue[],
    lodgings: readonly Lodging[],
    gateways: readonly Gateway[],
    network: WalkNetwork,
  ): void;
  // Nobody is dragged out of a venue or a line; they leave when the visit ends.
  sendHome(person: number): void;
  admit(person: number, node: number): void;
  // Called for every member of a departing party, or a visit left standing would later
  // walk an empty body out of the door.
  forget(person: number): void;
  readonly arrivalNode: number;
  // False with no entrance, or no reception the entrance reaches.
  readonly receptionReachable: boolean;
  isArriving(person: number): boolean;
  readonly fieldCount: number;
  readonly asleepCount: number;
  isAsleep(person: number): boolean;
  // One array lookup rather than an object: read per tick for every guest.
  isWaitingAt(person: number): boolean;
  homewardTo(person: number): Lodging | null;
  readonly occupancyTotals: VenueOccupancy;
  goalOf(person: number): Venue | null;
  occupancyOf(venueKey: string): VenueOccupancy | null;
  dayBalks(): ReadonlyMap<string, number>;
  dayVisits(): ReadonlyMap<string, number>;
  forgetTheDay(): void;
  visitOf(person: number): Visit | null;
  stayOf(person: number): BeachStay | null;
}

export function createRouter(parts: {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly gateways: readonly Gateway[];
  readonly network: WalkNetwork;
  // A callback because this module knows where people walk, not who they are.
  readonly onLeave: (person: number) => void;
  // One call per visit that ran its course, whichever way out it took.
  readonly onVisited?: (person: number, venue: Venue) => void;
  // Late-bound: an arrival happens between ticks, and the clock knows the hour.
  readonly tickOfDay: () => number;
  // Late-bound: `relocate` replaces the crowd, and a held one would move people from
  // before the edit.
  readonly crowd: () => Crowd;
  // Late-bound for the same reason: an edit replaces the venue list and its upkeep.
  readonly upkeep: () => Upkeep;
  readonly weather?: () => Weather;
  readonly seed: number;
}): Router {
  const { guests, needs, crowd } = parts;
  const onVisited = parts.onVisited ?? ((): void => {});
  const weatherNow = parts.weather ?? ((): Weather => 'clear');
  const goals: Goals = createGoals(guests.count);
  const random = createRandom(parts.seed);

  let venues = withBeach(parts.venues, parts.network);
  let lodgings = parts.lodgings;
  let gateways = parts.gateways;
  let network = parts.network;
  let index: NodeIndex = nodeIndexFor(network);
  // One field per venue, not per need: a per-need field routes to the nearest venue and
  // ignores chooseVenue's weighing. Built lazily; a sweep costs about 0.5 ms.
  let fields: (FlowField | null)[] = venues.map(() => null);
  let lanes: (readonly QueueSpot[] | null)[] = venues.map(() => null);
  let sandRoutes: (readonly SandRoute[] | null)[] = venues.map(() => null);
  let errands = createErrands(guests.count);
  let homeFields: (FlowField | null)[] = lodgings.map(() => null);
  // One multi-source field rather than one per gate: a guest leaves by the nearest gate.
  let leavingField: FlowField | null = null;
  let gateNodes: readonly number[] | null = null;
  let leaving = new Uint8Array(guests.count);
  let built = 0;
  let homeLodging = new Int32Array(guests.count);
  const findHomes = (): void => {
    for (let person = 0; person < guests.count; person++) {
      const home = homeOf(guests, person);
      homeLodging[person] = home ? lodgingFor(lodgings, home.key) : -1;
    }
  };
  findHomes();
  let asleep = new Uint8Array(guests.count);
  let asleepCount = 0;
  let homeward = new Uint8Array(guests.count);
  let partyPitches: (Claim | null)[] = guests.parties.map(() => null);
  let stays: (Claim | null)[] = Array.from({ length: guests.count }, () => null);
  let spotOf = new Int32Array(guests.count);
  let pitched = new Set<number>();
  let promised = new Set<number>();
  let fetching = new Int32Array(guests.count).fill(-1);
  let stayUntil = new Int32Array(guests.count);
  let stayRoutes: (SandRoute | null)[] = Array.from({ length: guests.count }, () => null);
  let lookAgainAt = new Int32Array(guests.count);
  let sandFields: (SandField | null)[] = venues.map(() => null);
  let standsOnSand = new Int8Array(venues.length).fill(-1);
  // Counted as events, because occupancy only says what is true now.
  let balkCount = new Int32Array(venues.length);
  let visitCount = new Int32Array(venues.length);
  // Hashed from the key, not the index, so a rebuild does not reshuffle preferences.
  let salts = saltsFor(venues);
  // Not carried across a rebuild: the index would point at whatever building lands there.
  let justLeft = new Int32Array(guests.count).fill(-1);
  let occupancy: Occupancy = createOccupancy(guests.count, venues.length);
  let doorOf = new Int32Array(guests.count).fill(-1);
  // Kept across a rebuild: it is a fact about the guest, not about the graph.
  const arriving = new Uint8Array(guests.count);
  let now = 0;

  const sweep = (sources: readonly number[]): FlowField => {
    built++;
    return flowFieldFor(network, sources);
  };

  const fieldFor = (venue: number): FlowField => {
    const existing = fields[venue];
    if (existing) return existing;
    const declared = venues[venue]!;
    if (isBeach(declared)) {
      // Nobody queues for sand: no lane is laid, so the line is never joined.
      const field = sweep(network.gates);
      fields[venue] = field;
      return field;
    }
    const doors = doorsFor(declared, index, network);
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

  // Cached per venue because a stay looks for somewhere to go every quarter hour.
  const isOnSand = (venue: number): boolean => {
    const known = standsOnSand[venue]!;
    if (known >= 0) return known === 1;
    const declared = venues[venue]!;
    const doors = isBeach(declared) ? null : doorsFor(declared, index, network);
    const answer = doors !== null && doors.nodes.length === 0 && doors.sand.length > 0;
    standsOnSand[venue] = answer ? 1 : 0;
    return answer;
  };

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

  // Null is a real state, a plot nobody can leave, which the HUD shows.
  const leavingFieldOf = (): FlowField | null => {
    if (leavingField) return leavingField;
    const sources = gateNodesOf();
    if (sources.length === 0) return null;
    leavingField = sweep(sources);
    return leavingField;
  };

  const gateNodesOf = (): readonly number[] => {
    if (gateNodes) return gateNodes;
    const found = new Set<number>();
    for (const gateway of gateways) {
      for (const node of doorsFor(gateway, index).nodes) found.add(node);
    }
    gateNodes = [...found].toSorted((a, b) => a - b);
    return gateNodes;
  };

  const homeFieldFor = (lodging: number): FlowField => {
    const existing = homeFields[lodging];
    if (existing) return existing;
    const field = sweep(doorsFor(lodgings[lodging]!, index).nodes);
    homeFields[lodging] = field;
    return field;
  };

  const sandLegFrom = (venue: number, field: FlowField, at: number): number => {
    const routes = sandRoutes[venue];
    if (!routes || routes.length === 0) return 0;
    let gate = at;
    while (field.next[gate]! !== gate) gate = field.next[gate]!;
    return routes.find((route) => route.gate === gate)?.length ?? 0;
  };

  // The ceiling is safe where no lane is laid yet: nobody can be waiting there.
  const queueLimit = (venue: number): number => lanes[venue]?.length ?? MAX_QUEUE_SHOWN;

  // Seeded, so bench runs replay the same scene. Never zero, or a visit would admit and
  // release in one call and no queue would ever form.
  const dwellTicksFor = (venue: Venue): number => {
    const { min, max } = venue.dwellSeconds;
    return Math.max(1, Math.round((min + random() * (max - min)) / TICK_SECONDS));
  };

  // Only from fields already built: sweeping just to score would make the lazy build eager.
  // Unvisited venues are scored on the straight line.
  const walkingDistanceAt =
    (at: number) =>
    (venue: number): number => {
      // The beach is swept as soon as it is considered: a straight line to the middle
      // of a band says nothing about the distance to the nearest gate.
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

  const occupants = (venue: number): number => occupancy.inside[venue] ?? 0;

  // The synthetic beach lies past the upkeep array and so reads as spotless, which is right.
  const cleanOf = (venue: number): number => cleanliness(parts.upkeep(), venue);

  // Asked every time rather than kept: the day can turn over between ticks.
  const isOpen = (venue: number): boolean => {
    const declared = venues[venue];
    return declared ? isOpenIn(shelterOf(declared), weatherEffect(weatherNow())) : false;
  };

  const affinityOf =
    (person: number) =>
    (venue: number): number =>
      tasteFor(salts[venue] ?? 0, person, TASTE_SPREAD);

  const admitAt = (person: number, venue: number): ArrivalOutcome => {
    // A venue that shuts while somebody is inside is not emptied.
    if (!isOpen(venue)) return 'balked';
    if (queueLength(venue) >= queueLimit(venue)) {
      balkCount[venue]!++;
      return 'balked';
    }
    visitCount[venue]!++;
    const declared = venues[venue]!;
    return arriveAt(occupancy, person, venue, declared.capacity, dwellTicksFor(declared), now);
  };

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
      occupants,
      affinity: affinityOf(person),
      justLeft: justLeft[person]!,
      cleanliness: cleanOf,
      isOpen,
      weather: weatherEffect(weatherNow()),
    });
    if (choice) setPartyGoal(goals, guests, person, choice);
  };

  // The height is the door node's: a venue knows its middle, not the ground height there.
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

  // A source's own field entry is itself, which identifies a door without per-person lists.
  const arriveIfThere = (person: number, at: number): boolean => {
    const goal = goals.venue[person]!;
    if (goal === NO_GOAL || goal >= venues.length) return false;
    const venue = venues[goal]!;
    if (fieldFor(goal).next[at] !== at) return false;
    const overSand = sandRoutes[goal] ?? [];
    if (overSand.length > 0) return setOffOverSand(person, goal, at, overSand);

    const outcome = admitAt(person, goal);
    if (outcome === 'balked') {
      // chooseVenue sees the same full queue, so they will not set off for it again.
      clearPartyGoal(goals, guests, person);
      return false;
    }
    doorOf[person] = at;
    if (!isBeach(venue)) {
      stand(person, goal, at, outcome === 'waiting');
      return true;
    }
    if (settleOnSand(person, at)) return true;
    // No room near this gate: the visit ends here, and the relief keeps them from
    // choosing the same gate again.
    endVisitAtTheGate(person, goal, venue);
    return false;
  };

  // No onVisited: the guest never settled, so there was no visit to have run its course.
  const endVisitAtTheGate = (person: number, at: number, venue: Venue): void => {
    leaveVenue(occupancy, person);
    justLeft[person] = at;
    relieve(needs, person, venue.satisfies);
    clearPartyGoal(goals, guests, person);
    doorOf[person] = -1;
  };

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

  const dropIfEmpty = (claim: Claim, party: number): void => {
    if (claim.holders > 0) return;
    pitched.delete(claim.pitch.tile);
    for (const spot of claim.pitch.spots) promised.delete(spot.seat);
    if (partyPitches[party] === claim) partyPitches[party] = null;
  };

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

  const leaveStay = (person: number): void => {
    const claim = stays[person];
    if (!claim) return;
    stays[person] = null;
    claim.holders--;
    dropIfEmpty(claim, guests.party[person]!);
  };

  const restAtSpot = (person: number, claim: Claim): void => {
    // The spot is the last waypoint, so the walk back starts with the one before.
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

  // Lets guests fetch things without leaving the beach: walking back to the paving meant
  // they never came back, and the sand emptied.
  const sendOnErrands = (): void => {
    const beach = beachIndex();
    if (beach < 0 || !(occupancy.inside[beach]! > 0)) return;
    const people = crowd();
    for (let person = 0; person < guests.count; person++) {
      if (!dueAnotherLook(person, beach, people)) continue;
      // The weather too, or nobody on the sand wants a drink in a heatwave.
      const wanted = strongestNeed(needs, guests, person, weatherEffect(weatherNow()));
      if (!wanted || wanted.urgency < FETCH_URGENCY) continue;
      if (reliefAt(venues[beach]!, wanted.need) > 0) continue;
      lookAgainAt[person] = now + LOOK_AGAIN_TICKS;
      fetchOverTheSand(person, people);
    }
  };

  const dueAnotherLook = (person: number, beach: number, people: Crowd): boolean => {
    if (occupancy.state[person] !== VISIT.inside || occupancy.at[person] !== beach) return false;
    return isWaiting(people, person) && now >= lookAgainAt[person]!;
  };

  // Everything off the sand scores Infinity: leaving the beach is a separate decision,
  // taken when the stay ends. The party goal is untouched.
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
      occupants,
      affinity: affinityOf(person),
      justLeft: justLeft[person]!,
      cleanliness: cleanOf,
      isOpen,
      weather: weatherEffect(weatherNow()),
    });
    if (!choice) return;
    fieldFor(choice.venue);
    const waypoints = sandFieldOf(choice.venue).routeFrom(claim.pitch);
    if (!waypoints) return;
    stayUntil[person] = occupancy.until[person]!;
    stayRoutes[person] = errands.route[person] ?? null;
    // Out of the beach's count while away, or the sweep would end a stay at a bar.
    leaveVenue(occupancy, person);
    fetching[person] = choice.venue;
    setOffAlong(person, choice.venue, { gate: -1, waypoints, length: 0 });
  };

  const acrossTheSandFrom =
    (x: number, z: number) =>
    (venue: number): number =>
      isOnSand(venue)
        ? Math.hypot(venues[venue]!.x - x, venues[venue]!.z - z)
        : Number.POSITIVE_INFINITY;

  // At least a tick, so an expired stay ends from the spot and they leave like anybody else.
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

  const leaveErrand = (person: number, venue: number): void => {
    relieve(needs, person, venues[venue]!.satisfies);
    soil(parts.upkeep(), venue, venues[venue]!.capacity);
    onVisited(person, venues[venue]!);
    const route = errandOf(person);
    const staying = stays[person] !== null && now < stayUntil[person]! && !dueInBed(person);
    if (route && staying) {
      walkBack(person, route);
      return;
    }
    endStayFromErrand(person, venue);
  };

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

  const dueInBed = (person: number): boolean =>
    homeLodging[person]! >= 0 && isBedtime(guests.party[person]!, parts.tickOfDay());

  const beachIndex = (): number => {
    const last = venues.length - 1;
    return last >= 0 && isBeach(venues[last]!) ? last : -1;
  };

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

  const setOffAlong = (person: number, venue: number, route: SandRoute): void => {
    errands.venue[person] = venue;
    errands.route[person] = route;
    errands.leg[person] = 0;
    errands.back[person] = 0;
    const first = route.waypoints[0]!;
    walkSandTo(crowd(), person, first.x, first.z);
  };

  const errandOf = (person: number): SandRoute | undefined =>
    errands.venue[person]! < 0 ? undefined : (errands.route[person] ?? undefined);

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
    // An errand from a pitch started on the sand and never touched the graph.
    if (fetching[person]! >= 0) {
      backToThePitch(person);
      return;
    }
    if (route.gate >= 0 && route.gate < network.nodes.length) {
      releaseTo(crowd(), person, route.gate);
    }
  };

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
    else if (fetching[person]! >= 0) reachSandDoor(person, route);
    else if (stay) restAtSpot(person, stay);
    else reachSandDoor(person, route);
    return -1;
  };

  const reachSandDoor = (person: number, route: SandRoute): void => {
    const venue = errands.venue[person]!;
    const outcome = admitAt(person, venue);
    if (outcome !== 'balked') {
      stand(person, venue, -1, outcome === 'waiting');
      return;
    }
    // Coming from their own pitch, they keep their party's goal.
    if (fetching[person]! < 0) clearPartyGoal(goals, guests, person);
    walkBack(person, route);
  };

  const backOffTheSand = (person: number): void => {
    if (person < 0 || person >= goals.count) return;
    errands.venue[person] = -1;
  };

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

  // The relief is applied here, at the end of the visit, not on arrival.
  const leave = (person: number, venue: number): void => {
    // The whole party: a sibling still arriving would have its goal overwritten by whoever
    // checked in first and decides for them all, and so never reach the desk.
    if (venues[venue]?.receives) for (const member of partyOf(guests, person)) arriving[member] = 0;
    // Before the errand branch, so a drink fetched from a pitch counts too.
    justLeft[person] = venue;
    if (fetching[person] === venue) {
      leaveErrand(person, venue);
      return;
    }
    relieve(needs, person, venues[venue]!.satisfies);
    // Worn on both ways out of a visit, or venues served from the beach would stay spotless.
    soil(parts.upkeep(), venue, venues[venue]!.capacity);
    onVisited(person, venues[venue]!);
    clearPartyGoal(goals, guests, person);
    const door = doorOf[person]!;
    doorOf[person] = -1;
    const overSand = errands.venue[person] === venue ? errandOf(person) : undefined;
    leaveStay(person);
    if (overSand) walkBack(person, overSand);
    else if (door >= 0 && door < network.nodes.length) releaseTo(crowd(), person, door);
  };

  // A guest with no reachable bed gets BY_DAY and walks all night on purpose: the resort
  // should show it. Guests inside a venue at bedtime are never asked; this runs on arrival.
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

  // The door is kept in the visit column, which nobody asleep uses.
  const fallAsleep = (person: number, lodging: number, door: number): void => {
    const people = crowd();
    const { x, z } = lodgings[lodging]!;
    holdAt(people, person, x, network.nodes[door]!.y, z, people.heading[person] ?? 0);
    clearPartyGoal(goals, guests, person);
    doorOf[person] = door;
    asleep[person] = 1;
    asleepCount++;
  };

  // Checks "no longer bedtime" rather than the exact wake tick, which a multi-tick frame
  // or a dragged clock could step over.
  const wakeWhoeverIsUp = (tickOfDay: number): void => {
    for (let person = 0; person < guests.count; person++) {
      if (asleepCount === 0) break;
      if (asleep[person] === 0 || isBedtime(guests.party[person]!, tickOfDay)) continue;
      relieve(needs, person, NIGHT_RELIEF);
      getUp(person);
    }
  };

  const getUp = (person: number): void => {
    asleep[person] = 0;
    homeward[person] = 0;
    asleepCount--;
    const door = doorOf[person]!;
    doorOf[person] = -1;
    if (door >= 0 && door < network.nodes.length) releaseTo(crowd(), person, door);
  };

  // Asked before the night, so a departing guest heads for the gate, not a bed no longer
  // theirs. There is no teleport: a guest who cannot reach a gate stays on the plot.
  const leavingStep = (person: number, at: number): number => {
    if (person < 0 || person >= goals.count || leaving[person] !== 1) return BY_DAY;
    const field = leavingFieldOf();
    const onward = field?.next[at] ?? -1;
    if (onward < 0) return BY_DAY;
    if (onward !== at) return onward;
    leaveThePlot(person);
    return -1;
  };

  const leaveThePlot = (person: number): void => {
    forgetPerson(person);
    parts.onLeave(person);
  };

  const forgetPerson = (person: number): void => {
    if (person < 0 || person >= goals.count) return;
    leaving[person] = 0;
    homeward[person] = 0;
    if (asleep[person] === 1) {
      asleep[person] = 0;
      asleepCount--;
    }
    leaveVenue(occupancy, person);
    leaveStay(person);
    clearPartyGoal(goals, guests, person);
    errands.venue[person] = -1;
    errands.route[person] = null;
    errands.back[person] = 0;
    fetching[person] = -1;
    stayRoutes[person] = null;
    doorOf[person] = -1;
    arriving[person] = 0;
  };

  // Least hops, ties to the lower index; only fields for receiving venues are swept.
  const nearestReception = (at: number): number => {
    let best = -1;
    let bestHops = Number.POSITIVE_INFINITY;
    for (let venue = 0; venue < venues.length; venue++) {
      if (!venues[venue]!.receives) continue;
      const hops = fieldFor(venue).hops[at] ?? -1;
      if (hops < 0 || hops >= bestHops) continue;
      best = venue;
      bestHops = hops;
    }
    return best;
  };

  // A guest who cannot reach a desk was already let in, and must not stand still for ever.
  const sendToDesk = (person: number, at: number): boolean => {
    if (arriving[person] !== 1) return false;
    const reception = nearestReception(at);
    if (reception < 0) {
      arriving[person] = 0;
      return false;
    }
    setPartyVenue(goals, guests, person, reception);
    return true;
  };

  // Answers whether they went in on the spot. Tried at once only if they were not just turned
  // away, which would count a balk twice.
  const setGoal = (person: number, at: number, turnedAway: boolean): boolean => {
    if (sendToDesk(person, at)) return !turnedAway && arriveIfThere(person, at);
    decide(person, at);
    return false;
  };

  const dayStep = (person: number, at: number): number => {
    const hadGoal = goals.venue[person] !== NO_GOAL;
    if (arriveIfThere(person, at)) return -1;
    if (goals.venue[person] === NO_GOAL && setGoal(person, at, hadGoal)) return -1;

    const chosen = goals.venue[person]!;
    if (chosen === NO_GOAL || chosen >= venues.length) return -1;
    const onward = fieldFor(chosen).next[at] ?? -1;
    // Forgotten rather than retried at every arrival; they decide afresh at the next node.
    if (onward < 0) {
      clearPartyGoal(goals, guests, person);
      return -1;
    }
    return onward;
  };

  // The one place an out-of-range person index is turned away; later code indexes columns.
  const nightStep = (person: number, at: number): number => {
    if (person < 0 || person >= goals.count) return -1;
    if (asleep[person] === 1) return -1;
    homeward[person] = 0;
    if (!isBedtime(guests.party[person]!, parts.tickOfDay())) return BY_DAY;
    return homewardStep(person, at);
  };

  return {
    step(person, at) {
      if (at === ON_SAND) return alongTheSand(person);
      backOffTheSand(person);
      const away = leavingStep(person, at);
      if (away !== BY_DAY) return away;
      const night = nightStep(person, at);
      if (night !== BY_DAY) return night;
      return dayStep(person, at);
    },

    offTheSand(person) {
      if (person < 0 || person >= goals.count || asleep[person] === 1) return false;
      return homeLodging[person]! >= 0 && isBedtime(guests.party[person]!, parts.tickOfDay());
    },

    sendHome(person) {
      if (person < 0 || person >= goals.count || leaving[person] === 1) return;
      leaving[person] = 1;
      clearPartyGoal(goals, guests, person);
      if (asleep[person] === 1) getUp(person);
    },

    admit(person, node) {
      if (person < 0 || person >= goals.count) return;
      forgetPerson(person);
      arriving[person] = 1;
      // The body was somebody else's, or nobody's, so the bed it walked to is not theirs.
      const home = homeOf(guests, person);
      homeLodging[person] = home ? lodgingFor(lodgings, home.key) : -1;
      const people = crowd();
      const gate = network.nodes[node];
      // Stood at the gate first, or a body dealt on an empty plot walks in from the origin.
      if (gate) holdAt(people, person, gate.x, gate.y, gate.z, people.heading[person] ?? 0);
      putOnPlot(people, person, node);
    },

    forget(person) {
      forgetPerson(person);
    },

    get arrivalNode() {
      return gateNodesOf()[0] ?? -1;
    },

    get receptionReachable() {
      const gate = gateNodesOf()[0];
      return gate !== undefined && nearestReception(gate) >= 0;
    },

    isArriving(person) {
      return arriving[person] === 1;
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

    rebuild(nextVenues, nextLodgings, nextGateways, nextNetwork) {
      venues = withBeach(nextVenues, nextNetwork);
      lodgings = nextLodgings;
      gateways = nextGateways;
      network = nextNetwork;
      index = nodeIndexFor(nextNetwork);
      fields = venues.map(() => null);
      lanes = venues.map(() => null);
      sandRoutes = venues.map(() => null);
      errands = createErrands(guests.count);
      homeFields = nextLodgings.map(() => null);
      leavingField = null;
      gateNodes = null;
      // Leavers are re-sent on the next day's pass; their node indices mean nothing now.
      leaving = new Uint8Array(guests.count);
      built = 0;
      findHomes();
      // Everybody is woken: a guest asleep across a rebuild would be held forever.
      asleep = new Uint8Array(guests.count);
      asleepCount = 0;
      homeward = new Uint8Array(guests.count);
      // A fresh one: the per-venue arrays are sized to the replaced venue list.
      occupancy = createOccupancy(guests.count, venues.length);
      doorOf = new Int32Array(guests.count).fill(-1);
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
      balkCount = new Int32Array(venues.length);
      visitCount = new Int32Array(venues.length);
      salts = saltsFor(venues);
      justLeft = new Int32Array(guests.count).fill(-1);
      clearAllGoals(goals);
      // Nobody is let go: `reseatCrowd` walks every held person to the nearest new node.
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

    isWaitingAt(person) {
      return occupancy.state[person] === VISIT.waiting;
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

    // Built on demand: read once a day, but written on every arrival.
    dayBalks() {
      return tallyOf(venues, balkCount);
    },

    dayVisits() {
      return tallyOf(venues, visitCount);
    },

    forgetTheDay() {
      balkCount.fill(0);
      visitCount.fill(0);
    },
  };
}

function tallyOf(venues: readonly Venue[], counts: Int32Array): ReadonlyMap<string, number> {
  const tally = new Map<string, number>();
  for (let venue = 0; venue < venues.length; venue++) {
    const count = counts[venue] ?? 0;
    if (count > 0) tally.set(venues[venue]!.key, count);
  }
  return tally;
}

// The beach goes last so every building keeps the index `venuesOn` gave it.
function withBeach(venues: readonly Venue[], network: WalkNetwork): readonly Venue[] {
  const beach = beachVenueFor(network);
  return beach ? [...venues, beach] : venues;
}

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

// One lane per venue: a queue split between two doors would scatter its slots.
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

function saltsFor(venues: readonly Venue[]): Int32Array {
  const salts = new Int32Array(venues.length);
  for (const [index, venue] of venues.entries()) salts[index] = saltFor(venue.key);
  return salts;
}
