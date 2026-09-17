import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { createCrowd, isWaiting, type Crowd } from '../../crowd/domain/crowd';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { LevelProvider } from '../../layout/domain/elevation';
import { createStaffRouter, meanCleanliness, type StaffRouter } from './staffRouter';
import { staffFor } from './staff';
import { cleanliness, createUpkeep, NEEDS_CLEANING, type Upkeep } from './upkeep';
import type { Venue } from './venues';
import type { Weather } from './weather';

const FLAT: LevelProvider = () => 0;

/** A paved corridor `length` tiles long, running east; `router.test.ts`'s own. */
const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

/** A venue standing on the tile north of the corridor, at `tileX`. */
const shop = (key: string, tileX: number): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
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

/**
 * A staff router and the crowd it walks, bound to each other the way
 * `showcase.ts` binds them, on a corridor with the venues given.
 */
const staffOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  dirt: readonly number[],
  workers = 1,
  /** What kind of day it is. Omit it and it is clear, as every fixture here assumes. */
  weather: Weather = 'clear',
): { router: StaffRouter; crowd: Crowd; upkeep: Upkeep } => {
  const upkeep = createUpkeep(venues.length);
  for (let venue = 0; venue < dirt.length; venue++) upkeep.level[venue] = dirt[venue]!;
  const staff = staffFor(venues.length);
  const count = Math.max(workers, staff.count);
  let crowd: Crowd | null = null;
  const router = createStaffRouter({
    staff: { ...staff, count, variant: new Int32Array(count) },
    venues,
    network,
    upkeep: () => upkeep,
    crowd: () => crowd!,
    weather: () => weather,
    seed: 11,
  });
  crowd = createCrowd({
    network,
    count,
    variants: 1,
    seed: 3,
    routeOf: (worker, at) => router.step(worker, at),
  });
  return { router, crowd, upkeep };
};

describe('createStaffRouter', () => {
  it('walks a cleaner towards the dirtiest venue that wants cleaning', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    // The far one is filthy and the near one is merely used: a cleaner crosses
    // the plot for the worse of the two.
    const { router } = staffOn(network, venues, [0.65, 0.1]);
    for (const tileX of [0, 2, 5]) {
      expect(router.step(0, nodeAt(network, tileX)), `tile ${tileX}`).toBe(
        nodeAt(network, tileX + 1),
      );
    }
  });

  it('does not let two cleaners take the same venue', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router } = staffOn(network, venues, [0.2, 0.3], 2);
    // The first takes the filthiest; the second is left the other one, and
    // walks the other way down the corridor for it.
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
    expect(router.step(1, nodeAt(network, 4))).toBe(nodeAt(network, 5));
  });

  it('holds a cleaner still at the venue, with nothing yet cleaner for it', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1)];
    const { router, crowd, upkeep } = staffOn(network, venues, [0.2]);
    router.step(0, nodeAt(network, 4));
    expect(router.step(0, nodeAt(network, 1))).toBe(-1);
    expect(isWaiting(crowd, 0), 'walked straight past the venue').toBe(true);
    expect(router.atWork(0)?.key).toBe('bakery#0');
    expect(router.workingCount).toBe(1);
    // A spell that has started has cleaned nothing: the work is the dwell.
    expect(cleanliness(upkeep, 0)).toBeCloseTo(0.2);
    for (let tick = 1; tick <= 10; tick++) router.tick(tick);
    expect(cleanliness(upkeep, 0)).toBeCloseTo(0.2);
    expect(router.workingCount).toBe(1);
  });

  it('scrubs the venue when the spell ends, and lets the cleaner go', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1)];
    const { router, crowd, upkeep } = staffOn(network, venues, [0.2]);
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 1));
    // A spell is fifteen to twenty-five ticks; run long enough for any draw.
    for (let tick = 1; tick <= 30; tick++) router.tick(tick);
    expect(cleanliness(upkeep, 0)).toBeGreaterThan(0.4);
    expect(router.workingCount).toBe(0);
    expect(router.atWork(0)).toBeNull();
    expect(isWaiting(crowd, 0), 'never let go of the venue').toBe(false);
    // And they are free to be sent somewhere again.
    expect(cleanliness(upkeep, 0)).toBeLessThan(NEEDS_CLEANING);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('leaves a cleaner wandering on a plot with nothing dirty enough', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router } = staffOn(network, venues, [1, 0.9]);
    expect(router.step(0, nodeAt(network, 4))).toBe(-1);
    expect(router.atWork(0)).toBeNull();
    // Nor is there anything to do on a plot with no venues at all.
    expect(staffOn(networkOf(street(8)), [], []).router.step(0, nodeAt(network, 4))).toBe(-1);
  });

  it('throws away every field and every claim when the graph is rebuilt', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router } = staffOn(network, venues, [0.2, 0.3], 2);
    router.step(0, nodeAt(network, 4));
    router.step(1, nodeAt(network, 4));
    expect(router.step(0, nodeAt(network, 1))).toBe(-1);
    expect(router.workingCount).toBe(1);

    // The bakery was bulldozed and the corridor is longer: nobody is at work,
    // nobody holds a claim, and the one venue left is taken afresh.
    const rebuilt = networkOf(street(12));
    router.rebuild([shop('bar#0', 7)], rebuilt);
    expect(router.workingCount).toBe(0);
    expect(router.atWork(0)).toBeNull();
    expect(router.step(0, nodeAt(rebuilt, 11))).toBe(nodeAt(rebuilt, 10));
    // And the claim went with it, so the second cleaner is not left the venue
    // the first was already holding before the edit.
    expect(router.step(1, nodeAt(rebuilt, 11))).toBe(-1);
  });
});

describe('meanCleanliness', () => {
  it('is a mean over the venues standing, and 1 on a plot with none', () => {
    const upkeep = createUpkeep(3);
    upkeep.level.set([1, 0.5, 0]);
    expect(meanCleanliness(upkeep, 3)).toBeCloseTo(0.5);
    expect(meanCleanliness(upkeep, 0)).toBe(1);
    expect(meanCleanliness(createUpkeep(0), 0)).toBe(1);
  });
});

describe('a cleaner and the weather', () => {
  /** A pool at `tileX` with no roof over it, so the rain shuts it. */
  const pool = (key: string, tileX: number): Venue => ({
    ...shop(key, tileX),
    role: 'activity',
    shelter: 'open',
  });

  it('is not sent across the plot to mop a venue the rain has shut', () => {
    const network = networkOf(street(8));
    // The filthy one is the pool; the merely used one has a roof.
    const venues = [pool('swimming-pool#0', 7), shop('bakery#0', 1)];
    const clear = staffOn(network, venues, [0.1, 0.65]);
    expect(clear.router.step(0, nodeAt(network, 0)), 'the pool is the dirtier').toBe(
      nodeAt(network, 1),
    );

    const storm = staffOn(network, venues, [0.1, 0.65], 1, 'storm');
    storm.router.step(0, nodeAt(network, 0));
    // They work at the bakery instead: the pool is shut, and nobody is dirtying
    // it either. It gets scrubbed when it reopens.
    for (let tick = 1; tick <= 40; tick++) storm.router.tick(tick);
    const worked = [...Array(40).keys()].map(() => storm.router.atWork(0)?.key);
    expect(worked).not.toContain('swimming-pool#0');
  });

  it('claims the shut venue again the moment the sky clears', () => {
    const network = networkOf(street(8));
    const venues = [pool('swimming-pool#0', 7), shop('bakery#0', 1)];
    let weather: Weather = 'storm';
    const upkeep = createUpkeep(venues.length);
    upkeep.level[0] = 0.1;
    upkeep.level[1] = 1;
    const staff = staffFor(venues.length);
    let crowd: Crowd | null = null;
    const router = createStaffRouter({
      staff,
      venues,
      network,
      upkeep: () => upkeep,
      crowd: () => crowd!,
      weather: () => weather,
      seed: 11,
    });
    crowd = createCrowd({
      network,
      count: staff.count,
      variants: 1,
      seed: 3,
      routeOf: (worker, at) => router.step(worker, at),
    });
    // Nowhere to go: the only dirty thing on the plot is shut, and the bakery
    // is spotless.
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    weather = 'clear';
    expect(router.step(0, nodeAt(network, 0))).toBe(nodeAt(network, 1));
  });
});
