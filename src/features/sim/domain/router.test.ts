import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { seatSpotsFor } from '../../crowd/domain/seating';
import {
  createCrowd,
  holdAt,
  isRoaming,
  isWaiting,
  MAX_STEP,
  releaseTo,
  reseatCrowd,
  RESTING,
  restingOn,
  seatIsFree,
  stepCrowd,
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
import { createGuests, homeOf, partyOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME, type Home } from '../../guests/domain/homes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createNeeds, decayNeeds, NEEDS, type Needs } from './needs';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { doorsFor } from './doors';
import { lodgingFor, lodgingsOn, type Lodging } from './lodgings';
import { bedtimeOf } from './night';
import { MAX_QUEUE_SHOWN, queueLaneFor, sandLaneFor } from './queueLane';
import { sandRoutesFor } from './sandRoute';
import { ARCHETYPES } from './archetypes';
import { isBeach } from './beach';
import { crowdScaleFor } from './crowdRate';
import { createRouter, type Router } from './router';
import { advanceClock, createSimClock, SPEED_DAY_SECONDS, withSpeed } from './simClock';
import { venuesOn, type Venue } from './venues';

const FLAT: LevelProvider = () => 0;

/** A paved corridor `length` tiles long, running east. */
const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

/** Midday, when nobody on the plot is thinking about bed. */
const NOON = 12 * 60;

const HOMES: readonly Home[] = [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 40 }];

const guests: Guests = createGuests({
  count: 60,
  homes: HOMES,
  variants: 4,
  childVariant: 3,
  seed: 5,
});

/** A bakery standing on the tile north of the corridor's far end. */
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

/** Everybody content but for the one need, which is run right down. */
const wanting = (person: number, need: (typeof NEEDS)[number] | null): Needs => {
  const needs = createNeeds(guests, 7);
  for (let other = 0; other < guests.count; other++) {
    for (const each of NEEDS) needs.level[each][other] = 1;
  }
  if (need !== null) needs.level[need][person] = 0;
  return needs;
};

/**
 * The router and a crowd on the same graph, bound to each other the way
 * `showcase.ts` binds them.
 *
 * A real crowd rather than a stub, because the router now stands people still
 * and sends them on again - which are calls into `crowd.ts` and not readings
 * off it. Everybody is put at the west end of the corridor first, which is far
 * enough from the bakery that the straight line decides nothing on its own.
 */
const routerOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  needs: Needs,
  night: { readonly lodgings: readonly Lodging[]; readonly tickOfDay: () => number } = {
    lodgings: [],
    tickOfDay: () => NOON,
  },
  roamsBeach = true,
): { router: ReturnType<typeof createRouter>; crowd: Crowd } => {
  let crowd: Crowd | null = null;
  const router = createRouter({
    guests,
    needs,
    venues,
    lodgings: night.lodgings,
    network,
    tickOfDay: night.tickOfDay,
    crowd: () => crowd!,
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
  return { router, crowd };
};

describe('createRouter', () => {
  it('walks a hungry guest towards the bakery from anywhere along the corridor', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const { router } = routerOn(network, [bakery(7)], needs);
    for (const tileX of [0, 2, 5]) {
      // The step from each node is the neighbour one tile nearer the bakery.
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
    // An errand does not call anybody in: nearly every party has one going, and
    // calling them in emptied the beach by the afternoon.
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
    // They have to want it before they can arrive at it: the first step is what
    // sets the goal, and the field is what makes tile 7 the door.
    router.step(0, nodeAt(network, 0));
    expect(router.goalOf(0)?.key).toBe('bakery#0');

    expect(router.step(0, door)).toBe(-1);
    expect(isWaiting(crowd, 0), 'walked straight through the bakery').toBe(true);
    // Nothing yet: the visit has only started. This is the change plan 018
    // makes to plan 017's instantaneous one.
    expect(needs.level.hunger[0]).toBe(0);
    expect(router.occupancyOf('bakery#0')).toEqual({ inside: 1, waiting: 0 });

    // A bakery visit is four to eight ticks; run long enough for any draw.
    for (let tick = 1; tick <= 8; tick++) router.tick(tick);
    expect(needs.level.hunger[0]).toBeCloseTo(0.5);
    expect(isWaiting(crowd, 0)).toBe(false);
    expect(router.occupancyOf('bakery#0')).toEqual({ inside: 0, waiting: 0 });
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
    // A bakery in the middle of a lawn, four tiles off the corridor.
    const network = networkOf(street(8));
    const stranded = { ...bakery(3), tileZ: 5, z: 5.5 * TILE_VOXELS };
    const { router } = routerOn(network, [stranded], wanting(0, 'hunger'));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    expect(router.goalOf(0)).toBeNull();
  });

  it('throws away its fields and its goals when the graph is rebuilt', () => {
    const network = networkOf(street(8));
    const { router } = routerOn(network, [bakery(7)], wanting(0, 'hunger'));
    router.step(0, nodeAt(network, 0));
    expect(router.fieldCount).toBe(1);
    expect(router.goalOf(0)).not.toBeNull();

    const rebuilt = networkOf(street(10));
    router.rebuild([bakery(9)], [], rebuilt);
    expect(router.fieldCount).toBe(0);
    expect(router.goalOf(0)).toBeNull();
  });
});

/**
 * Frames of `MAX_STEP` to one simulated minute, which is what `normal` speed
 * works out at: 300 real seconds to a day of 1 440 ticks.
 */
const TICKS_EVERY = 2;

/** Ticks in a simulated day, which `simClock.ts` keeps as one integer. */
const TICKS_PER_DAY = 1440;

describe('a venue that holds only as many as it says', () => {
  /** A beach shower: one person inside, and a visit of half a tick. */
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

  /** Two guests of different parties, so neither inherits the other's goal. */
  const strangers = (): [number, number] => {
    const first = 0;
    const second = [...Array(guests.count).keys()].find(
      (person) => guests.party[person] !== guests.party[first],
    )!;
    return [first, second];
  };

  /** Everybody grubby, so the whole fixture wants the one shower. */
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
    // The one inside is under the roof; the one waiting is out on the door tile
    // or behind it, which is a different place.
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

    // The rest of the fixture walks on and queues up behind them, which is the
    // point; these two do not move a voxel until the clock says they may.
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

    // Half a tick rounded up to one, so one tick is the whole of a shower.
    router.tick(1);
    expect(needs.level.hygiene[first]).toBeCloseTo(0.6);
    expect(isWaiting(crowd, first)).toBe(false);
    expect(needs.level.hygiene[second]).toBe(0);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 0 });
    expect(crowd.x[second]).toBeCloseTo(shower(7).x);
  });

  it('sends a guest who finds a full line somewhere else entirely', () => {
    // Long enough for a lane of the full ceiling to run east from the near
    // shower: on a shorter street the paving, not the ceiling, is what is full.
    const network = networkOf(street(20));
    const needs = grubby();
    // The near shower, which everybody chooses, and a far one that barely helps
    // - so nobody goes there until the near one refuses them at the door.
    const near = shower(2);
    const far: Venue = {
      ...shower(7),
      key: 'beach-shower#1',
      satisfies: [{ need: 'hygiene', amount: 0.01 }],
    };
    const { router } = routerOn(network, [near, far], needs);
    const door = nodeAt(network, 2);
    // One inside and a full line behind them, all at the near shower.
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
    // The front of the line is on the door node.
    expect(crowd.x[front]).toBeCloseTo(node.x);
    expect(crowd.z[front]).toBeCloseTo(node.z);
    // The shower stands north of the corridor, so a ray from its middle through
    // the door runs south onto the grass. The line runs west along the paving.
    expect(crowd.z[behind]).toBeCloseTo(node.z);
    expect(crowd.x[behind]).toBeLessThan(node.x);
  });

  it('balks the guest who finds the lane down a short spur already full', () => {
    // Two tiles of paving and nothing else, running south from the shower's
    // door: a lane of 16 voxels holds three people six voxels apart.
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
    // One inside and three waiting, which is all the spur holds.
    for (const person of [0, 1, 2, 3]) arrive(person);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 3 });

    const late = 4;
    arrive(late);
    expect(router.occupancyOf('beach-shower#0')?.waiting).toBe(3);
    expect(router.visitOf(late)).toBeNull();
    // And they did not decide on it again: `chooseVenue` was handed the lane.
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

    // The same corridor three tiles south, with the shower moved to match.
    const moved = networkOf(Array.from({ length: 8 }, (_, tileX) => ({ tileX, tileZ: 3, y: 0 })));
    router.rebuild([{ ...shower(7), tileZ: 2, z: 2.5 * TILE_VOXELS }], [], moved);
    for (const person of [0, 1]) releaseTo(crowd, person, nodeAt(moved, 0, 3));
    queue(moved);
    expect(router.occupancyOf('beach-shower#0')).toEqual({ inside: 1, waiting: 1 });
    // On the new corridor's door node, not on the one before the edit.
    expect(crowd.z[1]).toBeCloseTo(3.5 * TILE_VOXELS);
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
    router.rebuild([shower(9)], [], rebuilt);
    expect(router.occupancyTotals).toEqual({ inside: 0, waiting: 0 });
    // The crowd is put back on the new graph by `reseatCrowd`, which walks a
    // held person like any other: the router deliberately re-aims nobody.
    const reseated = reseatCrowd(crowd, rebuilt);
    for (const person of [0, 1, 2]) expect(isWaiting(reseated, person)).toBe(false);
  });
});

/** The fixture's one lodging, on the tile north of the corridor's west end. */
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

/** Steps with no clock until everybody named is settled, and says whether they were. */
const untilSettled = (crowd: Crowd, people: readonly number[]): boolean => {
  for (let step = 0; step < 600; step++) {
    if (people.every((person) => isWaiting(crowd, person))) return true;
    stepCrowd(crowd, MAX_STEP);
  }
  return false;
};

/** Whether somebody is lying or sitting down, rather than walking or stood. */
const resting = (crowd: Crowd, person: number): boolean =>
  [RESTING.sitting, RESTING.lying].includes(restingOn(crowd, person) as 2 | 3);

describe('a visit to the beach', () => {
  // Water from z = 18; six rows of sand in front of it, and a boardwalk down to it.
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

  /** A bored guest at the top of the boardwalk, with nothing on the plot but sand. */
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

  /**
   * Two free loungers either side of 12,12, on 13,12 and 12,13: clear of the
   * boardwalk, or they would hang off its nodes rather than stand on the beach.
   */
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

  /**
   * Everybody named bored, deciding on the beach at the top of the boardwalk,
   * and walked down it to the gate, in a crowd that does not roam - as
   * `showcase.ts` builds it.
   */
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
    const { router, crowd } = routerOn(walked, options.venues ?? [], needs, options.night, false);
    const above = walked.nodes[nodeAt(walked, 10, 11)]!;
    for (const person of people) {
      router.step(person, nodeAt(walked, 10, 10));
      holdAt(crowd, person, above.x, above.y, above.z, 0);
      releaseTo(crowd, person, walked.gates[0]!);
    }
    return { needs, router, crowd };
  };

  /** A family of the fixture with a child in it, adults first. */
  const family = guests.parties.find(
    (party) => party.kind === 'family' && party.members.some((m) => guests.child[m] === 1),
  )!.members;

  /**
   * Frames to the simulated minute on the sand: the crowd's pace at `normal`,
   * about ten times real time, rather than {@link TICKS_EVERY}'s real time, at
   * which a visit of three quarters of an hour is over before a guest has
   * walked four tiles to a party's pitch.
   */
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
    // Near the gate, if not in front of it: their party shares their goal and
    // may have reached another gate down the boardwalk first and pitched there.
    expect(Math.abs(tileX - 10) + Math.abs(tileZ - 12)).toBeLessThanOrEqual(12);
    expect(roamed, 'wandered the beach').toBe(false);
    expect(needs.level.fun[0]).toBeGreaterThan(0.5);
    expect(backAt, 'never came back onto the boardwalk').toBe(setOffFrom);
    expect(network.gates).toContain(backAt);
    // Walked, never put: nobody crosses the sand in one frame. Half a tile
    // rather than a step's worth, because the frame after a hold also carries
    // the sidestep avoidance gives somebody walking a lane - about four voxels
    // where a turn reverses which side of the line they keep to.
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
    // Stamped a few minutes before bed, so the visit's own dwell is far from over.
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

  /** A drinks kiosk out on the sand, three tiles east of the boardwalk. */
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

  /** Steps and ticks the resort on, and hands back whether `until` came true. */
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
    // A tick's worth of thirst, the way an afternoon on the sand brings it on.
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
    // Their own spot, and their own lounger: the pitch was theirs all along.
    expect(crowd.x[0]).toBeCloseTo(spot.x);
    expect(crowd.z[0]).toBeCloseTo(spot.z);
    expect(crowd.seat[0]).toBe(spot.seat);
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

    // Their bedtime, while they are standing at the kiosk: the stay is over and
    // they walk off the beach rather than back to their towel.
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
    router.rebuild([], [], network);
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
  // Water from z = 18; six rows of sand in front of it, so z = 12..17 is beach,
  // and a boardwalk down to the back of it whose last tile is the one gate.
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

  /** A beach shower on tile 4,14, with no door and nothing paved anywhere near it. */
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

  /**
   * Everybody named stood on the boardwalk and walking down it towards the sand:
   * stood there first, since the crowd may have started them out on the beach.
   */
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
    // No ticks: whoever gets in first stays in, so the other has to wait.
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

    // An edit somewhere else on the plot: the same graph, and every route forgotten.
    router.rebuild([shower], [], network);
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

  /** A hungry guest on the corridor, with a bakery at one end and the hotel at the other. */
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
    // Held: asking again changes nothing.
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
    // Hungry but undecided, and no bed: nothing yet says where to be.
    expect(nightOn(homeless).router.offTheSand(homeless)).toBe(false);
    router.step(housed, nodeAt(network, 1));
    expect(router.isAsleep(housed)).toBe(true);
    expect(router.offTheSand(housed)).toBe(false);
  });

  it('wakes everybody when the graph is rebuilt', () => {
    const { network, router } = nightOn(housed);
    router.step(housed, nodeAt(network, 1));
    expect(router.asleepCount).toBe(1);
    router.rebuild([bakery(9)], [hotel()], networkOf(street(10)));
    expect(router.asleepCount).toBe(0);
    expect(router.isAsleep(housed)).toBe(false);
  });
});

/** What a run over the generated plot is watched with, beyond its own counts. */
interface Watch {
  /** Passed to the crowd; see `CrowdOptions.roamsBeach`. */
  readonly roamsBeach?: boolean;
  /** Stands in for the crowd's call to the router, so what it does can be counted. */
  readonly step?: (router: Router, person: number, at: number) => number;
  /** Called after every tick. */
  readonly tick?: (crowd: Crowd, people: Guests) => void;
  /** Frames of `MAX_STEP` to the tick; `TICKS_EVERY`, the crowd at real time, when omitted. */
  readonly framesPerTick?: number;
}

/**
 * Frames of `MAX_STEP` to the simulated minute with the crowd at `normal`'s
 * pace, as `showcase.ts` walks it: a day of `SPEED_DAY_SECONDS.normal` real
 * seconds, and the crowd `crowdScaleFor('normal')` times faster than that.
 */
const NORMAL_FRAMES_PER_TICK = Math.round(
  (crowdScaleFor('normal') * SPEED_DAY_SECONDS.normal) / TICKS_PER_DAY / MAX_STEP,
);

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
      // Every door's lane, not only the one the router keeps: whichever it
      // picks has to be on the paving, so all of them do.
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

  /**
   * The test the unit tests above cannot be: a `next` array built backwards, or
   * a sign error in the sweep, passes every one of them on a straight corridor
   * and sends the whole resort the wrong way here. What it asserts is only that
   * walking towards somewhere gets you nearer to it, over a plot laid by
   * something that has never heard of routing.
   */
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

    // The crowd is what the router reads positions from, and the router is what
    // the crowd is built with, so one of the two is bound late - exactly as
    // `showcase.ts` binds it.
    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues,
      lodgings: [],
      network,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      seed: 17,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });

    // Somebody walking the graph rather than out on the sand: a roamer never
    // reaches a node, so nothing ever asks the router about them.
    const hungry = [...Array(people.count).keys()].find((person) => !isRoaming(crowd!, person))!;
    needs.level.hunger[hungry] = 0;

    // One arrival is needed before there is a goal to measure against, so the
    // walk runs a little before the distance is taken.
    for (let step = 0; step < 60; step++) stepCrowd(crowd, MAX_STEP);
    const goal = router.goalOf(hungry);
    expect(goal, 'a hungry guest on a plot with food chose nowhere').not.toBeNull();
    const distanceTo = (): number =>
      Math.hypot(goal!.x - crowd!.x[hungry]!, goal!.z - crowd!.z[hungry]!);
    const before = distanceTo();

    // A few simulated minutes at the fixed step the benchmark uses. The nearest
    // they ever got is the measurement, not where they ended up: a visit ends
    // and they set off somewhere else, so a guest who was fed is walking away
    // again by the end of the run.
    let nearest = before;
    for (let step = 0; step < 2400; step++) {
      stepCrowd(crowd, MAX_STEP);
      // Two frames to the simulated minute, which is about what `normal` speed
      // works out at; without a tick nobody is ever let out of anywhere.
      if (step % TICKS_EVERY === 0) router.tick(step / TICKS_EVERY);
      nearest = Math.min(nearest, distanceTo());
    }

    expect(nearest).toBeLessThan(before);
    // And they got there: nothing decays in this test, so a hunger above zero
    // is a visit that happened. A field built backwards would walk them away
    // from every door on the plot and leave this at zero for ever.
    expect(needs.level.hunger[hungry]).toBeGreaterThan(0);
    expect(crowd.x[hungry]).toBeGreaterThanOrEqual(0);
    expect(crowd.z[hungry]).toBeGreaterThanOrEqual(0);
    expect(crowd.x[hungry]).toBeLessThanOrEqual(plan.tilesX * TILE_VOXELS);
    expect(crowd.z[hungry]).toBeLessThanOrEqual(plan.tilesZ * TILE_VOXELS);
  });

  /**
   * The assertion the whole of plan 018 exists for, and the one no unit test can
   * make: six hundred people over a plot laid by something that has never heard
   * of a queue. A capacity that held only on a corridor of eight nodes would
   * pass every test above and let a bakery for eight take two hundred here.
   *
   * Run twice. Once with the capacities the art declares, which is the resort as
   * it is; and once with every one of them squeezed to a single person, because
   * the declared ones do not bind on this plot - twelve places serving hunger
   * hold 198 between them, and six hundred guests spread over a 112 by 100 plot
   * never fill them. A line forming at all is what the second run is for, and a
   * capacity of 1 is also where an off-by-one in the shuffle-up shows.
   */
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
    // The whole resort heads for food at once, which is the worst case a queue
    // can be put under and not a case the plot would reach on its own.
    needs.level[need].fill(0);
    const before = new Float32Array(needs.level[need]);
    // The plot's own venues, with only the capacity moved: a loop rather than a
    // spread in a `map`, which the linter is right to dislike.
    const standing: Venue[] = [];
    for (const venue of venues) standing.push({ ...venue, capacity: capacityOf(venue) });

    let crowd: Crowd | null = null;
    const router = createRouter({
      guests: people,
      needs,
      venues: standing,
      lodgings: [],
      network: walked,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
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
    /** The ids of every venue anybody was ever inside. */
    const served = new Set<string>();

    let queued = 0;
    let busiest = 0;
    let over: string | null = null;
    // Half a simulated day, at the fixed step the benchmark uses. An hour is
    // not enough on a plot this size: at a walk of 5.6 voxels a second and two
    // frames to the minute, an hour is four tiles of walking and nobody has
    // reached anything yet, let alone had to wait for it.
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
      // Nobody is in two places at once: a visit names one venue, and a person
      // the router says nothing about is walking.
      const visit = router.visitOf(person);
      // The beach is the router's own venue, appended to the plot's.
      if (visit && !standing.includes(visit.venue) && !isBeach(visit.venue)) {
        confused ??= `person ${person}`;
      }
    }
    return { over, queued, busiest, fed, confused, served };
  };

  it('never lets a venue hold more people than it says it does', () => {
    const run = starving((venue) => venue.capacity);
    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    // Somebody got in and somebody ate: a capacity assertion over an empty
    // resort would pass and mean nothing.
    expect(run.busiest, 'nobody ever got inside anything').toBeGreaterThan(0);
    expect(run.fed, 'half a simulated day and nobody ate').toBeGreaterThan(0);
  });

  /**
   * The same plot with everything standing on it painted onto the sand, as
   * `showcase.ts` builds it: what a route over the beach has to find its way
   * round. The network above leaves the sand open, and the runs measured for
   * plans 018 and 026 were made on it.
   */
  const furnished = walkNetworkFor({
    paved: layout.paths,
    levelOf: (x, z) => levelAt(elevation, x, z),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    obstacles: layout.placements,
  });
  const furnishedIndex = nodeIndexFor(furnished);
  /** `router.ts`'s own reach over the sand, in tile steps. */
  const SAND_TILES = 40;

  /**
   * Plan 027's measure. Before it, 20 venues on this plot had no way in at all,
   * and they were the beach: every shower, changing cabin and beach club.
   *
   * One was left over: a poolside bar the generator stood on a sand terrace at
   * level 3, which is sand but not beach band. Putting the snack bar and the
   * ice-cream cart on the back of the beach moved what the generator stands
   * where, and that bar is not on this plot any more - so every venue it does
   * stand can now be reached. A sand terrace is still not routable, and whether
   * those are paved or roamed is still the maintainer's call.
   */
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
    // Pinned before plan 027 gave `beach-club`, `pedalo-rental` and
    // `beach-shower` doors: on this plot all three stand on the sand, which
    // grows no spur, so declaring where they are entered changes no paving.
    //
    // Re-pinned when the snack bar and the ice-cream cart joined the back of the
    // beach: standing them on the sand satisfies the generator's "every type
    // somewhere" pass, so it no longer has to find them a plot inland, and the
    // spurs that would have served those plots are not grown. 2 232 tiles became
    // 2 240 - different tiles, not more paving on the sand.
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
    const run = starving((venue) => venue.capacity, 'hygiene', furnished);
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

  /**
   * Plan 028's measure: six hundred bored guests over half a day, in a crowd
   * that does not roam, on the plot with its furniture and its seats, as
   * `showcase.ts` builds it. Nobody walks the beach aimlessly, parties rest
   * there, and they rest apart - a pitch overlapping another passes every
   * corridor test above and shows up here.
   *
   * **Walked at `normal`'s pace, not at {@link TICKS_EVERY}'s real time.** The
   * plan asked for the latter, and at it 23 guests of 600 ever chose the beach
   * and 5 were resting on it at most: on a plot of 112 by 100 a guest at real
   * time walks four tiles a simulated hour, so half a day sees few of them reach
   * a gate, and a visit's dwell runs out on the walk to the pitch. At the pace
   * the resort runs, measured when this was written: 353 arrivals at a gate for
   * the beach, none turned back for want of a pitch or a route, 70 resting on
   * the sand at once and 7 on loungers. The half day took 1.2 s, against 1.3 s
   * for the same run of `starving` for hunger at the same pace.
   */
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

  it('grows a line at the door when every place holds one person', () => {
    const run = starving(() => 1);
    expect(run.over).toBeNull();
    expect(run.confused).toBeNull();
    expect(run.busiest).toBe(1);
    expect(run.queued, 'six hundred hungry guests and no line anywhere').toBeGreaterThan(0);
    // And the lines moved: a queue that never shuffled up would feed the one
    // person who got in first and nobody else.
    expect(run.fed, 'a line formed and nothing ever came out of it').toBeGreaterThan(1);
  });
  /**
   * A whole night over the plot laid by something that has never heard of bed:
   * a field keyed to the wrong lodging, or a bedtime window that does not wrap,
   * passes every corridor test above and shows up here.
   *
   * **What it does not assert is that most of the resort is asleep by two.** At
   * two frames to the simulated minute a guest walks about four tiles an hour,
   * so on a plot of 112 by 100 most of them are still on their way home at two
   * and some are not in bed by the time they are due up - which is the pace
   * plan 026 is about, not something the night can fix. And a guest out on the
   * sand never reaches a node, so nothing asks the router about them until they
   * step back onto the paving. So it asserts the decision instead: at two,
   * everybody housed who is on the graph and not in the middle of a visit is in
   * bed or walking to it.
   */
  it('sends the resort to bed at night and gets it up in the morning', () => {
    const lodgings = lodgingsOn(layout.placements);
    const people = createGuests({
      // More than the plot sleeps, so some are left with no bed.
      count: 800,
      // Biggest first, as `showcase.ts`'s `homesOn` hands them to `assignHomes`.
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
      network,
      tickOfDay: () => ticks % TICKS_PER_DAY,
      crowd: () => crowd!,
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
    // Read the tick they are let up rather than at nine: somebody up at seven
    // has walked two hours of energy off by then, and with bedtime in the
    // evening they turn in with plenty left to walk off.
    const gotUpWith = new Float32Array(people.count).fill(-1);
    let strangerBed: string | null = null;
    let homelessAsleep: string | null = null;
    let atTwo = { onTheGraph: 0, bedward: 0 };

    // Thirteen simulated hours, to nine in the morning, when the last party is
    // due up.
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

  /**
   * The measurement `plans/026-a-guests-day.md` turns on, run the way the
   * showcase runs a frame: the clock at `normal` on sixty frames a second, the
   * needs decaying and the router ticking on the ticks it hands back, and the
   * crowd walked at `crowdScaleFor`'s multiple of the same frames.
   *
   * A family, hungry, whose nearest food is near the edge of their reach -
   * 313 voxels of their 320 - walking to wherever they choose, which is the
   * restaurant 435 voxels off. Measured when this was written: 49 simulated
   * minutes on the way, 0.30 hunger down to 0.14, and out again at 1. The same
   * run with the crowd on real time took 529 minutes and they got there with
   * none. What it asserts is that they come out better fed than they set off,
   * which is `archetypes.ts`'s decay rates reaching a guest at all.
   */
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
      network,
      tickOfDay: () => clock.ticks % TICKS_PER_DAY,
      crowd: () => crowd!,
      seed: 17,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 3,
      routeOf: (person, at) => router.step(person, at),
    });

    // Of the family members on the paving, the one whose nearest food is
    // furthest off while still inside their reach.
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
    // Six simulated hours at most, which at real time would not see them there.
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
    // Better fed than they set off, which is the whole question.
    expect(left!).toBeGreaterThan(setOff!.hunger);
    // And the walk itself took an hour and a half, not most of a day. It was 49
    // simulated minutes to a restaurant 435 voxels off until the snack bar and
    // the ice-cream cart joined the back of the beach: that moved what the
    // generator stands where, and the nearest restaurant this family would
    // choose is now 630 voxels away, which is 90 minutes of walking.
    expect(arrived!.tick - setOff!.tick).toBeLessThan(120);
  });
});
