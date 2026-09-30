import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  createCrowd,
  isWaiting,
  MAX_STEP,
  restingOn,
  RESTING,
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
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor } from '../../layout/domain/shoreline';
import { createBreakdowns, isBroken, type Breakdowns } from './breakdowns';
import {
  createStaffRouter,
  meanCleanliness,
  REPAIR_TICKS,
  type StaffRouter,
  type StaffZones,
} from './staffRouter';
import { createLitter, litterAt, SWEEP_ABOVE, type Litter } from './litter';
import { rosterFor, STAFF_ROLES, unwatched, type Staff, type StaffRole } from './staff';
import { cleanliness, createUpkeep, NEEDS_CLEANING, type Upkeep } from './upkeep';
import type { Venue } from './venues';
import type { Weather } from './weather';
import { NO_ZONE } from './zones';

const FLAT: LevelProvider = () => 0;

const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

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

const cleaners = (count: number): Staff => ({
  count,
  role: Array.from({ length: count }, () => 'cleaner'),
  variant: new Int32Array(count),
});

const staffOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  dirt: readonly number[],
  workers = 1,
  weather: Weather = 'clear',
  duty?: () => Uint8Array,
): { router: StaffRouter; crowd: Crowd; upkeep: Upkeep } => {
  const upkeep = createUpkeep(venues.length);
  for (let venue = 0; venue < dirt.length; venue++) upkeep.level[venue] = dirt[venue]!;
  const count = Math.max(
    workers,
    rosterFor({ venues: venues.length, bathing: 0, posts: 0, stages: 0 }).cleaner,
  );
  let crowd: Crowd | null = null;
  const router = createStaffRouter({
    staff: cleaners(count),
    venues,
    network,
    upkeep: () => upkeep,
    crowd: () => crowd!,
    weather: () => weather,
    ...(duty ? { duty } : {}),
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
    expect(cleanliness(upkeep, 0)).toBeLessThan(NEEDS_CLEANING);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('leaves a cleaner wandering on a plot with nothing dirty enough', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router } = staffOn(network, venues, [1, 0.9]);
    expect(router.step(0, nodeAt(network, 4))).toBe(-1);
    expect(router.atWork(0)).toBeNull();
    expect(staffOn(networkOf(street(8)), [], []).router.step(0, nodeAt(network, 4))).toBe(-1);
  });

  it('never sends anybody off duty anywhere', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const duty = Uint8Array.from([0, 1]);
    const { router } = staffOn(network, venues, [0.2, 0.3], 2, 'clear', () => duty);
    expect(router.step(0, nodeAt(network, 4))).toBe(-1);
    expect(router.step(0, nodeAt(network, 1))).toBe(-1);
    expect(router.atWork(0)).toBeNull();
    expect(router.step(1, nodeAt(network, 4)), 'the one on duty takes the dirtiest').toBe(
      nodeAt(network, 3),
    );
  });

  it('lets a cleaner taken off duty mid-spell finish it and free the venue', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1)];
    const duty = Uint8Array.from([1, 1]);
    const { router, upkeep } = staffOn(network, venues, [0.2], 2, 'clear', () => duty);
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 1));
    expect(router.workingCount).toBe(1);
    duty[0] = 0;
    router.tick(1);
    expect(router.workingCount).toBe(0);
    expect(router.atWork(0)).toBeNull();
    expect(cleanliness(upkeep, 0)).toBeGreaterThan(0.2);
    expect(router.step(1, nodeAt(network, 4)), 'the venue was left claimed').toBe(
      nodeAt(network, 3),
    );
  });

  it('throws away every field and every claim when the graph is rebuilt', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router } = staffOn(network, venues, [0.2, 0.3], 2);
    router.step(0, nodeAt(network, 4));
    router.step(1, nodeAt(network, 4));
    expect(router.step(0, nodeAt(network, 1))).toBe(-1);
    expect(router.workingCount).toBe(1);

    const rebuilt = networkOf(street(12));
    router.rebuild([shop('bar#0', 7)], rebuilt);
    expect(router.workingCount).toBe(0);
    expect(router.atWork(0)).toBeNull();
    expect(router.step(0, nodeAt(rebuilt, 11))).toBe(nodeAt(rebuilt, 10));
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
  const pool = (key: string, tileX: number): Venue => ({
    ...shop(key, tileX),
    role: 'activity',
    shelter: 'open',
  });

  it('is not sent across the plot to mop a venue the rain has shut', () => {
    const network = networkOf(street(8));
    const venues = [pool('swimming-pool#0', 7), shop('bakery#0', 1)];
    const clear = staffOn(network, venues, [0.1, 0.65]);
    expect(clear.router.step(0, nodeAt(network, 0)), 'the pool is the dirtier').toBe(
      nodeAt(network, 1),
    );

    const storm = staffOn(network, venues, [0.1, 0.65], 1, 'storm');
    storm.router.step(0, nodeAt(network, 0));
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
    const staff = cleaners(
      rosterFor({ venues: venues.length, bathing: 0, posts: 0, stages: 0 }).cleaner,
    );
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
    expect(router.step(0, nodeAt(network, 0))).toBe(-1);
    weather = 'clear';
    expect(router.step(0, nodeAt(network, 0))).toBe(nodeAt(network, 1));
  });
});

const littered = (tiles: readonly (readonly [number, number])[]): Litter => {
  const litter = createLitter(8, 1);
  for (const [tileX, level] of tiles) litter.level[tileX] = level;
  return litter;
};

describe('sweeping the paths', () => {
  const sweepersOn = (
    network: WalkNetwork,
    venues: readonly Venue[],
    dirt: readonly number[],
    litter: Litter,
    workers = 1,
  ): { router: StaffRouter; crowd: Crowd; upkeep: Upkeep } => {
    const upkeep = createUpkeep(venues.length);
    for (let venue = 0; venue < dirt.length; venue++) upkeep.level[venue] = dirt[venue]!;
    let crowd: Crowd | null = null;
    const router = createStaffRouter({
      staff: cleaners(workers),
      venues,
      network,
      upkeep: () => upkeep,
      crowd: () => crowd!,
      litter: () => litter,
      seed: 11,
    });
    crowd = createCrowd({
      network,
      count: workers,
      variants: 1,
      seed: 3,
      routeOf: (worker, at) => router.step(worker, at),
    });
    return { router, crowd, upkeep };
  };

  it('walks a cleaner with no dirty venue to a littered tile, and sweeps it', () => {
    const network = networkOf(street(8));
    const litter = littered([[6, 0.75]]);
    const { router, crowd } = sweepersOn(network, [], [], litter);
    expect(router.step(0, nodeAt(network, 2))).toBe(nodeAt(network, 3));
    expect(router.step(0, nodeAt(network, 5))).toBe(nodeAt(network, 6));
    expect(router.step(0, nodeAt(network, 6))).toBe(-1);
    expect(isWaiting(crowd, 0), 'walked straight past the litter').toBe(true);
    expect(router.atWork(0), 'a tile is not a venue').toBeNull();
    expect(router.workingCount).toBe(1);
    expect(litterAt(litter, 6, 0)).toBe(0.75);

    for (let tick = 1; tick <= 10; tick++) router.tick(tick);
    expect(litterAt(litter, 6, 0)).toBe(0);
    expect(router.workingCount).toBe(0);
    expect(isWaiting(crowd, 0), 'never let go of the tile').toBe(false);
  });

  it('takes a dirty venue before a littered tile', () => {
    const network = networkOf(street(8));
    const litter = littered([[6, 1]]);
    const { router } = sweepersOn(network, [shop('bakery#0', 1)], [0.2], litter);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('leaves a tile below the sweeping mark alone', () => {
    const network = networkOf(street(8));
    const litter = littered([[6, SWEEP_ABOVE - 0.25]]);
    const { router } = sweepersOn(network, [], [], litter);
    expect(router.step(0, nodeAt(network, 2))).toBe(-1);
  });

  it('never lets two cleaners claim the same tile', () => {
    const network = networkOf(street(8));
    const litter = littered([
      [1, 0.5],
      [6, 1],
    ]);
    const { router } = sweepersOn(network, [], [], litter, 2);
    expect(router.step(0, nodeAt(network, 4)), 'the worst tile first').toBe(nodeAt(network, 5));
    expect(router.step(1, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('lets the claim go when a rebuild renumbers the graph', () => {
    const network = networkOf(street(8));
    const litter = littered([[6, 1]]);
    const { router } = sweepersOn(network, [], [], litter, 2);
    router.step(0, nodeAt(network, 4));
    expect(router.step(1, nodeAt(network, 4))).toBe(-1);
    router.rebuild([], network);
    expect(router.step(1, nodeAt(network, 4))).toBe(nodeAt(network, 5));
  });
});

const crew = (roles: readonly StaffRole[]): Staff => ({
  count: roles.length,
  role: roles,
  variant: Int32Array.from(roles, (role) => STAFF_ROLES.indexOf(role)),
});

const crewOn = (
  network: WalkNetwork,
  venues: readonly Venue[],
  roles: readonly StaffRole[],
  options: {
    readonly occupants?: readonly number[];
    readonly weather?: () => Weather;
    readonly dirt?: readonly number[];
    readonly zones?: StaffZones;
    readonly litter?: Litter;
  } = {},
): { router: StaffRouter; crowd: Crowd; upkeep: Upkeep } => {
  const upkeep = createUpkeep(venues.length);
  for (const [venue, level] of (options.dirt ?? []).entries()) upkeep.level[venue] = level;
  const staff = crew(roles);
  let crowd: Crowd | null = null;
  const router = createStaffRouter({
    staff,
    venues,
    network,
    upkeep: () => upkeep,
    crowd: () => crowd!,
    ...(options.weather ? { weather: options.weather } : {}),
    ...(options.occupants ? { occupants: (venue: number) => options.occupants![venue] ?? 0 } : {}),
    ...(options.zones ? { zones: () => options.zones! } : {}),
    ...(options.litter ? { litter: () => options.litter! } : {}),
    seed: 11,
  });
  crowd = createCrowd({
    network,
    count: staff.count,
    variants: STAFF_ROLES.length,
    variantOf: (worker) => staff.variant[worker] ?? 0,
    seed: 3,
    routeOf: (worker, at) => router.step(worker, at),
    roamsBeach: false,
  });
  return { router, crowd, upkeep };
};

const stage = (key: string, tileX: number): Venue => ({
  ...shop(key, tileX),
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.9 }],
  stage: true,
});

const pool = (key: string, tileX: number): Venue => ({
  ...shop(key, tileX),
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.8 }],
  shelter: 'open',
  bathing: true,
});

describe('an animator', () => {
  it('walks to the busiest open stage', () => {
    const network = networkOf(street(8));
    const venues = [stage('kids-club#0', 1), stage('game-hall#0', 7)];
    const { router } = crewOn(network, venues, ['animator'], { occupants: [2, 9] });
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.step(0, nodeAt(network, 7))).toBe(-1);
    expect(router.performingAt(1)).toBe(true);
    expect(router.performingAt(0)).toBe(false);
    expect(router.atWork(0)?.key).toBe('game-hall#0');
  });

  it('never puts two shows on one stage', () => {
    const network = networkOf(street(8));
    const venues = [stage('kids-club#0', 1), stage('game-hall#0', 7)];
    const { router } = crewOn(network, venues, ['animator', 'animator'], { occupants: [2, 9] });
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.step(1, nodeAt(network, 4)), 'took the stage already taken').toBe(
      nodeAt(network, 3),
    );
  });

  it('ends the show after its spell and moves on to another stage', () => {
    const network = networkOf(street(8));
    const venues = [stage('kids-club#0', 1), stage('game-hall#0', 7)];
    const { router, crowd } = crewOn(network, venues, ['animator'], { occupants: [2, 9] });
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 7));
    for (let tick = 1; tick < 60; tick++) router.tick(tick);
    expect(router.performingAt(1), 'a show is at least an hour').toBe(true);
    // A show is an hour or two; run long enough for any draw.
    for (let tick = 60; tick <= 130; tick++) router.tick(tick);
    expect(router.performingAt(1)).toBe(false);
    expect(router.workingCount).toBe(0);
    expect(isWaiting(crowd, 0), 'never let go of the stage').toBe(false);
    expect(router.step(0, nodeAt(network, 7)), 'went back to the stage it left').toBe(
      nodeAt(network, 6),
    );
  });

  it('leaves the stage to a cleaner who wants to scrub it, and is not a cleaner itself', () => {
    const network = networkOf(street(8));
    const venues = [stage('kids-club#0', 7)];
    const { router, upkeep } = crewOn(network, venues, ['animator', 'cleaner'], { dirt: [0.2] });
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 7));
    expect(router.step(1, nodeAt(network, 4)), 'the show kept the cleaner out').toBe(
      nodeAt(network, 5),
    );
    for (let tick = 1; tick <= 130; tick++) router.tick(tick);
    expect(cleanliness(upkeep, 0), 'the animator scrubbed').toBeCloseTo(0.2);
  });
});

describe('a lifeguard at the pool', () => {
  it('takes an unwatched pool and stays on post past any spell', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), pool('swimming-pool#0', 7)];
    const { router, crowd } = crewOn(network, venues, ['lifeguard']);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.step(0, nodeAt(network, 7))).toBe(-1);
    for (let tick = 1; tick <= 1000; tick++) router.tick(tick);
    expect(router.watching(1)).toBe(true);
    expect(router.watching(0)).toBe(false);
    expect(router.atWork(0)?.key).toBe('swimming-pool#0');
    expect(isWaiting(crowd, 0)).toBe(true);
  });

  it('leaves the second of two pools unwatched when there is one lifeguard', () => {
    const network = networkOf(street(8));
    const venues = [pool('swimming-pool#0', 1), pool('swimming-pool#1', 7)];
    const { router } = crewOn(network, venues, ['lifeguard'], { occupants: [0, 5] });
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 7));
    expect(unwatched(venues, (venue) => router.watching(venue), 0)).toEqual(
      new Set(['swimming-pool#0']),
    );
  });

  it('waits out a storm at the door and goes back in when it clears', () => {
    const network = networkOf(street(8));
    const venues = [pool('swimming-pool#0', 7)];
    let weather: Weather = 'clear';
    const { router, crowd } = crewOn(network, venues, ['lifeguard'], { weather: () => weather });
    router.step(0, nodeAt(network, 4));
    router.step(0, nodeAt(network, 7));
    const inside = crowd.z[0]!;
    weather = 'storm';
    router.tick(1);
    const door = network.nodes[nodeAt(network, 7)]!;
    expect(crowd.z[0]).toBeCloseTo(door.z);
    expect(isWaiting(crowd, 0)).toBe(true);
    expect(router.watching(0), 'gave up the post in the rain').toBe(true);
    weather = 'clear';
    router.tick(2);
    expect(crowd.z[0]).toBeCloseTo(inside);
  });
});

// Worker 0 in zone 0, and only the one tile painted.
const zoned = (tile: { tileX: number; tileZ: number }): StaffZones => ({
  zoneOf: Int8Array.from([0]),
  venueZones: new Int32Array(0),
  tileZone: (tileX, tileZ) => (tileX === tile.tileX && tileZ === tile.tileZ ? 0 : NO_ZONE),
});

const zonedAs = (zoneOf: readonly number[], venueZones: readonly number[]): StaffZones => ({
  zoneOf: Int8Array.from(zoneOf),
  venueZones: Int32Array.from(venueZones),
  tileZone: () => NO_ZONE,
});

const untilSeated = (router: StaffRouter, crowd: Crowd): boolean => {
  for (let step = 0; step < 6000; step++) {
    stepCrowd(crowd, MAX_STEP);
    if (router.watchingBeach) return true;
  }
  return false;
};

describe('a lifeguard on a tower', () => {
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
  const TOWER = { tileX: 13, tileZ: 13 } as const;
  const seat: SeatSpot = {
    x: (TOWER.tileX + 0.4) * TILE_VOXELS,
    z: (TOWER.tileZ + 0.6) * TILE_VOXELS,
    y: BEACH_SURFACE + 20,
    heading: 0,
    pose: 'sit',
    tileX: TOWER.tileX,
    tileZ: TOWER.tileZ,
    post: 'lifeguard',
  };
  // The tower stands on its own seat, as a placed one does, so the leg must end beside it.
  const beach = walkNetworkFor({
    paved,
    levelOf: FLAT,
    shore,
    tilesX: 20,
    seats: [seat],
    obstacles: [
      { x: TOWER.tileX * TILE_VOXELS, z: TOWER.tileZ * TILE_VOXELS, width: 16, depth: 16 },
    ],
  });

  it('walks over the sand to the tower and sits on its seat', () => {
    expect(beach.posts).toHaveLength(1);
    expect(blockedAt(beach.sand!, seat.x, seat.z), 'the seat is on open sand').toBe(true);
    const post = beach.posts[0]!;
    const { router, crowd } = crewOn(beach, [], ['lifeguard']);
    expect(untilSeated(router, crowd), 'never reached the tower').toBe(true);
    expect(crowd.seat[0]).toBe(post);
    expect(restingOn(crowd, 0)).toBe(RESTING.sitting);
    expect(crowd.x[0]).toBeCloseTo(seat.x);
    expect(crowd.z[0]).toBeCloseTo(seat.z);
    for (let tick = 1; tick <= 1000; tick++) router.tick(tick);
    expect(crowd.seat[0], 'climbed down again').toBe(post);
  });

  it('watches the beach once sat, and stays up through a storm', () => {
    const post = beach.posts[0]!;
    let weather: Weather = 'clear';
    const { router, crowd } = crewOn(beach, [], ['lifeguard'], { weather: () => weather });
    expect(router.watchingBeach, 'watching before anybody is up there').toBe(false);
    expect(untilSeated(router, crowd)).toBe(true);
    const water = [{ ...pool('beach', 0), key: 'beach' }, pool('swimming-pool#0', 7)];
    const watching = (venue: number): boolean => venue === 0 && router.watchingBeach;
    expect(unwatched(water, watching, 1)).toEqual(new Set(['swimming-pool#0']));
    weather = 'storm';
    for (let tick = 1; tick <= 10; tick++) router.tick(tick);
    expect(router.watchingBeach).toBe(true);
    expect(crowd.seat[0]).toBe(post);
  });

  it("leaves a tower outside a lifeguard's zone alone", () => {
    const at = nodeAt(beach, 10, 12);
    const elsewhere = crewOn(beach, [], ['lifeguard'], { zones: zoned({ tileX: 2, tileZ: 2 }) });
    expect(elsewhere.router.step(0, at)).toBe(-1);
    const under = crewOn(beach, [], ['lifeguard'], { zones: zoned(TOWER) });
    expect(
      under.router.step(0, at),
      'the sand under the tower did not zone it',
    ).toBeGreaterThanOrEqual(0);
  });

  it('prefers a pool inside the resort to the tower', () => {
    const venues = [{ ...pool('swimming-pool#0', 11), tileZ: 11, z: 11.5 * TILE_VOXELS }];
    const { router, crowd } = crewOn(beach, venues, ['lifeguard']);
    for (let step = 0; step < 6000 && !router.watching(0); step++) stepCrowd(crowd, MAX_STEP);
    expect(router.watching(0), 'never reached the pool').toBe(true);
    expect(router.watchingBeach).toBe(false);
  });
});

const brokenAt = (venues: number, since: readonly (number | null)[]): Breakdowns => {
  const breakdowns = createBreakdowns(venues);
  for (const [venue, tick] of since.entries()) {
    if (tick === null) continue;
    breakdowns.broken[venue] = 1;
    breakdowns.since[venue] = tick;
  }
  return breakdowns;
};

describe('breakdowns', () => {
  const repairCrewOn = (
    venues: readonly Venue[],
    roles: readonly StaffRole[],
    breakdowns: Breakdowns,
    dirt: readonly number[] = [],
  ): { router: StaffRouter; network: WalkNetwork; upkeep: Upkeep } => {
    const network = networkOf(street(8));
    const upkeep = createUpkeep(venues.length);
    for (const [venue, level] of dirt.entries()) upkeep.level[venue] = level;
    const staff = crew(roles);
    let crowd: Crowd | null = null;
    const router = createStaffRouter({
      staff,
      venues,
      network,
      upkeep: () => upkeep,
      breakdowns: () => breakdowns,
      crowd: () => crowd!,
      seed: 11,
    });
    crowd = createCrowd({
      network,
      count: staff.count,
      variants: STAFF_ROLES.length,
      variantOf: (worker) => staff.variant[worker] ?? 0,
      seed: 3,
      routeOf: (worker, at) => router.step(worker, at),
    });
    return { router, network, upkeep };
  };

  it('does not send a cleaner to scrub a venue that is broken, however dirty', () => {
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router, network } = repairCrewOn(venues, ['cleaner'], brokenAt(2, [5]), [0.1, 0.5]);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
  });

  it('walks a mechanic to the broken venue and mends it once the spell is done', () => {
    const breakdowns = brokenAt(2, [null, 5]);
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router, network } = repairCrewOn(venues, ['mechanic'], breakdowns);
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    expect(router.step(0, nodeAt(network, 7))).toBe(-1);
    expect(router.atWork(0)?.key).toBe('bar#0');
    for (let tick = 1; tick < REPAIR_TICKS.min; tick++) router.tick(tick);
    expect(isBroken(breakdowns, 1), 'mended before the spell was up').toBe(true);
    for (let tick = REPAIR_TICKS.min; tick <= REPAIR_TICKS.max; tick++) router.tick(tick);
    expect(isBroken(breakdowns, 1)).toBe(false);
    expect(router.workingCount).toBe(0);
    expect(router.step(0, nodeAt(network, 7)), 'nothing left to mend, so they stay put').toBe(-1);
  });

  it('mends what has been down longest first', () => {
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const { router, network } = repairCrewOn(venues, ['mechanic'], brokenAt(2, [50, 10]));
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
  });

  it('never sends two mechanics to the same venue', () => {
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const both = repairCrewOn(venues, ['mechanic', 'mechanic'], brokenAt(2, [10, 20]));
    expect(both.router.step(0, nodeAt(both.network, 4))).toBe(nodeAt(both.network, 3));
    expect(both.router.step(1, nodeAt(both.network, 4))).toBe(nodeAt(both.network, 5));
    const one = repairCrewOn(venues, ['mechanic', 'mechanic'], brokenAt(2, [10, null]));
    expect(one.router.step(0, nodeAt(one.network, 4))).toBe(nodeAt(one.network, 3));
    expect(one.router.step(1, nodeAt(one.network, 4))).toBe(-1);
  });
});

describe('a mechanic on the beach', () => {
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
  const beach = walkNetworkFor({
    paved,
    levelOf: FLAT,
    shore,
    tilesX: 20,
    obstacles: [{ x: 4 * TILE_VOXELS, z: 14 * TILE_VOXELS, width: 16, depth: 16 }],
  });
  const pedalos: Venue = {
    ...shop('pedalo-rental#0', 4),
    role: 'activity',
    tileZ: 14,
    z: 14.5 * TILE_VOXELS,
    reliability: 40,
  };

  it('walks over the sand to a broken building with no door on the paving, and mends it', () => {
    const breakdowns = createBreakdowns(1);
    breakdowns.broken[0] = 1;
    const staff = crew(['mechanic']);
    let crowd: Crowd | null = null;
    const router = createStaffRouter({
      staff,
      venues: [pedalos],
      network: beach,
      upkeep: () => createUpkeep(1),
      breakdowns: () => breakdowns,
      crowd: () => crowd!,
      seed: 11,
    });
    crowd = createCrowd({
      network: beach,
      count: 1,
      variants: STAFF_ROLES.length,
      variantOf: () => STAFF_ROLES.indexOf('mechanic'),
      seed: 3,
      routeOf: (worker, at) => router.step(worker, at),
      roamsBeach: false,
    });
    let tick = 0;
    let wentOnSand = false;
    for (let step = 0; step < 8000 && isBroken(breakdowns, 0); step++) {
      stepCrowd(crowd, MAX_STEP);
      if (crowd.z[0]! > 12 * TILE_VOXELS) wentOnSand = true;
      if (step % 4 === 0) router.tick(++tick);
    }
    expect(isBroken(breakdowns, 0), 'never mended').toBe(false);
    expect(wentOnSand, 'mended it from the paving').toBe(true);
    for (let step = 0; step < 4000; step++) stepCrowd(crowd, MAX_STEP);
    expect(crowd.z[0]!, 'left standing on the sand').toBeLessThan(12 * TILE_VOXELS);
  });
});

describe('zones', () => {
  it('keeps a zoned cleaner to the venue in its zone, past a dirtier one outside', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const zones = zonedAs([1], [0b01, 0b10]);
    const { router } = crewOn(network, venues, ['cleaner'], { dirt: [0.1, 0.3], zones });
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
  });

  it('lets an unzoned cleaner take the dirtiest venue anywhere, as before', () => {
    const network = networkOf(street(8));
    const venues = [shop('bakery#0', 1), shop('bar#0', 7)];
    const zones = zonedAs([NO_ZONE], [0b01, 0b10]);
    const { router } = crewOn(network, venues, ['cleaner'], { dirt: [0.1, 0.3], zones });
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('keeps a zoned lifeguard to a pool in its zone, and waits when there is none', () => {
    const network = networkOf(street(8));
    const venues = [pool('swimming-pool#0', 1), pool('swimming-pool#1', 7)];
    const inside = crewOn(network, venues, ['lifeguard'], {
      occupants: [9, 0],
      zones: zonedAs([2], [0b001, 0b100]),
    });
    expect(inside.router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 5));
    const none = crewOn(network, venues, ['lifeguard'], {
      occupants: [9, 0],
      zones: zonedAs([3], [0b001, 0b100]),
    });
    expect(none.router.step(0, nodeAt(network, 4))).toBe(-1);
  });

  it('keeps a zoned animator to the stages in its zone', () => {
    const network = networkOf(street(8));
    const venues = [stage('kids-club#0', 1), stage('game-hall#0', 7)];
    const zones = zonedAs([0], [0b1, 0]);
    const { router } = crewOn(network, venues, ['animator'], { occupants: [2, 9], zones });
    expect(router.step(0, nodeAt(network, 4))).toBe(nodeAt(network, 3));
  });

  it('keeps a zoned cleaner to the littered tiles in its zone', () => {
    const network = networkOf(street(8));
    const litter = littered([
      [1, 1],
      [6, 0.75],
    ]);
    const zones: StaffZones = {
      ...zonedAs([0], []),
      tileZone: (tileX) => (tileX >= 5 ? 0 : NO_ZONE),
    };
    const { router } = crewOn(network, [], ['cleaner'], { litter, zones });
    expect(router.step(0, nodeAt(network, 3))).toBe(nodeAt(network, 4));
  });
});
