import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { createCrowd, isRoaming, MAX_STEP, stepCrowd, type Crowd } from '../../crowd/domain/crowd';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { createGuests, partyOf, type Guests } from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor } from '../../layout/domain/shoreline';
import { createNeeds, NEEDS, type Needs } from './needs';
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

const routerOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  needs: Needs,
): ReturnType<typeof createRouter> =>
  createRouter({
    guests,
    needs,
    venues,
    network,
    // Every fixture guest stands at the west end, which is far enough from the
    // bakery that the straight line does not decide anything on its own.
    positionOf: () => ({ x: 0, z: 0 }),
  });

describe('createRouter', () => {
  it('walks a hungry guest towards the bakery from anywhere along the corridor', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const router = routerOn(network, [bakery(7)], needs);
    for (const tileX of [0, 2, 5]) {
      // The step from each node is the neighbour one tile nearer the bakery.
      expect(router.step(0, nodeAt(network, tileX)), `tile ${tileX}`).toBe(
        nodeAt(network, tileX + 1),
      );
    }
  });

  it('leaves a content guest to wander', () => {
    const network = networkOf(street(8));
    const router = routerOn(network, [bakery(7)], wanting(0, null));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
  });

  it('leaves a guest to wander when nothing on the plot serves what they want', () => {
    const network = networkOf(street(8));
    const router = routerOn(network, [bakery(7)], wanting(0, 'hygiene'));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
  });

  it('sees to the need on arrival, and lets them decide afresh', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    const router = routerOn(network, [bakery(7)], needs);
    const door = nodeAt(network, 7);
    // They have to want it before they can arrive at it: the first step is what
    // sets the goal, and the field is what makes tile 7 the door.
    router.step(0, nodeAt(network, 0));
    expect(router.goalOf(0)?.key).toBe('bakery#0');

    router.step(0, door);
    expect(needs.level.hunger[0]).toBeCloseTo(0.5);
    // Half-fed and still the loudest need, so they set off for it again; what
    // matters is that the goal was let go and re-taken rather than held.
    expect(needs.level.hunger[0]).toBeLessThan(1);
  });

  it('aims a party member who decided nothing at the venue their sibling chose', () => {
    const network = networkOf(street(8));
    const person = [...Array(guests.count).keys()].find(
      (candidate) => partyOf(guests, candidate).length > 1,
    )!;
    const sibling = partyOf(guests, person).find((member) => member !== person)!;
    const router = routerOn(network, [bakery(7)], wanting(person, 'hunger'));

    router.step(person, nodeAt(network, 0));
    expect(router.goalOf(sibling)?.key).toBe('bakery#0');
    expect(router.step(sibling, nodeAt(network, 3))).toBe(nodeAt(network, 4));
  });

  it('builds one field per venue and no more, however many guests walk to it', () => {
    const network = networkOf(street(8));
    const needs = wanting(0, 'hunger');
    needs.level.hunger[1] = 0;
    const router = routerOn(network, [bakery(7)], needs);
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
    const router = routerOn(network, [stranded], wanting(0, 'hunger'));
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    expect(router.goalOf(0)).toBeNull();
  });

  it('throws away its fields and its goals when the graph is rebuilt', () => {
    const network = networkOf(street(8));
    const router = routerOn(network, [bakery(7)], wanting(0, 'hunger'));
    router.step(0, nodeAt(network, 0));
    expect(router.fieldCount).toBe(1);
    expect(router.goalOf(0)).not.toBeNull();

    const rebuilt = networkOf(street(10));
    router.rebuild([bakery(9)], rebuilt);
    expect(router.fieldCount).toBe(0);
    expect(router.goalOf(0)).toBeNull();
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
      network,
      positionOf: (person) => ({ x: crowd?.x[person] ?? 0, z: crowd?.z[person] ?? 0 }),
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
    // they ever got is the measurement, not where they ended up: arriving sees
    // to the need and they set off somewhere else on the very same arrival, so
    // a guest who was fed is walking away again by the end of the run.
    let nearest = before;
    for (let step = 0; step < 2400; step++) {
      stepCrowd(crowd, MAX_STEP);
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
});
