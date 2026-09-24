import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Shelter } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { seatSpotsFor } from '../../crowd/domain/seating';
import {
  createCrowd,
  holdAt,
  isOffPlot,
  isRoaming,
  isWaiting,
  MAX_STEP,
  releaseTo,
  reseatCrowd,
  RESTING,
  restingOn,
  seatIsFree,
  stepCrowd,
  takeOffPlot,
  type Crowd,
} from '../../crowd/domain/crowd';
import { blockedAt } from '../../crowd/domain/sandGrid';
import type { SeatSpot } from '../../crowd/domain/seating';
import {
  BEACH_SURFACE,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
} from '../../crowd/domain/walkNetwork';
import {
  bedCount,
  checkOutParty,
  createGuests,
  homeOf,
  partyOf,
  presentCount,
  type Guests,
} from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { NO_HOME, type Home } from '../../guests/domain/homes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createNeeds, decayNeeds, NEEDS, type Needs } from './needs';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { doorsFor } from './doors';
import { gatewaysOn, type Gateway } from './gateways';
import { lodgingFor, lodgingsOn, type Lodging } from './lodgings';
import { bedtimeOf } from './night';
import { MAX_QUEUE_SHOWN, queueLaneFor, sandLaneFor } from './queueLane';
import { sandRoutesFor } from './sandRoute';
import { ARCHETYPES } from './archetypes';
import { beachVenueFor, isBeach } from './beach';
import { crowdScaleFor } from './crowdRate';
import { arrivalsDueBy, checkInDue, freeBedsOn, runCheckIn, wavesDue } from './checkIn';
import { createHappiness, meanHappiness } from './happiness';
import { arrivalsFor, ratingFor } from './rating';
import { createRouter, type Router } from './router';
import { advanceClock, createSimClock, SPEED_DAY_SECONDS, withSpeed } from './simClock';
import { reliefAt, shelterOf, venuesOn, type Venue } from './venues';
import { isOpenIn, weatherEffect, type Weather } from './weather';
import { cleanliness, createUpkeep, NEEDS_CLEANING, type Upkeep } from './upkeep';
import { onDuty, rosterFor, staffPool } from './staff';
import { createStaffRouter, meanCleanliness } from './staffRouter';

const FLAT: LevelProvider = () => 0;

const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

const NOON = 12 * 60;

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guests: Guests = createGuests({
  count: 60,
  homes: HOMES,
  variants: 4,
  childVariant: 3,
  seed: 5,
});

const bakery = (tileX: number): Venue => ({
  key: 'bakery#0',
  id: 'bakery',
  label: 'Bakery',
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
  x: (tileX + 0.5) * TILE_VOXELS,
  z: -0.5 * TILE_VOXELS,
  tileX,
  tileZ: -1,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

const wanting = (person: number, need: (typeof NEEDS)[number] | null): Needs => {
  const needs = createNeeds(guests, 7);
  for (let other = 0; other < guests.count; other++) {
    for (const each of NEEDS) needs.level[each][other] = 1;
  }
  if (need !== null) needs.level[need][person] = 0;
  return needs;
};

const spotless = (venues: number): (() => Upkeep) => {
  const upkeep = createUpkeep(venues);
  return () => upkeep;
};

const routerOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  needs: Needs,
  night: {
    readonly lodgings: readonly Lodging[];
    readonly tickOfDay: () => number;
    readonly gateways?: readonly Gateway[];
    readonly onLeave?: (person: number) => void;
  } = {
    lodgings: [],
    tickOfDay: () => NOON,
  },
  roamsBeach = true,
  weather: Weather = 'clear',
): { router: ReturnType<typeof createRouter>; crowd: Crowd; upkeep: Upkeep } => {
  let crowd: Crowd | null = null;
  const upkeep = createUpkeep(venues.length);
  const router = createRouter({
    guests,
    needs,
    venues,
    lodgings: night.lodgings,
    gateways: night.gateways ?? [],
    onLeave: night.onLeave ?? (() => {}),
    network,
    tickOfDay: night.tickOfDay,
    crowd: () => crowd!,
    upkeep: () => upkeep,
    weather: () => weather,
    seed: 13,
  });
  crowd = createCrowd({
    network,
    count: guests.count,
    variants: 4,
    seed: 3,
    routeOf: (person, at) => router.step(person, at),
    roamsBeach,
  });
  for (let person = 0; person < crowd.count; person++) {
    crowd.x[person] = 0;
    crowd.z[person] = 0;
  }
  return { router, crowd, upkeep };
};

describe('createRouter', () => {
  it('walks a hungry guest towards the bakery from anywhere along the corridor', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const { router } = routerOn(network, [bakery(7)], needs);
    for (const tileX of [0, 2, 5]) {
      expect(router.step(0, nodeAt(network, tileX)), `tile ${tileX}`).toBe(
        nodeAt(network, tileX + 1),
      );
    }
  });

  it('leaves a guest on the sand by day, even with an errand to run', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [bakery(7)], wanting(0, 'hunger'));
    router.step(0, nodeAt(network, 0));
    expect(router.goalOf(0)).not.toBeNull();
    expect(router.offTheSand(0)).toBe(false);
    expect(router.offTheSand(-1)).toBe(false);
  });

  it('leaves a content guest to wander', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [bakery(7)], wanting(0, null));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
  });

  it('leaves a guest to wander when nothing on the plot serves what they want', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [bakery(7)], wanting(0, 'hygiene'));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
  });

  it('holds a guest inside for the declared dwell, and feeds them on the way out', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const { router, crowd } = routerOn(network, [bakery(7)], needs);
    const door = nodeAt(network, 7);
    router.step(0, nodeAt(network, 0));
    expect(router.goalOf(0)?.key).toBe('bakery#0');

    expect(router.step(0, door)).toBe(-1);
    expect(isWaiting(crowd, 0), 'walked straight through the bakery').toBe(true);
    expect(needs.level.hunger[0]).toBe(0);
    expect(router.occupancyOf('bakery#0')).toEqual({ inside: 1, waiting: 0 });

    for (let tick = 1; tick <= 8; tick++) router.tick(tick);
    expect(needs.level.hunger[0]).toBeCloseTo(0.5);
    expect(isWaiting(crowd, 0)).toBe(false);
    expect(router.occupancyOf('bakery#0')).toEqual({ inside: 0, waiting: 0 });
  });

  it('wears the venue a visit was made to, on the way out with the relief', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const { router, upkeep } = routerOn(network, [bakery(7)], needs);
    router.step(0, nodeAt(network, 0));
    router.step(0, nodeAt(network, 7));
    expect(cleanliness(upkeep, 0)).toBe(1);

    for (let tick = 1; tick <= 8; tick++) router.tick(tick);
    expect(needs.level.hunger[0]).toBeCloseTo(0.5);
    expect(cleanliness(upkeep, 0)).toBeLessThan(1);
  });

  it('aims a party member who decided nothing at the venue their sibling chose', () => {
    const network = networkOf(street(8));
    const person = [...Array(guests.count).keys()].find(
      (candidate) => partyOf(guests, candidate).length > 1,
    )!;
    const sibling = partyOf(guests, person).find((member) => member !== person)!;
    const { router } = routerOn(network, [bakery(7)], wanting(person, 'hunger'));

    router.step(person, nodeAt(network, 0));
    expect(router.goalOf(sibling)?.key).toBe('bakery#0');
    expect(router.step(sibling, nodeAt(network, 3))).toBe(nodeAt(network, 4));
  });

  it('builds one field per venue and no more, however many guests walk to it', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    needs.level.hunger[1] = 0;
    const { router } = routerOn(network, [bakery(7)], needs);
    expect(router.fieldCount).toBe(0);
    router.step(0, nodeAt(network, 0));
    expect(router.fieldCount).toBe(1);
    router.step(1, nodeAt(network, 2));
    expect(router.fieldCount).toBe(1);
  });

  it('leaves a guest to wander towards a venue with no door at all', () => {
    const network = networkOf(street(8));
    const stranded = { ...bakery(3), tileZ: 5, z: 5.5 * TILE_VOXELS };
    const { router } = routerOn(network, [stranded], wanting(0, 'hunger'));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    expect(router.goalOf(0)).toBeNull();
  });

  const threeApart = (): [number, number, number] => {
    const parties = new Set<number>();
    const found: number[] = [];
    for (let person = 0; person < guests.count && found.length < 3; person++) {
      const party = guests.party[person]!;
      if (parties.has(party)) continue;
      parties.add(party);
      found.push(person);
    }
    return found as [number, number, number];
  };

  const famished = (): Needs => {
    const needs = wanting(0, 'hunger');
    for (let person = 0; person < guests.count; person++) needs.level.hunger[person] = 0;
    return needs;
  };

  it('walks a guest past the bakeries that are filling up, with no line at any of them', () => {
    const network = networkOf(street(40));
    const holdsOne = (tileX: number, key: string): Venue => ({
      ...bakery(tileX),
      key,
      capacity: 1,
    });
    const near = [holdsOne(25, 'bakery#0'), holdsOne(35, 'bakery#1')];
    const far = holdsOne(0, 'bakery#2');
    const standing = [...near, far];
    const [first, second, third] = threeApart();
    const at = nodeAt(network, 30);

    const quiet = routerOn(network, standing, famished());
    quiet.router.step(third, at);
    expect(near.map((venue) => venue.key)).toContain(quiet.router.goalOf(third)?.key);

    const { router } = routerOn(network, standing, famished());
    const walkIn = (person: number): void => {
      router.step(person, at);
      const goal = router.goalOf(person)!;
      router.step(person, nodeAt(network, goal.tileX));
    };
    walkIn(first);
    walkIn(second);
    expect(router.visitOf(first)?.venue.key).not.toBe(router.visitOf(second)?.venue.key);
    for (const venue of near)
      expect(router.occupancyOf(venue.key)).toEqual({ inside: 1, waiting: 0 });

    router.step(third, at);
    expect(router.goalOf(third)?.key).toBe('bakery#2');
  });

  it('sends a guest to the other bakery on the way out of one, and forgets it on a rebuild', () => {
    const network = networkOf(street(40));
    const east = { ...bakery(25), key: 'bakery#0' };
    const west = { ...bakery(35), key: 'bakery#1' };
    const standing = [east, west];
    const needs = wanting(0, 'hunger');
    const { router } = routerOn(network, standing, needs);
    const at = nodeAt(network, 30);

    router.step(0, at);
    const chosen = router.goalOf(0)!;
    const other = standing.find((venue) => venue.key !== chosen.key)!;
    router.step(0, nodeAt(network, chosen.tileX));
    expect(router.visitOf(0)?.venue.key).toBe(chosen.key);
    for (let tick = 1; tick <= 12; tick++) router.tick(tick);
    expect(router.visitOf(0)).toBeNull();

    needs.level.hunger[0] = 0;
    router.step(0, nodeAt(network, chosen.tileX));
    expect(router.goalOf(0)?.key, 'walked straight back into the one they left').toBe(other.key);

    router.rebuild(standing, [], [], network);
    needs.level.hunger[0] = 0;
    router.step(0, at);
    expect(router.goalOf(0)?.key).toBe(chosen.key);
  });

  it('throws away its fields and its goals when the graph is rebuilt', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [bakery(7)], wanting(0, 'hunger'));
    router.step(0, nodeAt(network, 0));
    expect(router.fieldCount).toBe(1);
    expect(router.goalOf(0)).not.toBeNull();

    const rebuilt = networkOf(street(10));
    router.rebuild([bakery(9)], [], [], rebuilt);
    expect(router.fieldCount).toBe(0);
    expect(router.goalOf(0)).toBeNull();
  });
});

const gateway = (tileX: number): Gateway => ({
  key: 'entrance#0',
  tileX,
  tileZ: -1,
  tilesX: 1,
  tilesZ: 1,
  x: (tileX + 0.5) * TILE_VOXELS,
  z: -0.5 * TILE_VOXELS,
  doors: [],
});

describe('a stay that is over', () => {
  const leavingOn = (onLeave?: (person: number) => void) => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const { router, crowd } = routerOn(network, [bakery(7)], needs, {
      lodgings: [],
      tickOfDay: () => NOON,
      gateways: [gateway(0)],
      ...(onLeave ? { onLeave } : {}),
    });
    return { network, needs, router, crowd };
  };

  it('walks a guest whose stay is over towards the gate from anywhere on the corridor', () => {
    const { network, router } = leavingOn();
    router.sendHome(0);
    for (const tileX of [6, 4, 2]) {
      expect(router.step(0, nodeAt(network, tileX)), `tile ${tileX}`).toBe(
        nodeAt(network, tileX - 1),
      );
    }
    expect(router.arrivalNode, 'no way onto the plot either').toBeGreaterThanOrEqual(0);
  });

  it('hands somebody who reaches the gate over once, and only once', () => {
    const left: number[] = [];
    const { network, router } = leavingOn((person) => left.push(person));
    router.sendHome(0);
    router.sendHome(0);
    expect(left).toEqual([]);

    expect(router.step(0, nodeAt(network, 1)), 'the crowd must not aim them anywhere').toBe(-1);
    expect(left).toEqual([0]);
    router.step(0, nodeAt(network, 1));
    expect(left, 'handed over twice').toEqual([0]);
  });

  it('does not drag a guest out of a venue, and walks them out when the visit ends', () => {
    const left: number[] = [];
    const { network, needs, router, crowd } = leavingOn((person) => left.push(person));
    router.step(0, nodeAt(network, 0));
    expect(router.step(0, nodeAt(network, 7))).toBe(-1);
    expect(isWaiting(crowd, 0)).toBe(true);

    router.sendHome(0);
    expect(isWaiting(crowd, 0), 'dragged out of the bakery to catch a coach').toBe(true);
    expect(left).toEqual([]);
    expect(router.occupancyOf('bakery#0')).toEqual({ inside: 1, waiting: 0 });

    for (let tick = 1; tick <= 8; tick++) router.tick(tick);
    expect(isWaiting(crowd, 0)).toBe(false);
    expect(needs.level.hunger[0], 'they were fed on the way out all the same').toBeCloseTo(0.5);
    expect(router.step(0, nodeAt(network, 6))).toBe(nodeAt(network, 5));
  });

  it('puts somebody who checks in back on the plot, walking like anybody else', () => {
    const { network, router, crowd } = leavingOn();
    takeOffPlot(crowd, 0, 0, 0, 0);
    router.sendHome(0);

    router.admit(0, nodeAt(network, 0));
    expect(isOffPlot(crowd, 0)).toBe(false);
    expect(crowd.node[0]).toBe(nodeAt(network, 0));
    expect(router.step(0, nodeAt(network, 2))).toBe(nodeAt(network, 3));
    expect(router.goalOf(0)?.key).toBe('bakery#0');
  });
});

const TICKS_EVERY = 2;

const TICKS_PER_DAY = 1440;

const OPENS_AT = 8 * 60;

describe('a venue that holds only as many as it says', () => {
  const shower = (tileX: number): Venue => ({
    ...bakery(tileX),
    key: 'beach-shower#0',
    id: 'beach-shower',
    label: 'Beach shower',
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.6 }],
    capacity: 1,
    dwellSeconds: { min: 30, max: 90 },
  });

  const strangers = (): [number, number] => {
    const first = 0;
    const second = [...Array(guests.count).keys()].find(
      (person) => guests.party[person] !== guests.party[first],
    )!;
    return [first, second];
  };

  const grubby = (): Needs => {
    const needs = wanting(0, 'hygiene');
    for (let person = 0; person < guests.count; person++) needs.level.hygiene[person] = 0;
    return needs;
  };

  it('takes the first guest in and stands the second in the line outside', () => {
    const network = networkOf(street(8));
    const { router, crowd } = routerOn(network, [shower(7)], grubby());
    const [first, second] = strangers();
    const door = nodeAt(network, 7);
    for (const person of [first, second]) router.step(person, nodeAt(network, 0));

    expect(router.step(first, door)).toBe(-1);
    expect(router.step(second, door)).toBe(-1);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 1 });
    expect(isWaiting(crowd, first)).toBe(true);
    expect(isWaiting(crowd, second)).toBe(true);
    expect(crowd.x[first]).toBeCloseTo(shower(7).x);
    expect(crowd.z[first]).toBeCloseTo(shower(7).z);
    expect(crowd.z[second]).toBeGreaterThan(crowd.z[first]!);
  });

  it('leaves both of them standing for as long as the clock does not run', () => {
    const network = networkOf(street(8));
    const { router, crowd } = routerOn(network, [shower(7)], grubby());
    const [first, second] = strangers();
    const door = nodeAt(network, 7);
    for (const person of [first, second]) router.step(person, nodeAt(network, 0));
    router.step(first, door);
    router.step(second, door);
    const where = [crowd.x[first], crowd.z[first], crowd.x[second], crowd.z[second]];

    for (let step = 0; step < 200; step++) stepCrowd(crowd, MAX_STEP);
    expect([crowd.x[first], crowd.z[first], crowd.x[second], crowd.z[second]]).toEqual(where);
    expect(router.occupancyOf('beach-shower#0')?.inside).toBe(1);
  });

  it('lets the first out with their need met and the second in, on the same tick', () => {
    const network = networkOf(street(8));
    const needs = grubby();
    const { router, crowd } = routerOn(network, [shower(7)], needs);
    const [first, second] = strangers();
    const door = nodeAt(network, 7);
    for (const person of [first, second]) router.step(person, nodeAt(network, 0));
    router.step(first, door);
    router.step(second, door);

    router.tick(1);
    expect(needs.level.hygiene[first]).toBeCloseTo(0.6);
    expect(isWaiting(crowd, first)).toBe(false);
    expect(needs.level.hygiene[second]).toBe(0);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 0 });
    expect(crowd.x[second]).toBeCloseTo(shower(7).x);
  });

  it('sends a guest who finds a full line somewhere else entirely', () => {
    const network = networkOf(street(20));
    const needs = grubby();
    const near = shower(2);
    const far: Venue = {
      ...shower(7),
      key: 'beach-shower#1',
      satisfies: [{ need: 'hygiene', amount: 0.01 }],
    };
    const { router } = routerOn(network, [near, far], needs);
    const door = nodeAt(network, 2);
    const queued = [...Array(guests.count).keys()].slice(0, MAX_QUEUE_SHOWN + 1);
    for (const person of queued) {
      router.step(person, nodeAt(network, 0));
      router.step(person, door);
    }
    expect(router.occupancyOf('beach-shower#0')).toEqual({
      inside: 1,
      waiting: MAX_QUEUE_SHOWN,
    });

    const late = guests.count - 1;
    router.step(late, nodeAt(network, 0));
    router.step(late, door);
    expect(router.goalOf(late)?.key).toBe('beach-shower#1');
    expect(router.occupancyOf('beach-shower#0')?.waiting).toBe(MAX_QUEUE_SHOWN);
  });

  it('stands the line back along the paving, not out along a ray from the venue', () => {
    const network = networkOf(street(8));
    const { router, crowd } = routerOn(network, [shower(7)], grubby());
    const door = nodeAt(network, 7);
    const people = [0, 1, 2];
    for (const person of people) {
      router.step(person, nodeAt(network, 0));
      router.step(person, door);
    }
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 2 });
    const [, front, behind] = people as [number, number, number];
    const node = network.nodes[door]!;
    expect(crowd.x[front]).toBeCloseTo(node.x);
    expect(crowd.z[front]).toBeCloseTo(node.z);
    expect(crowd.z[behind]).toBeCloseTo(node.z);
    expect(crowd.x[behind]).toBeLessThan(node.x);
  });

  it('balks the guest who finds the lane down a short spur already full', () => {
    const network = networkOf([
      { tileX: 7, tileZ: 0, y: 0 },
      { tileX: 7, tileZ: 1, y: 0 },
    ]);
    const { router } = routerOn(network, [shower(7)], grubby());
    const door = nodeAt(network, 7, 0);
    const start = nodeAt(network, 7, 1);
    const arrive = (person: number): void => {
      router.step(person, start);
      router.step(person, door);
    };
    for (const person of [0, 1, 2, 3]) arrive(person);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 3 });

    const late = 4;
    arrive(late);
    expect(router.occupancyOf('beach-shower#0')?.waiting).toBe(3);
    expect(router.visitOf(late)).toBeNull();
    expect(router.goalOf(late)).toBeNull();
  });

  it('throws the lanes away with the fields, and lays new ones on the new graph', () => {
    const { router, crowd } = routerOn(networkOf(street(8)), [shower(7)], grubby());
    const queue = (network: WalkNetwork): void => {
      for (const person of [0, 1]) {
        router.step(person, nodeAt(network, 0, network.nodes[0]!.tileZ));
        router.step(person, nodeAt(network, 7, network.nodes[0]!.tileZ));
      }
    };
    queue(networkOf(street(8)));
    expect(crowd.z[1]).toBeCloseTo(TILE_VOXELS / 2);

    const moved = networkOf(Array.from({ length: 8 }, (_, tileX) => ({ tileX, tileZ: 3, y: 0 })));
    router.rebuild([{ ...shower(7), tileZ: 2, z: 2.5 * TILE_VOXELS }], [], [], moved);
    for (const person of [0, 1]) releaseTo(crowd, person, nodeAt(moved, 0, 3));
    queue(moved);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 1 });
    expect(crowd.z[1]).toBeCloseTo(3.5 * TILE_VOXELS);
  });

  it('counts a guest it let in as a visit, and one it turned away as a balk', () => {
    const network = networkOf([
      { tileX: 7, tileZ: 0, y: 0 },
      { tileX: 7, tileZ: 1, y: 0 },
    ]);
    const { router } = routerOn(network, [shower(7)], grubby());
    const door = nodeAt(network, 7, 0);
    const start = nodeAt(network, 7, 1);
    const arrive = (person: number): void => {
      router.step(person, start);
      router.step(person, door);
    };
    expect(router.dayVisits().size).toBe(0);
    expect(router.dayBalks().size).toBe(0);

    for (const person of [0, 1, 2, 3]) arrive(person);
    expect(router.dayVisits()).toEqual(new Map([['beach-shower#0', 4]]));
    expect(router.dayBalks().size).toBe(0);

    arrive(4);
    expect(router.dayVisits().get('beach-shower#0')).toBe(4);
    expect(router.dayBalks()).toEqual(new Map([['beach-shower#0', 1]]));
  });

  it('starts a fresh day on forgetTheDay, and on a rebuild', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [shower(7)], grubby());
    const door = nodeAt(network, 7);
    for (const person of [0, 1, 2]) {
      router.step(person, nodeAt(network, 0));
      router.step(person, door);
    }
    expect(router.dayVisits().get('beach-shower#0')).toBe(3);

    router.forgetTheDay();
    expect(router.dayVisits().size).toBe(0);
    expect(router.dayBalks().size).toBe(0);
    expect(router.occupancyOf('beach-shower#0')?.inside).toBe(1);

    for (const person of [0, 1, 2]) router.step(person, door);
    expect(router.dayVisits().size).toBeGreaterThan(0);
    router.rebuild([shower(7)], [], [], networkOf(street(8)));
    expect(router.dayVisits().size).toBe(0);
    expect(router.dayBalks().size).toBe(0);
  });

  it('counts everybody inside and everybody in a line for the stats readout', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [shower(7)], grubby());
    expect(router.occupancyTotals).toEqual({ inside: 0, waiting: 0 });
    const door = nodeAt(network, 7);
    for (const person of [0, 1, 2]) {
      router.step(person, nodeAt(network, 0));
      router.step(person, door);
    }
    expect(router.occupancyTotals).toEqual({ inside: 1, waiting: 2 });
    expect(router.occupancyOf('nothing#0')).toBeNull();
  });

  it('empties every venue when the graph is rebuilt under it', () => {
    const network = networkOf(street(8));
    const { router, crowd } = routerOn(network, [shower(7)], grubby());
    const door = nodeAt(network, 7);
    for (const person of [0, 1, 2]) {
      router.step(person, nodeAt(network, 0));
      router.step(person, door);
    }
    expect(router.occupancyTotals).toEqual({ inside: 1, waiting: 2 });

    const rebuilt = networkOf(street(10));
    router.rebuild([shower(9)], [], [], rebuilt);
    expect(router.occupancyTotals).toEqual({ inside: 0, waiting: 0 });
    const reseated = reseatCrowd(crowd, rebuilt);
    for (const person of [0, 1, 2]) expect(isWaiting(reseated, person)).toBe(false);
  });
});

const hotel = (tileZ = -1): Lodging => ({
  key: 'hotel#0',
  id: 'hotel',
  label: 'Hotel',
  beds: 40,
  dwellSeconds: { min: 25_200, max: 32_400 },
  tileX: 0,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  x: 0.5 * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  doors: [],
});

const untilSettled = (crowd: Crowd, people: readonly number[]): boolean => {
  for (let step = 0; step < 600; step++) {
    if (people.every((person) => isWaiting(crowd, person))) return true;
    stepCrowd(crowd, MAX_STEP);
  }
  return false;
};

const resting = (crowd: Crowd, person: number): boolean =>
  [RESTING.sitting, RESTING.lying].includes(restingOn(crowd, person) as 2 | 3);

describe('a visit to the beach', () => {
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const paved: PavedTile[] = Array.from({ length: 8 }, (_, index) => ({
    tileX: 10,
    tileZ: 10 + index,
    y: 0,
  }));
  const network = walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20 });

  const bored = () => {
    const needs = wanting(0, 'fun');
    const { router, crowd } = routerOn(network, [], needs);
    router.step(0, nodeAt(network, 10, 10));
    return { needs, router, crowd };
  };

  it('is chosen for fun on a plot with a beach, and walked to at the nearest gate', () => {
    const { router } = bored();
    expect(router.goalOf(0)?.label).toBe('Beach');
    expect(router.fieldCount).toBe(1);
    expect(router.step(0, nodeAt(network, 10, 11))).not.toBe(-1);
  });

  const loungers: SeatSpot[] = [
    [13, 12],
    [12, 13],
  ].map(([tileX, tileZ]) => ({
    x: (tileX! + 0.5) * TILE_VOXELS,
    z: (tileZ! + 0.5) * TILE_VOXELS,
    y: BEACH_SURFACE + 5,
    heading: 0,
    pose: 'lie' as const,
    tileX: tileX!,
    tileZ: tileZ!,
  }));

  const onTheBeach = (
    people: readonly number[],
    options: {
      readonly walked?: WalkNetwork;
      readonly night?: Parameters<typeof routerOn>[3];
      readonly venues?: readonly Venue[];
    } = {},
  ) => {
    const walked = options.walked ?? network;
    const needs = wanting(people[0]!, 'fun');
    for (const person of people) needs.level.fun[person] = 0;
    const { router, crowd, upkeep } = routerOn(
      walked,
      options.venues ?? [],
      needs,
      options.night,
      false,
    );
    const above = walked.nodes[nodeAt(walked, 10, 11)]!;
    for (const person of people) {
      router.step(person, nodeAt(walked, 10, 10));
      holdAt(crowd, person, above.x, above.y, above.z, 0);
      releaseTo(crowd, person, walked.gates[0]!);
    }
    return { needs, router, crowd, upkeep };
  };

  const family = guests.parties.find(
    (party) => party.kind === 'family' && party.members.some((m) => guests.child[m] === 1),
  )!.members;

  const SAND_TICKS_EVERY = 10;

  it('settles a bored guest on the sand for the visit, and walks them back to the gate after', () => {
    const { needs, router, crowd } = onTheBeach([0]);
    let roamed = false;
    let rested: { x: number; z: number; stay: string | null } | null = null;
    let setOffFrom = -1;
    let backAt = -1;
    let jumped = 0;
    for (let step = 0; step < 4000 && backAt === -1; step++) {
      const was = { x: crowd.x[0]!, z: crowd.z[0]! };
      if (crowd.node[0]! >= 0) setOffFrom = crowd.node[0]!;
      stepCrowd(crowd, MAX_STEP);
      if (step % SAND_TICKS_EVERY === 0) router.tick(step / SAND_TICKS_EVERY);
      jumped = Math.max(jumped, Math.hypot(crowd.x[0]! - was.x, crowd.z[0]! - was.z));
      roamed ||= isRoaming(crowd, 0);
      if (!rested && isWaiting(crowd, 0)) {
        expect(resting(crowd, 0), 'held standing on the sand').toBe(true);
        rested = { x: crowd.x[0]!, z: crowd.z[0]!, stay: router.stayOf(0) };
      }
      if (rested && router.visitOf(0) === null && crowd.node[0]! >= 0) backAt = crowd.node[0]!;
    }
    expect(rested, 'never settled anywhere').not.toBeNull();
    expect(rested!.stay).toBe('resting');
    const tileX = Math.floor(rested!.x / TILE_VOXELS);
    const tileZ = Math.floor(rested!.z / TILE_VOXELS);
    expect(terrainAt(shore, tileX, tileZ)).toBe('beach');
    expect(Math.abs(tileX - 10) + Math.abs(tileZ - 12)).toBeLessThanOrEqual(12);
    expect(roamed, 'wandered the beach').toBe(false);
    expect(needs.level.fun[0]).toBeGreaterThan(0.5);
    expect(backAt, 'never came back onto the boardwalk').toBe(setOffFrom);
    expect(network.gates).toContain(backAt);
    expect(jumped).toBeLessThan(TILE_VOXELS / 2);
  });

  it('settles a family together, the adults lying down and the children sitting', () => {
    const { router, crowd } = onTheBeach(family);
    expect(untilSettled(crowd, family), 'the family never all settled').toBe(true);
    for (const person of family) {
      expect(router.stayOf(person)).toBe('resting');
      const child = guests.child[person] === 1;
      expect(restingOn(crowd, person)).toBe(child ? RESTING.sitting : RESTING.lying);
      for (const other of family) {
        const apart = Math.hypot(
          crowd.x[person]! - crowd.x[other]!,
          crowd.z[person]! - crowd.z[other]!,
        );
        expect(apart).toBeLessThanOrEqual(2 * TILE_VOXELS);
      }
    }
  });

  it('lies the adults on the free loungers beside the pitch, and frees them after', () => {
    const walked = walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20, seats: loungers });
    expect(walked.beachSeats).toHaveLength(2);
    const { router, crowd } = onTheBeach(family, { walked });
    expect(untilSettled(crowd, family)).toBe(true);
    const adults = family.filter((person) => guests.child[person] !== 1);
    const held = adults.map((adult) => crowd.seat[adult]!);
    for (const adult of adults) expect(restingOn(crowd, adult)).toBe(RESTING.lying);
    expect(new Set(held)).toEqual(new Set(walked.beachSeats));

    const freed = new Set<number>();
    for (let tick = 1; tick <= 130 && freed.size < adults.length; tick++) {
      router.tick(tick);
      for (const [index, adult] of adults.entries()) {
        if (router.visitOf(adult) === null && !freed.has(adult)) {
          expect(seatIsFree(crowd, held[index]!), 'a lounger held after the stay').toBe(true);
          freed.add(adult);
        }
      }
    }
    expect(freed.size, 'the stay never ended').toBe(adults.length);
  });

  it('pitches two parties at the same gate on different tiles', () => {
    const second = [...Array(guests.count).keys()].find(
      (person) => guests.party[person] !== guests.party[0],
    )!;
    const { crowd } = onTheBeach([0, second]);
    expect(untilSettled(crowd, [0, second])).toBe(true);
    const tileOf = (person: number): string =>
      `${Math.floor(crowd.x[person]! / TILE_VOXELS)},${Math.floor(crowd.z[person]! / TILE_VOXELS)}`;
    expect(tileOf(0)).not.toBe(tileOf(second));
  });

  it('ends the stay of a guest with a bed at their bedtime, and walks them back', () => {
    const housed = [...Array(guests.count).keys()].find((person) => homeOf(guests, person))!;
    const { sleepAt } = bedtimeOf(guests.party[housed]!);
    const { needs, router, crowd } = onTheBeach([housed], {
      night: { lodgings: [hotel()], tickOfDay: () => NOON },
    });
    router.tick(sleepAt - 3);
    expect(untilSettled(crowd, [housed])).toBe(true);
    expect(router.visitOf(housed)).not.toBeNull();
    router.tick(sleepAt - 2);
    expect(isWaiting(crowd, housed), 'called in before bed').toBe(true);

    router.tick(sleepAt);
    expect(router.visitOf(housed)).toBeNull();
    expect(isWaiting(crowd, housed), 'still lying on the sand at bedtime').toBe(false);
    expect(router.stayOf(housed)).toBe('leaving');
    expect(needs.level.fun[housed]).toBeGreaterThan(0.5);
  });

  const kiosk: Venue = {
    ...bakery(13),
    key: 'poolside-bar#0',
    id: 'poolside-bar',
    label: 'Poolside Bar',
    role: 'drink',
    satisfies: [{ need: 'thirst', amount: 1 }],
    capacity: 4,
    dwellSeconds: { min: 60, max: 120 },
    tileZ: 14,
    z: 14.5 * TILE_VOXELS,
  };

  const until = (
    crowd: Crowd,
    router: ReturnType<typeof createRouter>,
    done: () => boolean,
    steps = 4000,
  ): boolean => {
    for (let step = 0; step < steps; step++) {
      if (done()) return true;
      stepCrowd(crowd, MAX_STEP);
      if (step % SAND_TICKS_EVERY === 0) router.tick(step / SAND_TICKS_EVERY);
    }
    return done();
  };

  it('gets a thirsty guest up off their towel for a drink, and settles them again after', () => {
    const { needs, router, crowd } = onTheBeach([0], { venues: [kiosk] });
    expect(untilSettled(crowd, [0])).toBe(true);
    const spot = { x: crowd.x[0]!, z: crowd.z[0]!, seat: crowd.seat[0]! };
    needs.level.fun[0] = 1;
    needs.level.thirst[0] = 0;

    expect(
      until(crowd, router, () => router.visitOf(0)?.venue.key === kiosk.key),
      'never went for a drink',
    ).toBe(true);
    expect(router.goalOf(0)?.key, 'the party was moved on, not one guest').toBe(kiosk.key);
    expect(
      until(crowd, router, () => needs.level.thirst[0]! > 0.5),
      'never got the drink',
    ).toBe(true);

    expect(
      until(crowd, router, () => router.stayOf(0) === 'resting'),
      'never came back to the pitch',
    ).toBe(true);
    expect(router.visitOf(0)?.venue.label).toBe('Beach');
    expect(resting(crowd, 0)).toBe(true);
    expect(crowd.x[0]).toBeCloseTo(spot.x);
    expect(crowd.z[0]).toBeCloseTo(spot.z);
    expect(crowd.seat[0]).toBe(spot.seat);
  });

  it('wears the kiosk an errand off a pitch was run to, the way any visit does', () => {
    const { needs, router, crowd, upkeep } = onTheBeach([0], { venues: [kiosk] });
    expect(untilSettled(crowd, [0])).toBe(true);
    needs.level.fun[0] = 1;
    needs.level.thirst[0] = 0;
    expect(
      until(crowd, router, () => needs.level.thirst[0]! > 0.5),
      'never got the drink',
    ).toBe(true);
    expect(cleanliness(upkeep, 0)).toBeLessThan(1);
  });

  it('walks a guest off the beach from the kiosk when their stay is over', () => {
    const clock = { tick: NOON };
    const housed = [...Array(guests.count).keys()].find((person) => homeOf(guests, person))!;
    const { needs, router, crowd } = onTheBeach([housed], {
      venues: [kiosk],
      night: { lodgings: [hotel()], tickOfDay: () => clock.tick },
    });
    expect(untilSettled(crowd, [housed])).toBe(true);
    needs.level.fun[housed] = 1;
    needs.level.thirst[housed] = 0;
    expect(
      until(crowd, router, () => router.visitOf(housed)?.venue.key === kiosk.key),
      'never went for a drink',
    ).toBe(true);

    clock.tick = bedtimeOf(guests.party[housed]!).sleepAt;
    expect(
      until(crowd, router, () => crowd.node[housed]! >= 0),
      'never came back onto the boardwalk',
    ).toBe(true);
    expect(network.gates).toContain(crowd.node[housed]);
    expect(router.stayOf(housed)).toBeNull();
    expect(needs.level.fun[housed], 'the stay gave nothing back').toBeGreaterThan(0.5);
  });

  it('brings a guest on a stay back onto the graph when it is rebuilt, rather than roaming', () => {
    const { router, crowd } = onTheBeach([0]);
    expect(untilSettled(crowd, [0])).toBe(true);
    router.rebuild([], [], [], network);
    const reseated = reseatCrowd(crowd, network);
    let back = false;
    for (let step = 0; step < 600 && !back; step++) {
      stepCrowd(reseated, MAX_STEP);
      back = reseated.node[0]! >= 0;
    }
    expect(back, 'a simulated minute and still out on the sand').toBe(true);
  });

  it('is not a venue on a plot with no beach', () => {
    const { router } = routerOn(networkOf(street(8)), [], wanting(0, 'fun'));
    router.step(0, 0);
    expect(router.goalOf(0)).toBeNull();
  });
});

describe('a building on the beach', () => {
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const paved: PavedTile[] = Array.from({ length: 8 }, (_, index) => ({
    tileX: 10,
    tileZ: 4 + index,
    y: 0,
  }));

  const shower: Venue = {
    ...bakery(4),
    key: 'beach-shower#0',
    id: 'beach-shower',
    label: 'Beach shower',
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.6 }],
    capacity: 1,
    dwellSeconds: { min: 30, max: 90 },
    tileZ: 14,
    z: 14.5 * TILE_VOXELS,
  };
  const inShower = (crowd: Crowd, person: number): boolean =>
    Math.abs(crowd.x[person]! - shower.x) < TILE_VOXELS / 2 &&
    Math.abs(crowd.z[person]! - shower.z) < TILE_VOXELS / 2;
  const network = walkNetworkFor({
    paved,
    levelOf: FLAT,
    shore,
    tilesX: 20,
    obstacles: [{ x: 4 * TILE_VOXELS, z: 14 * TILE_VOXELS, width: 16, depth: 16 }],
  });
  const gate = network.gates[0]!;

  const onTheBoardwalk = (needs: Needs, people: readonly number[]) => {
    const { router, crowd } = routerOn(network, [shower], needs);
    const start = network.nodes[nodeAt(network, 10, 8)]!;
    for (const person of people) {
      router.step(person, nodeAt(network, 10, 4));
      holdAt(crowd, person, start.x, start.y, start.z, 0);
      releaseTo(crowd, person, nodeAt(network, 10, 9));
    }
    return { router, crowd };
  };

  it('walks a grubby guest over the sand to it, holds them, and lets them back on at the gate', () => {
    expect(network.gates).toHaveLength(1);
    const needs = wanting(0, 'hygiene');
    const { router, crowd } = onTheBoardwalk(needs, [0]);
    expect(router.goalOf(0)?.key).toBe('beach-shower#0');

    let onTheSand = false;
    let heldInside = false;
    let backAt = -1;
    for (let step = 0; step < 4000 && backAt === -1; step++) {
      stepCrowd(crowd, MAX_STEP);
      if (step % TICKS_EVERY === 0) router.tick(step / TICKS_EVERY);
      const visiting = router.visitOf(0) !== null;
      if (!visiting && !isRoaming(crowd, 0) && crowd.z[0]! > 12 * TILE_VOXELS) onTheSand = true;
      if (visiting && isWaiting(crowd, 0) && inShower(crowd, 0)) heldInside = true;
      if (heldInside && !visiting && crowd.node[0]! >= 0) backAt = crowd.node[0]!;
    }
    expect(onTheSand, 'never walked out over the sand').toBe(true);
    expect(heldInside, 'never stood in the shower').toBe(true);
    expect(needs.level.hygiene[0]).toBeCloseTo(0.6);
    expect(backAt, 'never came back onto the boardwalk').toBe(gate);
  });

  it('stands a second guest in a line on the sand, outside the shower', () => {
    const needs = wanting(0, 'hygiene');
    const second = [...Array(guests.count).keys()].find(
      (person) => guests.party[person] !== guests.party[0],
    )!;
    needs.level.hygiene[second] = 0;
    const { router, crowd } = onTheBoardwalk(needs, [0, second]);

    let waiting = false;
    for (let step = 0; step < 4000 && !waiting; step++) {
      stepCrowd(crowd, MAX_STEP);
      waiting = [0, second].some((person) => router.visitOf(person)?.waiting === true);
    }
    expect(waiting, 'nobody ever had to wait').toBe(true);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 1 });
    const inLine = router.visitOf(0)?.waiting ? 0 : second;
    expect(isWaiting(crowd, inLine)).toBe(true);
    expect(inShower(crowd, inLine)).toBe(false);
    expect(crowd.y[inLine]).toBeCloseTo(BEACH_SURFACE);
    const tileX = Math.floor(crowd.x[inLine]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[inLine]! / TILE_VOXELS);
    expect(terrainAt(shore, tileX, tileZ)).toBe('beach');
    expect(blockedAt(network.sand!, crowd.x[inLine]!, crowd.z[inLine]!)).toBe(false);
  });

  it('leaves somebody on their way when the router is rebuilt mid-walk, roaming the sand', () => {
    const { router, crowd } = onTheBoardwalk(wanting(0, 'hygiene'), [0]);
    let out = false;
    for (let step = 0; step < 4000 && !out; step++) {
      stepCrowd(crowd, MAX_STEP);
      out = crowd.z[0]! > 12.5 * TILE_VOXELS;
    }
    expect(out, 'never got onto the sand').toBe(true);
    expect(isRoaming(crowd, 0)).toBe(false);

    router.rebuild([shower], [], [], network);
    for (let step = 0; step < 1000 && !isRoaming(crowd, 0); step++) stepCrowd(crowd, MAX_STEP);
    expect(isRoaming(crowd, 0)).toBe(true);
    const there = { x: crowd.x[0]!, z: crowd.z[0]! };
    for (let step = 0; step < 300; step++) stepCrowd(crowd, MAX_STEP);
    expect(Math.hypot(crowd.x[0]! - there.x, crowd.z[0]! - there.z)).toBeGreaterThan(1);
  });
});

describe('the night', () => {
  const housed = [...Array(guests.count).keys()].find((person) => homeOf(guests, person))!;
  const homeless = [...Array(guests.count).keys()].find(
    (person) => guests.home[person] === NO_HOME,
  )!;

  const nightOn = (person: number, lodging = hotel()) => {
    const network = networkOf(street(8));
    const needs = wanting(person, 'hunger');
    const clock = { tick: bedtimeOf(guests.party[person]!).sleepAt };
    const { router, crowd } = routerOn(network, [bakery(7)], needs, {
      lodgings: [lodging],
      tickOfDay: () => clock.tick,
    });
    return { network, needs, clock, router, crowd };
  };

  it('walks a guest home at bedtime, however hungry they are for the bakery', () => {
    const { network, clock, router } = nightOn(housed);
    expect(router.step(housed, nodeAt(network, 4))).toBe(nodeAt(network, 3));
    expect(router.homewardTo(housed)?.key).toBe('hotel#0');
    clock.tick = NOON;
    expect(router.step(housed, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.homewardTo(housed)).toBeNull();
  });

  it('puts a guest to bed inside their lodging when they reach its door', () => {
    const { network, router, crowd } = nightOn(housed);
    expect(router.step(housed, nodeAt(network, 1))).toBe(-1);
    expect(router.isAsleep(housed)).toBe(true);
    expect(router.asleepCount).toBe(1);
    expect(isWaiting(crowd, housed)).toBe(true);
    expect(crowd.x[housed]).toBeCloseTo(hotel().x);
    expect(crowd.z[housed]).toBeCloseTo(hotel().z);
    expect(router.step(housed, nodeAt(network, 1))).toBe(-1);
    expect(router.asleepCount).toBe(1);
  });

  it('gets them up at their wake tick, rested, and out of the door', () => {
    const { network, needs, router, crowd } = nightOn(housed);
    router.step(housed, nodeAt(network, 1));
    needs.level.energy[housed] = 0.2;
    const { wakeAt } = bedtimeOf(guests.party[housed]!);

    router.tick(TICKS_PER_DAY + wakeAt - 1);
    expect(router.isAsleep(housed), 'up before their time').toBe(true);
    router.tick(TICKS_PER_DAY + wakeAt);
    expect(router.isAsleep(housed)).toBe(false);
    expect(router.asleepCount).toBe(0);
    expect(isWaiting(crowd, housed)).toBe(false);
    expect(needs.level.energy[housed]).toBe(1);
  });

  it('never puts a guest with no bed to sleep, and routes them to venues all night', () => {
    const { network, router } = nightOn(homeless);
    expect(router.step(homeless, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.step(homeless, nodeAt(network, 1))).not.toBe(-1);
    expect(router.isAsleep(homeless)).toBe(false);
    expect(router.homewardTo(homeless)).toBeNull();
  });

  it('lets a guest whose lodging no paving reaches walk instead of sleeping', () => {
    const { network, router } = nightOn(housed, hotel(5));
    expect(router.step(housed, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.isAsleep(housed)).toBe(false);
  });

  it('wants a guest off the sand at bedtime only when they have a bed, and not once in it', () => {
    const { network, router } = nightOn(housed);
    expect(router.offTheSand(housed)).toBe(true);
    expect(nightOn(homeless).router.offTheSand(homeless)).toBe(false);
    router.step(housed, nodeAt(network, 1));
    expect(router.isAsleep(housed)).toBe(true);
    expect(router.offTheSand(housed)).toBe(false);
  });

  it('wakes everybody when the graph is rebuilt', () => {
    const { network, router } = nightOn(housed);
    router.step(housed, nodeAt(network, 1));
    expect(router.asleepCount).toBe(1);
    router.rebuild([bakery(9)], [hotel()], [], networkOf(street(10)));
    expect(router.asleepCount).toBe(0);
    expect(router.isAsleep(housed)).toBe(false);
  });
});

interface Watch {
  readonly roamsBeach?: boolean;
  readonly step?: (router: Router, person: number, at: number) => number;
  readonly tick?: (crowd: Crowd, people: Guests) => void;
  readonly framesPerTick?: number;
}

const NORMAL_FRAMES_PER_TICK = Math.round(
  (crowdScaleFor('normal') * SPEED_DAY_SECONDS.normal) / TICKS_PER_DAY / MAX_STEP,
);

interface ShareOut {
  readonly ranked: readonly (readonly [string, number])[];
  readonly busiest: ReadonlyMap<
    string,
    { readonly key: string; readonly share: number; readonly of: number }
  >;
  readonly ignored: readonly string[];
}

const serves = (venue: Venue): boolean => venue.satisfies.some((relief) => relief.amount > 0);

const shareOutOf = (
  standing: readonly Venue[],
  visits: ReadonlyMap<string, number>,
  reachable: (venue: Venue) => boolean,
): ShareOut => {
  const ranked = [...visits.entries()].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const busiest = new Map<string, { key: string; share: number; of: number }>();
  for (const need of NEEDS) {
    const serving = standing.filter((venue) =>
      venue.satisfies.some((relief) => relief.need === need && relief.amount > 0),
    );
    let of = 0;
    let most = { key: 'nothing', visits: 0 };
    for (const venue of serving) {
      const went = visits.get(venue.key) ?? 0;
      of += went;
      if (went > most.visits) most = { key: venue.key, visits: went };
    }
    if (of > 0) busiest.set(need, { key: most.key, share: most.visits / of, of });
  }
  const ignored = standing
    .filter((venue) => serves(venue) && reachable(venue) && !(visits.get(venue.key)! > 0))
    .map((venue) => venue.key);
  return { ranked, busiest, ignored };
};

describe('on the generated plot', () => {
  const TYPES = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    category: type.category,
    placement: type.model.placement,
  }));
  const ITEMS: LayoutItem[] = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
    category: type.category,
    doors: type.venue?.doors ?? [],
  }));
  const plan = generateResort(
    TYPES,
    clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
  );
  const layout = layoutResort(ITEMS, plan);
  const elevation = elevationFor(plan);
  const network = walkNetworkFor({
    paved: layout.paths,
    levelOf: (x, z) => levelAt(elevation, x, z),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
  });
  const venues = venuesOn(layout.placements);

  it('stands every place in every line on a paved tile', () => {
    const paved = new Set(layout.paths.map((tile) => `${tile.tileX},${tile.tileZ}`));
    const index = nodeIndexFor(network);
    let spots = 0;
    let off: string | null = null;
    for (const venue of venues) {
      for (const door of doorsFor(venue, index).nodes) {
        for (const [slot, spot] of queueLaneFor(network, door, venue).entries()) {
          spots++;
          const tile = `${Math.floor(spot.x / TILE_VOXELS)},${Math.floor(spot.z / TILE_VOXELS)}`;
          if (!paved.has(tile)) off ??= `${venue.key} door ${door} slot ${slot} on ${tile}`;
        }
      }
    }
    expect(spots, 'no lanes laid at all').toBeGreaterThan(venues.length);
    expect(off).toBeNull();
  });

  it('walks a starving guest nearer the place they chose', () => {
    expect(venues.length).toBeGreaterThan(0);
    const people = createGuests({
      count: 200,
      homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 200 }],
      variants: 4,
      childVariant: 3,
      seed: 11,
    });
    const needs = createNeeds(people, 9);

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings: [],
      gateways: [],
      onLeave: () => {},
      network,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      upkeep: spotless(venues.length),
      seed: 17,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });

    const hungry = [...Array(people.count).keys()].find((person) => !isRoaming(crowd!, person))!;
    needs.level.hunger[hungry] = 0;

    for (let step = 0; step < 60; step++) stepCrowd(crowd, MAX_STEP);
    const goal = router.goalOf(hungry);
    expect(goal, 'a hungry guest on a plot with food chose nowhere').not.toBeNull();
    const distanceTo = (): number =>
      Math.hypot(goal!.x - crowd!.x[hungry]!, goal!.z - crowd!.z[hungry]!);
    const before = distanceTo();

    let nearest = before;
    for (let step = 0; step < 2400; step++) {
      stepCrowd(crowd, MAX_STEP);
      if (step % TICKS_EVERY === 0) router.tick(step / TICKS_EVERY);
      nearest = Math.min(nearest, distanceTo());
    }

    expect(nearest).toBeLessThan(before);
    expect(needs.level.hunger[hungry]).toBeGreaterThan(0);
    expect(crowd.x[hungry]).toBeGreaterThanOrEqual(0);
    expect(crowd.z[hungry]).toBeGreaterThanOrEqual(0);
    expect(crowd.x[hungry]).toBeLessThanOrEqual(plan.tilesX * TILE_VOXELS);
    expect(crowd.z[hungry]).toBeLessThanOrEqual(plan.tilesZ * TILE_VOXELS);
  });

  const starving = (
    capacityOf: (venue: Venue) => number,
    need: (typeof NEEDS)[number] = 'hunger',
    walked: WalkNetwork = network,
    watch: Watch = {},
  ) => {
    const people = createGuests({
      count: 600,
      homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 600 }],
      variants: 4,
      childVariant: 3,
      seed: 12,
    });
    const needs = createNeeds(people, 13);
    needs.level[need].fill(0);
    const before = new Float32Array(needs.level[need]);
    const standing: Venue[] = [];
    for (const venue of venues) standing.push({ ...venue, capacity: capacityOf(venue) });

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues: standing,
      lodgings: [],
      gateways: [],
      onLeave: () => {},
      network: walked,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      upkeep: spotless(standing.length),
      seed: 19,
    });
    crowd = createCrowd({
      network: walked,
      count: people.count,
      variants: 4,
      seed: 4,
      routeOf: (person, at) =>
        watch.step ? watch.step(router, person, at) : router.step(person, at),
      roamsBeach: watch.roamsBeach ?? true,
    });

    const food = standing.filter((venue) => venue.satisfies.some((relief) => relief.need === need));
    expect(food.length, `a generated plot with nothing for ${need} on it`).toBeGreaterThan(0);
    const served = new Set<string>();

    let queued = 0;
    let busiest = 0;
    let over: string | null = null;
    for (let tick = 1; tick <= TICKS_PER_DAY / 2; tick++) {
      const frames = watch.framesPerTick ?? TICKS_EVERY;
      for (let frame = 0; frame < frames; frame++) stepCrowd(crowd, MAX_STEP);
      router.tick(tick);
      watch.tick?.(crowd, people);
      for (const venue of food) {
        const here = router.occupancyOf(venue.key)!;
        if (here.inside > venue.capacity)
          over ??= `${venue.key} held ${here.inside} on tick ${tick}`;
        queued = Math.max(queued, here.waiting);
        busiest = Math.max(busiest, here.inside);
        if (here.inside > 0) served.add(venue.id);
      }
    }

    let fed = 0;
    let confused: string | null = null;
    for (let person = 0; person < people.count; person++) {
      if (needs.level[need][person]! > before[person]!) fed++;
      const visit = router.visitOf(person);
      if (visit && !standing.includes(visit.venue) && !isBeach(visit.venue)) {
        confused ??= `person ${person}`;
      }
    }
    return { over, queued, busiest, fed, confused, served, router, food };
  };

  it('never lets a venue hold more people than it says it does', () => {
    const run = starving((venue) => venue.capacity);
    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    expect(run.busiest, 'nobody ever got inside anything').toBeGreaterThan(0);
    expect(run.fed, 'half a simulated day and nobody ate').toBeGreaterThan(0);
  });

  const furnished = walkNetworkFor({
    paved: layout.paths,
    levelOf: (x, z) => levelAt(elevation, x, z),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    obstacles: layout.placements,
  });
  const furnishedIndex = nodeIndexFor(furnished);
  const SAND_TILES = 40;

  it('reaches every venue on the plot', () => {
    const unreachable = venues
      .filter((venue) => {
        const doors = doorsFor(venue, furnishedIndex, furnished);
        if (doors.nodes.length > 0) return false;
        return sandRoutesFor(furnished, doors.sand, SAND_TILES).length === 0;
      })
      .map((venue) => `${venue.key} at ${venue.tileX},${venue.tileZ}`);
    expect(unreachable).toEqual([]);
  });

  it('keeps every line on the sand and every step over it on open beach', () => {
    const shore = furnished.beach!.shore;
    let points = 0;
    let off: string | null = null;
    const check = (what: string, point: { readonly x: number; readonly z: number }): void => {
      points++;
      const tile = terrainAt(
        shore,
        Math.floor(point.x / TILE_VOXELS),
        Math.floor(point.z / TILE_VOXELS),
      );
      if (tile !== 'beach' || blockedAt(furnished.sand!, point.x, point.z)) {
        off ??= `${what} at ${point.x},${point.z}`;
      }
    };
    for (const venue of venues) {
      const doors = doorsFor(venue, furnishedIndex, furnished);
      if (doors.nodes.length > 0) continue;
      for (const route of sandRoutesFor(furnished, doors.sand, SAND_TILES)) {
        for (const [leg, point] of route.waypoints.entries()) {
          check(`${venue.key} from gate ${route.gate}, waypoint ${leg}`, point);
        }
        const towards = route.waypoints.at(-2) ?? furnished.nodes[route.gate]!;
        for (const [slot, spot] of sandLaneFor(
          furnished,
          route.waypoints.at(-1)!,
          towards,
        ).entries()) {
          check(`${venue.key} line slot ${slot}`, spot);
        }
      }
    }
    expect(points, 'nothing on the sand to check').toBeGreaterThan(100);
    expect(off).toBeNull();
  });

  it('paves nothing new for the doors the beach buildings declare', () => {
    let hash = 2166136261;
    const key = layout.paths
      .map((tile) => `${tile.tileX},${tile.tileZ},${tile.y},${tile.id}`)
      .join(';');
    for (let at = 0; at < key.length; at++)
      hash = Math.imul(hash ^ key.charCodeAt(at), 16777619) >>> 0;
    expect(layout.paths).toHaveLength(2240);
    expect(hash).toBe(2140810103);
  });

  it('sends grubby guests over the sand to wash on the beach', () => {
    const run = starving((venue) => venue.capacity, 'hygiene', furnished, {
      framesPerTick: NORMAL_FRAMES_PER_TICK,
    });
    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    const onTheBeach = [...run.served].filter(
      (id) => id === 'beach-shower' || id === 'changing-cabins',
    );
    expect(
      onTheBeach,
      `half a day and nobody washed on the beach: ${[...run.served].join(', ')}`,
    ).not.toEqual([]);
  });

  it('settles bored guests on the beach in parties, and nobody roams it', () => {
    const seated = walkNetworkFor({
      paved: layout.paths,
      levelOf: (x, z) => levelAt(elevation, x, z),
      shore: shoreFor(plan),
      tilesX: plan.tilesX,
      obstacles: layout.placements,
      seats: seatSpotsFor(layout.placements.map(seatSiteOf)),
    });
    expect(seated.beachSeats.length, 'no loungers on the beach').toBeGreaterThan(0);
    const shore = seated.beach!.shore;
    const seen = { roamers: 0, peak: 0, onLoungers: 0, arrivals: 0, turnedBack: 0 };
    const turnedBackAt = new Set<number>();
    let off: string | null = null;
    let overlap: string | null = null;

    const run = starving((venue) => venue.capacity, 'fun', seated, {
      roamsBeach: false,
      framesPerTick: NORMAL_FRAMES_PER_TICK,
      step: (router, person, at) => {
        const toTheBeach =
          seated.nodes[at]?.gate === true &&
          router.visitOf(person) === null &&
          router.goalOf(person)?.label === 'Beach';
        const onward = router.step(person, at);
        if (!toTheBeach) return onward;
        seen.arrivals++;
        if (router.stayOf(person) !== 'arriving') {
          seen.turnedBack++;
          turnedBackAt.add(at);
        }
        return onward;
      },
      tick: (crowd, people) => {
        const lying: number[] = [];
        let onLoungers = 0;
        for (let person = 0; person < crowd.count; person++) {
          if (isRoaming(crowd, person)) seen.roamers++;
          if (!isWaiting(crowd, person) || !resting(crowd, person)) continue;
          lying.push(person);
          if (crowd.seat[person]! >= 0) onLoungers++;
          const { x, y, z } = { x: crowd.x[person]!, y: crowd.y[person]!, z: crowd.z[person]! };
          if (y >= 2) continue;
          const tile = terrainAt(shore, Math.floor(x / TILE_VOXELS), Math.floor(z / TILE_VOXELS));
          if (tile !== 'beach' || blockedAt(seated.sand!, x, z))
            off ??= `person ${person} at ${x},${z}`;
        }
        const onSand = lying.filter((person) => crowd.y[person]! < 2).length;
        seen.peak = Math.max(seen.peak, onSand);
        seen.onLoungers = Math.max(seen.onLoungers, onLoungers);
        for (const [index, a] of lying.entries()) {
          for (const b of lying.slice(index + 1)) {
            if (people.party[a] === people.party[b]) continue;
            if (Math.hypot(crowd.x[a]! - crowd.x[b]!, crowd.z[a]! - crowd.z[b]!) < 3) {
              overlap ??= `people ${a} and ${b}`;
            }
          }
        }
      },
    });

    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    expect(seen.roamers, 'somebody roamed the beach').toBe(0);
    expect(seen.peak, `the most ever resting on the sand at once`).toBeGreaterThanOrEqual(20);
    expect(seen.onLoungers, 'nobody lay on a lounger').toBeGreaterThan(0);
    expect(off).toBeNull();
    expect(overlap).toBeNull();
    expect(
      seen.turnedBack,
      `${seen.turnedBack} of ${seen.arrivals} turned back at gates ${[...turnedBackAt].join(', ')}`,
    ).toBeLessThanOrEqual(0.1 * seen.arrivals);
  });

  // The declared capacities never bind on this plot, so a line only forms at capacity 1.
  it('grows a line at the door when every place holds one person', () => {
    const run = starving(() => 1);
    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    expect(run.busiest).toBe(1);
    expect(run.queued, 'six hundred hungry guests and no line anywhere').toBeGreaterThan(0);
    expect(run.fed, 'a line formed and nothing ever came out of it').toBeGreaterThan(1);
  });
  it('counts the doors that turned people away, and where most of it happened', () => {
    const run = starving(() => 1);
    const balks = run.router.dayBalks();
    expect(balks.size, 'six hundred hungry guests and nobody ever refused').toBeGreaterThan(0);

    const worst = [...balks.entries()].toSorted((a, b) => b[1] - a[1])[0]!;
    expect(run.food.map((venue) => venue.key)).toContain(worst[0]);
    expect(run.router.dayVisits().get(worst[0])).toBeGreaterThan(0);
    for (const key of balks.keys()) expect(run.router.dayVisits().has(key)).toBe(true);
  });

  it('sends the resort to bed at night and gets it up in the morning', () => {
    const lodgings = lodgingsOn(layout.placements);
    const people = createGuests({
      count: 800,
      homes: lodgings.toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key)),
      variants: 4,
      childVariant: 3,
      seed: 21,
    });
    const needs = createNeeds(people, 23);
    let ticks = 20 * 60;

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings,
      gateways: [],
      onLeave: () => {},
      network,
      tickOfDay: () => ticks % TICKS_PER_DAY,
      crowd: () => crowd!,
      upkeep: spotless(venues.length),
      seed: 29,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 5,
      routeOf: (person, at) => router.step(person, at),
    });

    const housed = [...Array(people.count).keys()].filter((person) => homeOf(people, person));
    expect(housed.length).toBeLessThan(people.count);
    const wentToBedWith = new Float32Array(people.count).fill(-1);
    const gotUpWith = new Float32Array(people.count).fill(-1);
    let strangerBed: string | null = null;
    let homelessAsleep: string | null = null;
    let atTwo = { onTheGraph: 0, bedward: 0 };

    while (ticks < TICKS_PER_DAY + 9 * 60) {
      for (let frame = 0; frame < TICKS_EVERY; frame++) stepCrowd(crowd, MAX_STEP);
      ticks++;
      decayNeeds(needs, people, 1);
      router.tick(ticks);
      for (const person of housed) {
        if (wentToBedWith[person]! >= 0 && gotUpWith[person] === -1 && !router.isAsleep(person)) {
          gotUpWith[person] = needs.level.energy[person]!;
        }
        if (!router.isAsleep(person) || wentToBedWith[person] !== -1) continue;
        wentToBedWith[person] = needs.level.energy[person]!;
        const home = lodgings[lodgingFor(lodgings, homeOf(people, person)!.key)]!;
        const there =
          Math.abs(crowd.x[person]! - home.x) < 1e-3 && Math.abs(crowd.z[person]! - home.z) < 1e-3;
        if (!there) strangerBed ??= `person ${person} is not in ${home.key}`;
      }
      if (ticks !== TICKS_PER_DAY + 2 * 60) continue;
      for (let person = 0; person < people.count; person++) {
        if (people.home[person] === NO_HOME && router.isAsleep(person)) {
          homelessAsleep ??= `person ${person}`;
        }
      }
      const walking = housed.filter(
        (person) => !isRoaming(crowd!, person) && router.visitOf(person) === null,
      );
      atTwo = {
        onTheGraph: walking.length,
        bedward: walking.filter((person) => router.homewardTo(person) !== null).length,
      };
    }

    expect(strangerBed).toBeNull();
    expect(homelessAsleep).toBeNull();
    expect(atTwo.bedward).toBeGreaterThanOrEqual(0.7 * atTwo.onTheGraph);
    const slept = housed.filter((person) => wentToBedWith[person]! >= 0);
    expect(slept.length, 'a whole night and nobody reached a bed').toBeGreaterThan(0);
    expect(router.asleepCount, 'somebody is still in bed at nine').toBe(0);
    const tired = slept.find((person) => !(gotUpWith[person]! > wentToBedWith[person]!));
    expect(tired, 'got up as tired as they went to bed').toBeUndefined();
  });

  it('feeds a hungry family at the edge of its reach before the walk has eaten the meal', () => {
    const people = createGuests({
      count: 200,
      homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 200 }],
      variants: 4,
      childVariant: 3,
      seed: 11,
    });
    const needs = createNeeds(people, 9);
    for (const need of NEEDS) needs.level[need].fill(1);
    const food = venues.filter((venue) => venue.satisfies.some((each) => each.need === 'hunger'));

    let clock = withSpeed(createSimClock(0, 10 / 24), 'normal');
    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings: [],
      gateways: [],
      onLeave: () => {},
      network,
      tickOfDay: () => clock.ticks % TICKS_PER_DAY,
      crowd: () => crowd!,
      upkeep: spotless(venues.length),
      seed: 17,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });

    const reach = ARCHETYPES.family.reach;
    const nearestFood = (person: number): number =>
      Math.min(
        ...food.map((venue) =>
          Math.hypot(venue.x - crowd!.x[person]!, venue.z - crowd!.z[person]!),
        ),
      );
    const family = [...Array(people.count).keys()].filter(
      (person) =>
        people.parties[people.party[person]!]!.kind === 'family' &&
        !isRoaming(crowd!, person) &&
        nearestFood(person) <= reach,
    );
    const hungry = family.toSorted((a, b) => nearestFood(b) - nearestFood(a))[0]!;
    expect(
      nearestFood(hungry),
      'nobody in a family starts near the edge of their reach',
    ).toBeGreaterThan(reach / 2);
    needs.level.hunger[hungry] = 0.3;

    const scale = crowdScaleFor('normal');
    let setOff: { tick: number; hunger: number } | null = null;
    let arrived: { tick: number; hunger: number } | null = null;
    let left: number | null = null;
    const frame = 1 / 60;
    const until = clock.ticks + 6 * 60;
    while (left === null && clock.ticks < until) {
      const advanced = advanceClock(clock, frame);
      clock = advanced.clock;
      if (advanced.ticks > 0) {
        decayNeeds(needs, people, advanced.ticks);
        for (let tick = advanced.ticks; tick > 0; tick--) router.tick(clock.ticks - tick + 1);
      }
      stepCrowd(crowd, frame * scale);

      const hunger = needs.level.hunger[hungry]!;
      if (!setOff && router.goalOf(hungry)) setOff = { tick: clock.ticks, hunger };
      if (setOff && !arrived && router.visitOf(hungry)) arrived = { tick: clock.ticks, hunger };
      if (arrived && !router.visitOf(hungry)) left = hunger;
    }

    console.log(
      'family goal',
      router.goalOf(hungry)?.key,
      router.visitOf(hungry)?.venue.key,
      setOff,
      arrived,
    );
    expect(setOff, 'a hungry family chose nowhere to eat').not.toBeNull();
    expect(arrived, 'six simulated hours and they never got there').not.toBeNull();
    expect(left, 'they never came out again').not.toBeNull();
    expect(left!).toBeGreaterThan(setOff!.hunger);
    expect(arrived!.tick - setOff!.tick).toBeLessThan(120);
  });

  const OPENS_ON = 2;

  // At `normal`'s pace: at real time nobody reaches a gate in three days.
  it('lets stays end and coaches fill the beds they gave back', () => {
    const homes = lodgingsOn(layout.placements).map((lodging) => ({
      key: lodging.key,
      id: lodging.id,
      label: lodging.label,
      beds: lodging.beds,
    }));
    const people = createGuests({
      count: 400,
      homes: homes.toSorted((a, b) => b.beds - a.beds),
      variants: 4,
      childVariant: 3,
      seed: 12,
    });
    const needs = createNeeds(people, 13);
    const happiness = createHappiness(people.count);
    const gateways = gatewaysOn(layout.placements);
    expect(gateways.length, 'the generator stands no gate at all').toBeGreaterThan(0);

    let crowd: Crowd | null = null;
    const arrivals = createRandom(41);
    let checkedOut = 0;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings: lodgingsOn(layout.placements),
      gateways,
      onLeave: (person) => {
        const left = checkOutParty(people, people.party[person]!);
        checkedOut += left.length;
        for (const member of left) {
          router.forget(member);
          takeOffPlot(crowd!, member, crowd!.x[member]!, crowd!.y[member]!, crowd!.z[member]!);
        }
      },
      network,
      tickOfDay: () => tick % TICKS_PER_DAY,
      crowd: () => crowd!,
      upkeep: spotless(venues.length),
      seed: 19,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 4,
      routeOf: (person, at) => router.step(person, at),
      offTheSand: (person) => router.offTheSand(person),
      roamsBeach: false,
    });

    const beds = bedCount(people).beds;
    let tick = OPENS_ON * TICKS_PER_DAY;
    let checkedIn = 0;
    let moved: string | null = null;
    let overCapacity: string | null = null;
    let overBeds: string | null = null;
    const parked = new Map<number, string>();

    // Opened on day 2: `createGuests` spreads arrivals over each stay, so nobody
    // leaves before the second morning and day 0 would be two days of nothing.
    for (tick = OPENS_ON * TICKS_PER_DAY; tick <= (OPENS_ON + 3) * TICKS_PER_DAY; tick++) {
      for (let frame = 0; frame < NORMAL_FRAMES_PER_TICK; frame++) stepCrowd(crowd, MAX_STEP);
      decayNeeds(needs, people, 1);
      router.tick(tick);
      if (checkInDue(tick, tick)) {
        const day = Math.floor(tick / TICKS_PER_DAY);
        const rating = ratingFor({
          happiness: meanHappiness(happiness, people),
          present: presentCount(people),
          housed: bedCount(people).taken,
        });
        const arrived = runCheckIn({
          guests: people,
          needs,
          happiness,
          rating,
          day,
          random: arrivals,
        });
        checkedIn += arrived.length;
        for (const person of arrived) router.admit(person, router.arrivalNode);
        for (let person = 0; person < people.count; person++) {
          if (people.present[person] !== 1) continue;
          if (people.arrivedOn[person]! + people.nights[person]! >= day) continue;
          router.sendHome(person);
        }
      }
      for (let person = 0; person < people.count; person++) {
        const here = `${crowd.x[person]},${crowd.y[person]},${crowd.z[person]}`;
        if (!isOffPlot(crowd, person)) {
          parked.delete(person);
          continue;
        }
        const was = parked.get(person);
        if (was === undefined) parked.set(person, here);
        else if (was !== here) moved ??= `person ${person} moved from ${was} to ${here}`;
      }
      if (presentCount(people) > people.count) overCapacity ??= `on tick ${tick}`;
      if (bedCount(people).taken > beds) overBeds ??= `on tick ${tick}`;
    }

    const sentBy = Math.floor((tick - 1) / TICKS_PER_DAY) - 1;
    let stranded = 0;
    for (let person = 0; person < people.count; person++) {
      if (people.present[person] !== 1) continue;
      if (people.arrivedOn[person]! + people.nights[person]! < sentBy) stranded++;
    }
    expect(stranded, 'somebody was sent for a gate and never reached one').toBe(0);
    expect(checkedOut, 'three days and nobody left').toBeGreaterThan(0);
    expect(checkedIn, 'three days and nobody arrived').toBeGreaterThan(0);
    expect(moved, 'somebody off the plot was walked about').toBeNull();
    expect(overCapacity, 'more guests than the plot has bodies').toBeNull();
    expect(overBeds, 'more beds taken than the plot has').toBeNull();
    expect(presentCount(people)).toBe(bedCount(people).taken);
  });
  // One reception of capacity 12, opened empty on a five-star day: the most a day can send it.
  // Measured: 171 admitted, none still checking in at 21:00, and a line of 12 at worst.
  it("checks a whole opening day's arrivals in at the one desk by evening", () => {
    const seated = walkNetworkFor({
      paved: layout.paths,
      levelOf: (x, z) => levelAt(elevation, x, z),
      shore: shoreFor(plan),
      tilesX: plan.tilesX,
      obstacles: layout.placements,
      seats: seatSpotsFor(layout.placements.map(seatSiteOf)),
    });
    const lodgings = lodgingsOn(layout.placements);
    const people = createGuests({
      count: 560,
      homes: lodgings.toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key)),
      variants: 4,
      childVariant: 3,
      seed: 12,
      away: true,
    });
    const needs = createNeeds(people, 13);
    const happiness = createHappiness(people.count);
    const desks = venues.filter((venue) => venue.receives);
    expect(desks.map((venue) => venue.capacity)).toEqual([12]);
    let tick = 10 * 60;

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings,
      gateways: gatewaysOn(layout.placements),
      onLeave: () => {},
      network: seated,
      tickOfDay: () => tick % TICKS_PER_DAY,
      crowd: () => crowd!,
      upkeep: spotless(venues.length),
      seed: 19,
    });
    crowd = createCrowd({
      network: seated,
      count: people.count,
      variants: 4,
      seed: 4,
      routeOf: (person, at) => router.step(person, at),
      offTheSand: (person) => router.offTheSand(person),
      roamsBeach: false,
    });
    for (let person = 0; person < people.count; person++) {
      takeOffPlot(crowd, person, crowd.x[person]!, crowd.y[person]!, crowd.z[person]!);
    }
    expect(router.receptionReachable, 'the entrance reaches no desk').toBe(true);

    const rating = ratingFor({ happiness: 1, present: 10, housed: 10 });
    const arrivals = createRandom(41);
    let planned = 0;
    let admitted = 0;
    let longestLine = 0;
    let stillArriving = -1;
    for (; tick <= TICKS_PER_DAY; tick++) {
      for (let frame = 0; frame < NORMAL_FRAMES_PER_TICK; frame++) stepCrowd(crowd, MAX_STEP);
      decayNeeds(needs, people, 1);
      router.tick(tick);
      for (const wave of wavesDue(tick, tick)) {
        if (wave === 0) planned = arrivalsFor(rating, freeBedsOn(people));
        const arrived = runCheckIn({
          guests: people,
          needs,
          happiness,
          rating,
          day: 0,
          random: arrivals,
          room: arrivalsDueBy(planned, wave) - admitted,
        });
        admitted += arrived.length;
        for (const person of arrived) router.admit(person, router.arrivalNode);
      }
      longestLine = Math.max(longestLine, router.occupancyOf(desks[0]!.key)!.waiting);
      if (tick === 21 * 60) {
        stillArriving = 0;
        for (let person = 0; person < people.count; person++) {
          if (people.present[person] === 1 && router.isArriving(person)) stillArriving++;
        }
      }
    }

    console.log(
      `${admitted} of ${planned} planned arrivals, ${stillArriving} still checking in at 21:00, ` +
        `longest line at the desk ${longestLine}`,
    );
    expect(admitted, 'a five-star opening day and nobody came').toBeGreaterThan(0);
    expect(longestLine, 'nobody ever waited at the desk').toBeGreaterThan(0);
    expect(
      (admitted - stillArriving) / admitted,
      'the desk did not see the day through',
    ).toBeGreaterThanOrEqual(0.95);
  });

  const aDayOnThePlot = () => {
    const seated = walkNetworkFor({
      paved: layout.paths,
      levelOf: (x, z) => levelAt(elevation, x, z),
      shore: shoreFor(plan),
      tilesX: plan.tilesX,
      obstacles: layout.placements,
      seats: seatSpotsFor(layout.placements.map(seatSiteOf)),
    });
    const lodgings = lodgingsOn(layout.placements);
    const people = createGuests({
      count: 600,
      homes: lodgings.toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key)),
      variants: 4,
      childVariant: 3,
      seed: 12,
    });
    const needs = createNeeds(people, 13);
    const upkeep = createUpkeep(venues.length);
    let ticks = OPENS_AT;

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings,
      gateways: [],
      onLeave: () => {},
      network: seated,
      tickOfDay: () => ticks % TICKS_PER_DAY,
      crowd: () => crowd!,
      upkeep: () => upkeep,
      seed: 19,
    });
    crowd = createCrowd({
      network: seated,
      count: people.count,
      variants: 4,
      seed: 4,
      routeOf: (person, at) => router.step(person, at),
      roamsBeach: false,
    });

    const employed = staffPool();
    const duty = onDuty(employed, rosterFor({ venues: venues.length }));
    let workers: Crowd | null = null;
    const staffRouter = createStaffRouter({
      staff: employed,
      venues,
      network: seated,
      upkeep: () => upkeep,
      crowd: () => workers!,
      duty: () => duty,
      seed: 9,
    });
    workers = createCrowd({
      network: seated,
      count: employed.count,
      variants: 1,
      seed: 5,
      routeOf: (worker, at) => staffRouter.step(worker, at),
      roamsBeach: false,
    });
    for (let worker = 0; worker < employed.count; worker++) {
      if (duty[worker] === 1) continue;
      takeOffPlot(workers, worker, workers.x[worker]!, workers.y[worker]!, workers.z[worker]!);
    }

    const doubled: string[] = [];
    let dirtiestSeen = 1;
    let scrubbedBack = false;
    const wasDirty = new Set<number>();

    for (let step = 0; step < TICKS_PER_DAY; step++) {
      for (let frame = 0; frame < NORMAL_FRAMES_PER_TICK; frame++) {
        stepCrowd(crowd, MAX_STEP);
        stepCrowd(workers, MAX_STEP);
      }
      ticks++;
      decayNeeds(needs, people, 1);
      router.tick(ticks);
      staffRouter.tick(ticks);

      const held = new Map<string, number>();
      for (let worker = 0; worker < workers.count; worker++) {
        const at = staffRouter.atWork(worker);
        if (!at) continue;
        const already = held.get(at.key);
        if (already !== undefined) doubled.push(`${at.key}: ${already} and ${worker}`);
        held.set(at.key, worker);
      }
      for (let venue = 0; venue < venues.length; venue++) {
        const level = cleanliness(upkeep, venue);
        dirtiestSeen = Math.min(dirtiestSeen, level);
        if (level < NEEDS_CLEANING) wasDirty.add(venue);
        else if (wasDirty.has(venue)) scrubbedBack = true;
      }
    }

    const standing = [...venues, beachVenueFor(seated)!];
    const index = nodeIndexFor(seated);
    const reachable = (venue: Venue): boolean => {
      if (isBeach(venue)) return true;
      const doors = doorsFor(venue, index, seated);
      if (doors.nodes.length > 0) return true;
      return sandRoutesFor(seated, doors.sand, SAND_TILES).length > 0;
    };
    return {
      router,
      venues: standing,
      reachable,
      people,
      needs,
      upkeep,
      staff: { employed, router: staffRouter, doubled, dirtiestSeen, scrubbedBack },
    };
  };

  it('wears the plot out over a day, and has the cleaners keep up with it', () => {
    const run = aDayOnThePlot();
    const { employed, doubled, dirtiestSeen, scrubbedBack } = run.staff;
    console.log(
      `${employed.count} cleaners over a day: dirtiest venue ${dirtiestSeen.toFixed(2)}, ` +
        `mean ${meanCleanliness(run.upkeep, run.upkeep.venues).toFixed(2)}`,
    );

    expect(employed.count, 'a plot full of venues and nobody to clean them').toBeGreaterThan(0);
    expect(dirtiestSeen, 'a whole day and nothing on the plot got dirty').toBeLessThan(
      NEEDS_CLEANING,
    );
    expect(scrubbedBack, 'nothing that got dirty was ever cleaned again').toBe(true);
    expect(doubled, `two cleaners took the same venue: ${doubled[0]}`).toEqual([]);
  });

  it("records how the day's visits were shared out, and shares them out", () => {
    const run = aDayOnThePlot();
    const visits = run.router.dayVisits();
    const share = shareOutOf(run.venues, visits, run.reachable);
    const total = [...visits.values()].reduce((sum, each) => sum + each, 0);

    console.log(`visits, most first (${total} in the day):`);
    for (const [key, went] of share.ranked) console.log(`  ${key}: ${went}`);
    console.log("the busiest venue's share of the visits to each need:");
    for (const [need, most] of share.busiest) {
      console.log(`  ${need}: ${most.key} took ${most.share.toFixed(2)} of ${most.of}`);
    }
    console.log(`reachable venues nobody visited (${share.ignored.length}):`);
    for (const key of share.ignored) console.log(`  ${key}`);

    expect(total, 'a whole day and nobody went anywhere').toBeGreaterThan(0);

    const quiet = [...new Set(share.ignored.map((key) => key.split('#')[0]!))];
    expect(quiet).toEqual(['changing-cabins']);

    // The beach sat right at 0.6 for energy, and resizing the staff pool reseeds the cleaners'
    // walk enough to tip it to 0.62; the bound guards against one venue taking a need over.
    const BUSIEST_SHARE = 0.65;
    for (const [need, most] of share.busiest) {
      expect(
        most.share,
        `${need}: ${most.key} took ${most.share.toFixed(2)} of ${most.of}`,
      ).toBeLessThanOrEqual(BUSIEST_SHARE);
    }
  });

  it('empties what has no roof in a storm, and fills what has one', () => {
    const lodgings = lodgingsOn(layout.placements);
    const visitsUnder = (weather: Weather): ReadonlyMap<string, number> => {
      const people = createGuests({
        count: 300,
        homes: lodgings.toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key)),
        variants: 4,
        childVariant: 3,
        seed: 12,
      });
      const needs = createNeeds(people, 13);
      const upkeep = createUpkeep(venues.length);
      let ticks = OPENS_AT;
      let crowd: Crowd | null = null;
      const router = createRouter({
        guests: people,
        needs,
        venues,
        lodgings,
        gateways: [],
        onLeave: () => {},
        network,
        tickOfDay: () => ticks % TICKS_PER_DAY,
        crowd: () => crowd!,
        upkeep: () => upkeep,
        weather: () => weather,
        seed: 19,
      });
      crowd = createCrowd({
        network,
        count: people.count,
        variants: 4,
        seed: 4,
        routeOf: (person, at) => router.step(person, at),
        roamsBeach: false,
      });
      for (let tick = 0; tick < TICKS_PER_DAY / 8; tick++) {
        for (let frame = 0; frame < NORMAL_FRAMES_PER_TICK; frame++) stepCrowd(crowd, MAX_STEP);
        ticks++;
        decayNeeds(needs, people, 1, weatherEffect(weather));
        router.tick(ticks);
      }
      return router.dayVisits();
    };

    const clear = visitsUnder('clear');
    const storm = visitsUnder('storm');
    const standing = [...venues, beachVenueFor(network)!];
    const tally = (visits: ReadonlyMap<string, number>, shelter: Shelter): number =>
      standing
        .filter((venue) => shelterOf(venue) === shelter)
        .reduce((sum, venue) => sum + (visits.get(venue.key) ?? 0), 0);

    expect(tally(clear, 'open'), 'nothing open was visited on a clear day').toBeGreaterThan(0);
    expect(tally(storm, 'open')).toBe(0);
    expect(tally(storm, 'covered')).toBeGreaterThanOrEqual(tally(clear, 'covered'));
    expect(tally(storm, 'covered')).toBeGreaterThan(0);
  });

  it('leaves something open for every need a storm could make somebody want', () => {
    const closed = weatherEffect('storm');
    const open = [...venues, beachVenueFor(network)!].filter((venue) =>
      isOpenIn(shelterOf(venue), closed),
    );
    const unserved = NEEDS.filter((need) => !open.some((venue) => reliefAt(venue, need) > 0));
    const clearUnserved = NEEDS.filter(
      (need) => ![...venues].some((venue) => reliefAt(venue, need) > 0),
    );
    expect(unserved, `a storm leaves ${unserved.join(', ')} unserved`).toEqual(clearUnserved);
  });
});

describe('a venue the weather has shut', () => {
  const pool = (tileX: number): Venue => ({
    ...bakery(tileX),
    key: 'swimming-pool#0',
    id: 'swimming-pool',
    label: 'Pool',
    role: 'activity',
    satisfies: [{ need: 'fun', amount: 0.8 }],
    dwellSeconds: { min: 30 * 60, max: 60 * 60 },
    shelter: 'open',
  });

  const hall = (tileX: number): Venue => ({
    ...pool(tileX),
    key: 'game-hall#0',
    id: 'game-hall',
    label: 'Games Hall',
    shelter: 'covered',
  });

  it('turns a guest away at the door, and lets them decide again on the spot', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'fun');
    let weather: Weather = 'clear';
    let crowd: Crowd | null = null;
    const upkeep = createUpkeep(1);
    const venues = [pool(7)];
    const router = createRouter({
      guests,
      needs,
      venues,
      lodgings: [],
      gateways: [],
      onLeave: () => {},
      network,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      upkeep: () => upkeep,
      weather: () => weather,
      seed: 13,
    });
    crowd = createCrowd({
      network,
      count: guests.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });
    router.step(0, nodeAt(network, 0));
    expect(router.goalOf(0)?.key).toBe('swimming-pool#0');

    weather = 'storm';
    const door = nodeAt(network, 7);
    expect(router.step(0, door)).toBe(-1);
    expect(router.visitOf(0)).toBeNull();
    expect(router.goalOf(0), 'sent straight back to the pool that just shut').toBeNull();
    expect(needs.level.fun[0], 'relieved by a pool that was closed').toBe(0);
  });

  it('sends them to the covered one instead, where the plot has one', () => {
    const network = networkOf(street(8));
    const venues = [pool(7), hall(6)];
    expect(routerOn(network, venues, wanting(0, 'fun')).router.step(0, nodeAt(network, 0)));
    const clear = routerOn(network, venues, wanting(0, 'fun'));
    clear.router.step(0, nodeAt(network, 0));
    expect(clear.router.goalOf(0)?.key, 'the pool is the better visit in the dry').toBe(
      'swimming-pool#0',
    );
    const storm = routerOn(network, venues, wanting(0, 'fun'), undefined, true, 'storm');
    storm.router.step(0, nodeAt(network, 0));
    expect(storm.router.goalOf(0)?.key).toBe('game-hall#0');
  });

  it('leaves a guest to wander when the storm shut the only thing serving them', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [pool(7)], wanting(0, 'fun'), undefined, true, 'storm');
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    expect(router.goalOf(0)).toBeNull();
  });

  it('does not throw out somebody who is already inside when the sky turns', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'fun');
    let weather: Weather = 'clear';
    let crowd: Crowd | null = null;
    const upkeep = createUpkeep(1);
    const venues = [pool(7)];
    const router = createRouter({
      guests,
      needs,
      venues,
      lodgings: [],
      gateways: [],
      onLeave: () => {},
      network,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      upkeep: () => upkeep,
      weather: () => weather,
      seed: 13,
    });
    crowd = createCrowd({
      network,
      count: guests.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });
    router.step(0, nodeAt(network, 0));
    router.step(0, nodeAt(network, 7));
    expect(router.visitOf(0)?.waiting).toBe(false);
    expect(router.occupancyOf('swimming-pool#0')).toEqual({ inside: 1, waiting: 0 });

    weather = 'storm';
    let inside = 0;
    for (let tick = 1; tick <= 90; tick++) {
      if (router.visitOf(0) !== null) inside = tick;
      router.tick(tick);
    }
    const dry = routerOn(network, venues, wanting(0, 'fun'));
    dry.router.step(0, nodeAt(network, 0));
    dry.router.step(0, nodeAt(network, 7));
    let dryInside = 0;
    for (let tick = 1; tick <= 90; tick++) {
      if (dry.router.visitOf(0) !== null) dryInside = tick;
      dry.router.tick(tick);
    }
    expect(inside, 'put out of the pool the moment it rained').toBe(dryInside);
    expect(inside, 'a pool visit that took no time at all').toBeGreaterThan(29);
    expect(router.visitOf(0), 'never let out again').toBeNull();
    expect(needs.level.fun[0], 'the visit they were having was not paid out').toBeGreaterThan(0);
  });

  it('sends a heatwave guest to the bar a clear day sent them to the court', () => {
    const network = networkOf(street(12));
    const court: Venue = {
      ...bakery(11),
      key: 'tennis-court#0',
      id: 'tennis-court',
      label: 'Court',
      role: 'activity',
      satisfies: [{ need: 'fun', amount: 0.8 }],
      shelter: 'open',
    };
    const bar: Venue = {
      ...bakery(11),
      key: 'resort-bar#0',
      id: 'resort-bar',
      label: 'Bar',
      role: 'drink',
      satisfies: [{ need: 'thirst', amount: 1 }],
      shelter: 'covered',
    };
    const person = 0;
    const needs = wanting(person, null);
    needs.level.fun[person] = 0.3;
    needs.level.thirst[person] = 0.3;

    const clear = routerOn(network, [court, bar], needs, undefined, true, 'clear');
    clear.router.step(person, nodeAt(network, 0));
    const chosenClear = clear.router.goalOf(person)?.key;

    const hot = routerOn(network, [court, bar], needs, undefined, true, 'heatwave');
    hot.router.step(person, nodeAt(network, 0));
    expect(hot.router.goalOf(person)?.key, `clear chose ${chosenClear}`).toBe('resort-bar#0');
    expect(chosenClear).toBe('tennis-court#0');
  });
});

describe('checking in at reception', () => {
  const reception = (tileX: number, key = 'reception#0'): Venue => ({
    ...bakery(tileX),
    key,
    id: 'reception',
    label: 'Reception',
    role: 'service',
    satisfies: [],
    capacity: 12,
    dwellSeconds: { min: 120, max: 480 },
    receives: true,
  });

  const arrivingOn = (venues: readonly Venue[], length = 8) => {
    const network = networkOf(street(length));
    const needs = wanting(0, 'hunger');
    const { router, crowd } = routerOn(network, venues, needs, {
      lodgings: [],
      tickOfDay: () => NOON,
      gateways: [gateway(0)],
    });
    return { network, needs, router, crowd };
  };

  it('sends an arriving guest to the desk before anything they want', () => {
    const { network, router } = arrivingOn([bakery(7), reception(2)]);
    router.admit(0, nodeAt(network, 0));
    expect(router.isArriving(0)).toBe(true);
    expect(router.step(0, nodeAt(network, 0))).toBe(nodeAt(network, 1));
    expect(router.goalOf(0)?.key).toBe('reception#0');
    expect(router.receptionReachable).toBe(true);
  });

  it('lets them choose for themselves once they have checked in', () => {
    const { network, router, crowd } = arrivingOn([bakery(7), reception(2)]);
    router.admit(0, nodeAt(network, 0));
    router.step(0, nodeAt(network, 0));
    expect(router.step(0, nodeAt(network, 2))).toBe(-1);
    expect(isWaiting(crowd, 0), 'walked straight past the desk').toBe(true);
    expect(router.occupancyOf('reception#0')).toEqual({ inside: 1, waiting: 0 });

    for (let tick = 1; tick <= 10; tick++) router.tick(tick);
    expect(router.isArriving(0)).toBe(false);
    expect(router.step(0, nodeAt(network, 3))).toBe(nodeAt(network, 4));
    expect(router.goalOf(0)?.key).toBe('bakery#0');
  });

  it('sends them to the nearest of two desks', () => {
    const { network, router } = arrivingOn(
      [reception(1, 'reception#0'), bakery(3), reception(8, 'reception#1')],
      12,
    );
    router.admit(0, nodeAt(network, 11));
    expect(router.step(0, nodeAt(network, 11))).toBe(nodeAt(network, 10));
    expect(router.goalOf(0)?.key).toBe('reception#1');
  });

  it('checks straight in when they are let in at the door of the desk', () => {
    const { network, router, crowd } = arrivingOn([bakery(7), reception(0)]);
    router.admit(0, nodeAt(network, 0));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    expect(isWaiting(crowd, 0)).toBe(true);
    expect(router.occupancyOf('reception#0')).toEqual({ inside: 1, waiting: 0 });
  });

  it('does not hold up a guest who has no desk to reach', () => {
    const { network, router } = arrivingOn([bakery(7)]);
    expect(router.receptionReachable).toBe(false);
    router.admit(0, nodeAt(network, 0));
    expect(router.step(0, nodeAt(network, 0))).toBe(nodeAt(network, 1));
    expect(router.isArriving(0)).toBe(false);
    expect(router.goalOf(0)?.key).toBe('bakery#0');
  });

  it('still has them on their way to check in after the graph is rebuilt', () => {
    const { network, router } = arrivingOn([bakery(7), reception(2)]);
    router.admit(0, nodeAt(network, 0));
    const rebuilt = networkOf(street(10));
    router.rebuild([bakery(9), reception(4)], [], [gateway(0)], rebuilt);
    expect(router.isArriving(0)).toBe(true);
    expect(router.step(0, nodeAt(rebuilt, 1))).toBe(nodeAt(rebuilt, 2));
    expect(router.goalOf(0)?.key).toBe('reception#0');
  });
});
