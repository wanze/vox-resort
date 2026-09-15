import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import {
  createCrowd,
  isRoaming,
  isWaiting,
  MAX_STEP,
  releaseTo,
  reseatCrowd,
  stepCrowd,
  type Crowd,
} from '../../crowd/domain/crowd';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { createGuests, homeOf, partyOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME, type Home } from '../../guests/domain/homes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor } from '../../layout/domain/shoreline';
import { createNeeds, decayNeeds, NEEDS, type Needs } from './needs';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { doorsFor } from './doors';
import { lodgingFor, lodgingsOn, type Lodging } from './lodgings';
import { bedtimeOf } from './night';
import { MAX_QUEUE_SHOWN, queueLaneFor } from './queueLane';
import { createRouter } from './router';
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

  it('wakes everybody when the graph is rebuilt', () => {
    const { network, router } = nightOn(housed);
    router.step(housed, nodeAt(network, 1));
    expect(router.asleepCount).toBe(1);
    router.rebuild([bakery(9)], [hotel()], networkOf(street(10)));
    expect(router.asleepCount).toBe(0);
    expect(router.isAsleep(housed)).toBe(false);
  });
});

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
  const starving = (capacityOf: (venue: Venue) => number) => {
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
    needs.level.hunger.fill(0);
    const before = new Float32Array(needs.level.hunger);
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
      network,
      tickOfDay: () => NOON,
      crowd: () => crowd!,
      seed: 19,
    });
    crowd = createCrowd({
      network,
      count: people.count,
      variants: 4,
      seed: 4,
      routeOf: (person, at) => router.step(person, at),
    });

    const food = standing.filter((venue) =>
      venue.satisfies.some((relief) => relief.need === 'hunger'),
    );
    expect(food.length, 'a generated plot with nothing to eat on it').toBeGreaterThan(0);

    let queued = 0;
    let busiest = 0;
    let over: string | null = null;
    // Half a simulated day, at the fixed step the benchmark uses. An hour is
    // not enough on a plot this size: at a walk of 5.6 voxels a second and two
    // frames to the minute, an hour is four tiles of walking and nobody has
    // reached anything yet, let alone had to wait for it.
    for (let tick = 1; tick <= TICKS_PER_DAY / 2; tick++) {
      for (let frame = 0; frame < TICKS_EVERY; frame++) stepCrowd(crowd, MAX_STEP);
      router.tick(tick);
      for (const venue of food) {
        const here = router.occupancyOf(venue.key)!;
        if (here.inside > venue.capacity)
          over ??= `${venue.key} held ${here.inside} on tick ${tick}`;
        queued = Math.max(queued, here.waiting);
        busiest = Math.max(busiest, here.inside);
      }
    }

    let fed = 0;
    let confused: string | null = null;
    for (let person = 0; person < people.count; person++) {
      if (needs.level.hunger[person]! > before[person]!) fed++;
      // Nobody is in two places at once: a visit names one venue, and a person
      // the router says nothing about is walking.
      const visit = router.visitOf(person);
      if (visit && !standing.includes(visit.venue)) confused ??= `person ${person}`;
    }
    return { over, queued, busiest, fed, confused };
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
    const tired = slept.find((person) => !(needs.level.energy[person]! > wentToBedWith[person]!));
    expect(tired, 'got up as tired as they went to bed').toBeUndefined();
  });
});
