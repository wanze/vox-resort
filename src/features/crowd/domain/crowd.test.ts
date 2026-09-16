import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import {
  createCrowd,
  holdAt,
  holdOnSeat,
  isRoaming,
  isSeated,
  isWaiting,
  MAX_STEP,
  MAX_SUBSTEPS,
  ON_SAND,
  releaseTo,
  reseatCrowd,
  RESTING,
  restingOn,
  rouseSunbathers,
  seatIsFree,
  stepCrowd,
  stepOntoSand,
  WALK_SPEED,
  walkSandTo,
  type Crowd,
} from './crowd';
import {
  BEACH_SURFACE,
  walkingSurface,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
} from './walkNetwork';
import type { SeatSpot } from './seating';
import { LANE, MAX_SIDE } from './avoidance';

const FLAT: LevelProvider = () => 0;

/** Two terraces with a step between them, so z = 2 is a flight of stairs. */
const STEP_AT_Z2: LevelProvider = (_x, z) => (z <= 1 ? 1 : 0);

/** A paved street `length` tiles long, running east. */
const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[], levelOf: LevelProvider = FLAT): WalkNetwork =>
  walkNetworkFor({ paved, levelOf, shore: null, tilesX: 20 });

/** Runs the crowd for `seconds`, a frame at a time. */
const run = (crowd: Crowd, seconds: number, frame = 1 / 60): void => {
  for (let elapsed = 0; elapsed < seconds; elapsed += frame) stepCrowd(crowd, frame);
};

describe('createCrowd', () => {
  it('puts everybody on the network, spread along it rather than stacked', () => {
    const crowd = createCrowd({ network: networkOf(street(10)), count: 40, variants: 4, seed: 1 });
    expect(crowd.count).toBe(40);
    for (let i = 0; i < crowd.count; i++) {
      expect(crowd.x[i]!, 'off the west end').toBeGreaterThanOrEqual(0);
      expect(crowd.x[i]!, 'off the east end').toBeLessThanOrEqual(10 * TILE_VOXELS);
      expect(crowd.y[i]).toBe(walkingSurface(0));
    }
    // Nobody is standing on a tile centre with everybody else.
    expect(new Set(Array.from(crowd.x.slice(0, crowd.count))).size).toBeGreaterThan(20);
  });

  it('draws on every person model it is offered', () => {
    const crowd = createCrowd({ network: networkOf(street(20)), count: 200, variants: 4, seed: 2 });
    expect(new Set(Array.from(crowd.variant)).size).toBe(4);
    for (const variant of crowd.variant) {
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(4);
    }
  });

  it('takes its variants from outside when told, without moving anybody', () => {
    const options = { network: networkOf(street(12)), count: 12, variants: 4, seed: 7 };
    const drawn = createCrowd(options);
    const chosen = createCrowd({ ...options, variantOf: () => 2 });
    expect(Array.from(chosen.variant)).toEqual(Array(12).fill(2));
    // The default draw is pinned, so a change to the draw order is caught here.
    expect(Array.from(drawn.variant)).toEqual([0, 1, 0, 1, 3, 2, 2, 3, 0, 1, 1, 0]);
    // The draw is made either way, so choosing the variants changes nothing else.
    expect(Array.from(chosen.x)).toEqual(Array.from(drawn.x));
    expect(Array.from(chosen.phase)).toEqual(Array.from(drawn.phase));
  });

  it('gives everybody their own pace and their own place in the walk cycle', () => {
    const crowd = createCrowd({ network: networkOf(street(20)), count: 60, variants: 2, seed: 3 });
    const speeds = Array.from(crowd.speed);
    expect(new Set(speeds).size).toBeGreaterThan(50);
    expect(Math.min(...speeds)).toBeGreaterThan(WALK_SPEED * 0.7);
    expect(Math.max(...speeds)).toBeLessThan(WALK_SPEED * 1.3);
    expect(new Set(Array.from(crowd.phase)).size).toBeGreaterThan(50);
  });

  it('leaves a plot with no paving on it empty rather than throwing', () => {
    const crowd = createCrowd({ network: networkOf([]), count: 100, variants: 4, seed: 4 });
    expect(crowd.count).toBe(0);
    expect(() => stepCrowd(crowd, 1 / 60)).not.toThrow();
  });

  it('replays the same crowd for the same seed, and a different one otherwise', () => {
    const walked = (seed: number): number[] => {
      const crowd = createCrowd({ network: networkOf(street(12)), count: 30, variants: 4, seed });
      run(crowd, 20);
      return [...crowd.x, ...crowd.z];
    };
    expect(walked(7)).toEqual(walked(7));
    expect(walked(7)).not.toEqual(walked(8));
  });
});

describe('stepCrowd', () => {
  it('walks people at the pace they were given', () => {
    // One long street, so nobody turns and the distance covered is the distance
    // walked rather than the distance between two turns.
    const crowd = createCrowd({ network: networkOf(street(60)), count: 1, variants: 1, seed: 5 });
    const startX = crowd.x[0]!;
    const seconds = 3;
    run(crowd, seconds);
    const covered = Math.abs(crowd.x[0]! - startX);
    expect(covered).toBeGreaterThan(crowd.speed[0]! * seconds * 0.8);
    expect(covered).toBeLessThan(crowd.speed[0]! * seconds * 1.05);
  });

  it('keeps everybody on the paving, however long they walk', () => {
    const crowd = createCrowd({ network: networkOf(street(30)), count: 50, variants: 4, seed: 6 });
    run(crowd, 120);
    for (let i = 0; i < crowd.count; i++) {
      expect(crowd.x[i]!).toBeGreaterThanOrEqual(-MAX_SIDE);
      expect(crowd.x[i]!).toBeLessThanOrEqual(30 * TILE_VOXELS + MAX_SIDE);
      // Aside of the middle of the path to get past people, never off it.
      expect(Math.abs(crowd.z[i]! - 0.5 * TILE_VOXELS)).toBeLessThanOrEqual(MAX_SIDE + 0.01);
      expect(Number.isFinite(crowd.x[i]!)).toBe(true);
    }
  });

  it('turns people to face the way they are walking', () => {
    const crowd = createCrowd({ network: networkOf(street(40)), count: 20, variants: 1, seed: 7 });
    stepCrowd(crowd, 1 / 60);
    for (let i = 0; i < crowd.count; i++) {
      // The models face +z, so a walk along x is a quarter turn either way.
      expect(Math.abs(crowd.heading[i]!)).toBeCloseTo(Math.PI / 2);
    }
  });

  it('clamps a frame that was away for a minute', () => {
    const one = createCrowd({ network: networkOf(street(60)), count: 5, variants: 1, seed: 8 });
    const other = createCrowd({ network: networkOf(street(60)), count: 5, variants: 1, seed: 8 });
    stepCrowd(one, 60);
    stepCrowd(other, MAX_STEP * MAX_SUBSTEPS);
    expect(Array.from(one.x)).toEqual(Array.from(other.x));
  });

  it('does nothing at all on a frame of no time', () => {
    const crowd = createCrowd({ network: networkOf(street(20)), count: 10, variants: 1, seed: 9 });
    const before = [...crowd.x];
    stepCrowd(crowd, 0);
    expect([...crowd.x]).toEqual(before);
  });

  it('prefers walking on to turning straight back round', () => {
    // On a straight street the only choice at each tile is carry on or reverse,
    // so net displacement against distance walked is exactly the measurement:
    // somebody who reversed at random would end up near where they started.
    const crowd = createCrowd({ network: networkOf(street(60)), count: 1, variants: 1, seed: 10 });
    const startX = crowd.x[0]!;
    const seconds = 30;
    run(crowd, seconds);
    const walked = crowd.speed[0]! * seconds;
    expect(Math.abs(crowd.x[0]! - startX)).toBeGreaterThan(walked * 0.85);
  });

  it('turns round at a dead end rather than walking off it', () => {
    const crowd = createCrowd({ network: networkOf(street(3)), count: 4, variants: 1, seed: 11 });
    run(crowd, 60);
    for (let i = 0; i < crowd.count; i++) {
      expect(crowd.x[i]!).toBeGreaterThanOrEqual(0);
      expect(crowd.x[i]!).toBeLessThanOrEqual(3 * TILE_VOXELS);
    }
  });

  it('allocates nothing per frame', () => {
    // Not measurable directly, so this asserts the shape that makes it true: the
    // arrays are the same objects after a long run as before it.
    const crowd = createCrowd({
      network: networkOf(street(20)),
      count: 100,
      variants: 4,
      seed: 12,
    });
    const arrays = [crowd.x, crowd.y, crowd.z, crowd.heading, crowd.t, crowd.node];
    run(crowd, 60);
    expect([crowd.x, crowd.y, crowd.z, crowd.heading, crowd.t, crowd.node]).toEqual(arrays);
  });
});

/** The node standing on a tile of a street fixture. */
const nodeAt = (network: WalkNetwork, tileX: number): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === 0);

/**
 * A step many times `MAX_STEP` long, which is how the crowd keeps up with a
 * calendar running faster than real time. See `sim/domain/crowdRate.ts`.
 */
describe('a step longer than MAX_STEP', () => {
  /** Two crowds off the same seed on a street with a junction and a spur. */
  const twins = (): [Crowd, Crowd] => {
    const paved = [...street(30), { tileX: 10, tileZ: 1, y: 0 }, { tileX: 10, tileZ: 2, y: 0 }];
    const options = { network: networkOf(paved), count: 40, variants: 4, seed: 31 };
    return [createCrowd(options), createCrowd(options)];
  };

  it('ends up where the same number of steps of MAX_STEP would, to the voxel', () => {
    const [once, often] = twins();
    const start = Array.from(once.x);
    const n = 16;
    for (let frame = 0; frame < 20; frame++) {
      stepCrowd(once, n * MAX_STEP);
      for (let step = 0; step < n; step++) stepCrowd(often, MAX_STEP);
    }
    let furthest = 0;
    for (let i = 0; i < once.count; i++) {
      furthest = Math.max(
        furthest,
        Math.hypot(once.x[i]! - often.x[i]!, once.y[i]! - often.y[i]!, once.z[i]! - often.z[i]!),
      );
    }
    expect(furthest).toBeLessThan(1);
    // The same choices at every node on the way, not merely the same distance.
    expect(Array.from(once.node)).toEqual(Array.from(often.node));
    // And people actually went somewhere, or a crowd that never moved would pass.
    expect(start.filter((x, i) => Math.abs(x - once.x[i]!) > TILE_VOXELS).length).toBeGreaterThan(
      once.count / 2,
    );
  });

  it('clamps a step past the ceiling rather than running it', () => {
    const [clamped, ceiling] = twins();
    stepCrowd(clamped, MAX_STEP * MAX_SUBSTEPS * 50);
    stepCrowd(ceiling, MAX_STEP * MAX_SUBSTEPS);
    expect(Array.from(clamped.x)).toEqual(Array.from(ceiling.x));
    expect(Array.from(clamped.z)).toEqual(Array.from(ceiling.z));
  });

  it('refuses a NaN step as it refuses a step of no time', () => {
    const [crowd] = twins();
    const before = [...crowd.x];
    stepCrowd(crowd, Number.NaN);
    expect([...crowd.x]).toEqual(before);
  });

  it('leaves a held person on their spot however many steps it runs', () => {
    const [crowd] = twins();
    holdAt(crowd, 0, 4.5 * TILE_VOXELS, walkingSurface(0), 2, 0.5);
    for (let frame = 0; frame < 30; frame++) stepCrowd(crowd, MAX_STEP * MAX_SUBSTEPS);
    expect(crowd.x[0]).toBeCloseTo(4.5 * TILE_VOXELS);
    expect(crowd.z[0]).toBeCloseTo(2);
    expect(isWaiting(crowd, 0)).toBe(true);
  });

  it('still gets two people walking at each other past each other at the ceiling', () => {
    /** Two people at either end of a long street, sent towards each other. */
    const headOn = (): Crowd => {
      const network = networkOf(street(40));
      const crowd = createCrowd({ network, count: 2, variants: 1, seed: 32 });
      const ends = [nodeAt(network, 0), nodeAt(network, 39)] as const;
      for (const [person, end] of ends.entries()) {
        const node = network.nodes[end]!;
        holdAt(crowd, person, node.x, node.y, node.z, 0);
        releaseTo(crowd, person, ends[1 - person]!);
      }
      return crowd;
    };
    // A call at the ceiling cannot be watched inside, so its twin is stepped a
    // `MAX_STEP` at a time and watched instead, and the two are held to agree at
    // the end of every call: what the twin shows is what the call did.
    const atCeiling = headOn();
    const watched = headOn();
    let closest = Infinity;
    for (let frame = 0; frame < 30; frame++) {
      stepCrowd(atCeiling, MAX_STEP * MAX_SUBSTEPS);
      for (let step = 0; step < MAX_SUBSTEPS; step++) {
        stepCrowd(watched, MAX_STEP);
        closest = Math.min(
          closest,
          Math.hypot(watched.x[0]! - watched.x[1]!, watched.z[0]! - watched.z[1]!),
        );
      }
      expect(Math.abs(atCeiling.x[0]! - watched.x[0]!)).toBeLessThan(1);
      expect(Math.abs(atCeiling.z[1]! - watched.z[1]!)).toBeLessThan(1);
    }
    // Without avoidance they would meet dead centre, at zero apart.
    expect(closest).toBeGreaterThan(3);
    // And both got by, which a pair who stopped nose to nose would not have.
    expect(atCeiling.x[0]!).toBeGreaterThan(atCeiling.x[1]!);
  });
});

describe('being told where to go', () => {
  it('walks exactly as it always did when nothing is routing it', () => {
    // The same fixture and seed as "prefers walking on to turning straight back
    // round", pinned to the voxel: a crowd handed no router is the crowd there
    // was before there were routers at all, and this is the number that says so.
    const crowd = createCrowd({
      network: networkOf(street(60)),
      count: 1,
      variants: 1,
      seed: 10,
    });
    run(crowd, 30);
    expect(crowd.x[0]).toBeCloseTo(239.3424, 3);
  });

  it('sends everybody the way the router says, wherever they came from', () => {
    // West, always: on a street somebody walking east has to turn round for it,
    // which is what wandering would never do.
    const network = networkOf(street(20));
    const crowd = createCrowd({
      network,
      count: 30,
      variants: 1,
      seed: 13,
      routeOf: (_person, at) => {
        const tileX = network.nodes[at]!.tileX;
        return tileX === 0 ? -1 : nodeAt(network, tileX - 1);
      },
    });
    run(crowd, 120);
    for (let i = 0; i < crowd.count; i++) {
      expect(crowd.x[i]!, `person ${i}`).toBeLessThan(3 * TILE_VOXELS);
    }
  });

  it('wanders as usual for anybody the router has nothing to say about', () => {
    const network = networkOf(street(60));
    const routed = createCrowd({
      network,
      count: 1,
      variants: 1,
      seed: 10,
      routeOf: () => -1,
    });
    const wandering = createCrowd({
      network: networkOf(street(60)),
      count: 1,
      variants: 1,
      seed: 10,
    });
    run(routed, 30);
    run(wandering, 30);
    expect(routed.x[0]).toBe(wandering.x[0]);
  });

  it('does not pin somebody to the node they are standing on', () => {
    // A router naming the arrival itself would be a zero-length segment taken
    // over and over. They fall back to wandering instead.
    const network = networkOf(street(20));
    const crowd = createCrowd({
      network,
      count: 4,
      variants: 1,
      seed: 14,
      routeOf: (_person, at) => at,
    });
    const startX = [...crowd.x];
    run(crowd, 60);
    for (let i = 0; i < crowd.count; i++) {
      expect(Math.abs(crowd.x[i]! - startX[i]!), `person ${i}`).toBeGreaterThan(TILE_VOXELS);
    }
  });

  it('keeps its router across a rebuild of the graph', () => {
    const network = networkOf(street(20));
    let asked = 0;
    const crowd = createCrowd({
      network,
      count: 10,
      variants: 1,
      seed: 15,
      routeOf: () => {
        asked++;
        return -1;
      },
    });
    run(crowd, 10);
    const before = asked;
    expect(before).toBeGreaterThan(0);
    const reseated = reseatCrowd(crowd, networkOf(street(24)));
    asked = 0;
    run(reseated, 10);
    expect(asked).toBeGreaterThan(0);
  });
});

describe('walking a flight of stairs', () => {
  // A street running north over a single step: z = 0 and 1 are the upper
  // terrace, z = 2 and 3 the lower, so (0, 2) is the flight.
  const levelOf = STEP_AT_Z2;
  const paved: PavedTile[] = [
    { tileX: 0, tileZ: 0, y: LEVEL_VOXELS },
    { tileX: 0, tileZ: 1, y: LEVEL_VOXELS },
    { tileX: 0, tileZ: 2, y: 0 },
    { tileX: 0, tileZ: 3, y: 0 },
  ];

  it('carries people up and down it without anybody knowing it is there', () => {
    const crowd = createCrowd({
      network: networkOf(paved, levelOf),
      count: 8,
      variants: 1,
      seed: 13,
    });
    const heights = new Set<number>();
    for (let frame = 0; frame < 3000; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) heights.add(Math.round(crowd.y[i]!));
    }
    // Both terraces are reached, and so is the ground in between: a lerp across
    // the flight, not a jump between two levels.
    expect(heights.has(walkingSurface(0))).toBe(true);
    expect(heights.has(walkingSurface(LEVEL_VOXELS))).toBe(true);
    expect(heights.size).toBeGreaterThan(4);
  });

  it('never puts anyone below the paving or above the top terrace', () => {
    const crowd = createCrowd({
      network: networkOf(paved, levelOf),
      count: 8,
      variants: 1,
      seed: 14,
    });
    for (let frame = 0; frame < 2000; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) {
        expect(crowd.y[i]!).toBeGreaterThanOrEqual(walkingSurface(0));
        expect(crowd.y[i]!).toBeLessThanOrEqual(walkingSurface(LEVEL_VOXELS));
      }
    }
  });
});

describe('roaming the beach', () => {
  // Water from z = 18; six rows of sand in front of it, so z = 12..17 is beach.
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  // A boardwalk down the middle of the plot and out onto the sand.
  const paved: PavedTile[] = Array.from({ length: 8 }, (_, index) => ({
    tileX: 10,
    tileZ: 10 + index,
    y: 0,
  }));
  const network = walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20 });

  it('has gates to leave by', () => {
    expect(network.gates.length).toBeGreaterThan(0);
  });

  it('lets people off the paving and onto the open sand', () => {
    const crowd = createCrowd({ network, count: 30, variants: 4, seed: 15 });
    let roaming = 0;
    for (let frame = 0; frame < 6000; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) if (crowd.node[i] === -1) roaming++;
    }
    expect(roaming, 'nobody ever left the boardwalk').toBeGreaterThan(0);
  });

  it('lets a router send somebody arriving at a gate out onto the sand, and keeps them there', () => {
    const sent: number[] = [];
    let crowd: Crowd | null = null;
    crowd = createCrowd({
      network,
      count: 20,
      variants: 1,
      seed: 40,
      routeOf: (person, at) => {
        if (!network.nodes[at]!.gate) return -1;
        stepOntoSand(crowd!, person, at);
        if (crowd!.node[person] === -1) sent.push(person);
        return -1;
      },
    });
    let aimedBack: string | null = null;
    for (let frame = 0; frame < 60 * 60 && sent.length < 3; frame++) {
      const before = sent.length;
      stepCrowd(crowd, 1 / 60);
      // Sent out during this very step: the crowd must not have aimed them at a
      // node on the way out of asking.
      for (const person of sent.slice(before)) {
        if (crowd.node[person] !== -1) aimedBack ??= `person ${person}`;
      }
    }
    expect(sent.length, 'nobody reached a gate').toBeGreaterThan(0);
    expect(aimedBack).toBeNull();
  });

  it('sends nobody onto the sand from a node that is not a gate', () => {
    const crowd = createCrowd({ network, count: 4, variants: 1, seed: 41 });
    const inland = network.nodes.findIndex((node) => !node.gate);
    const walking = [...Array(crowd.count).keys()].find((i) => crowd.node[i]! >= 0)!;
    stepOntoSand(crowd, walking, inland);
    expect(crowd.node[walking]).toBeGreaterThanOrEqual(0);
  });

  it('roams exactly as before for a crowd told nobody has anywhere to be', () => {
    const told = createCrowd({
      network,
      count: 30,
      variants: 4,
      seed: 15,
      offTheSand: () => false,
    });
    const untold = createCrowd({ network, count: 30, variants: 4, seed: 15 });
    run(told, 60);
    run(untold, 60);
    expect(Array.from(told.x)).toEqual(Array.from(untold.x));
    expect(Array.from(told.z)).toEqual(Array.from(untold.z));
  });

  it('roams exactly as before for a crowd told in so many words that it roams', () => {
    const told = createCrowd({ network, count: 30, variants: 4, seed: 15, roamsBeach: true });
    const untold = createCrowd({ network, count: 30, variants: 4, seed: 15 });
    run(told, 60);
    run(untold, 60);
    expect(Array.from(told.x)).toEqual(Array.from(untold.x));
    expect(Array.from(told.z)).toEqual(Array.from(untold.z));
  });

  it('puts nobody on the sand, and lets nobody stroll onto it, in a crowd that does not roam', () => {
    const crowd = createCrowd({ network, count: 30, variants: 4, seed: 15, roamsBeach: false });
    const roamers = (): number =>
      Array.from({ length: crowd.count }, (_, i) => isRoaming(crowd, i)).filter(Boolean).length;
    expect(roamers()).toBe(0);
    let ever = 0;
    for (let frame = 0; frame < 6000; frame++) {
      stepCrowd(crowd, 1 / 60);
      ever = Math.max(ever, roamers());
    }
    expect(ever, 'somebody wandered off the boardwalk').toBe(0);
  });

  it('walks a stray back to the paving in a crowd that does not roam', () => {
    const crowd = createCrowd({
      network,
      count: 6,
      variants: 1,
      seed: 42,
      roamsBeach: false,
      // A router that has forgotten everybody, as one rebuilt mid-errand has.
      routeOf: () => -1,
    });
    const gate = network.nodes[network.gates[0]!]!;
    holdAt(crowd, 0, gate.x, gate.y, gate.z, 0);
    walkSandTo(crowd, 0, 6.5 * TILE_VOXELS, 14.5 * TILE_VOXELS);
    let strayed = false;
    let back = false;
    for (let step = 0; step < 600 && !back; step++) {
      stepCrowd(crowd, MAX_STEP);
      strayed ||= isRoaming(crowd, 0);
      back = strayed && crowd.node[0]! >= 0;
    }
    expect(strayed, 'the forgotten errand never became a stray').toBe(true);
    expect(back, 'a minute and still out on the sand').toBe(true);
  });

  it('brings everybody with somewhere to be off the sand, and lets nobody back on', () => {
    const crowd = createCrowd({
      network,
      count: 30,
      variants: 4,
      seed: 15,
      offTheSand: () => true,
    });
    const roaming = (i: number): boolean => crowd.node[i] === -1;
    const startedOnSand = Array.from({ length: crowd.count }, (_, i) => roaming(i));
    expect(startedOnSand.some(Boolean), 'nobody to bring in').toBe(true);
    const cameOff = startedOnSand.map((on) => !on);
    let wentBack: string | null = null;
    for (let step = 0; step < 3000; step++) {
      stepCrowd(crowd, MAX_STEP);
      for (let i = 0; i < crowd.count; i++) {
        if (!roaming(i)) cameOff[i] = true;
        else if (cameOff[i]) wentBack ??= `person ${i} at step ${step}`;
      }
    }
    expect(wentBack).toBeNull();
    const stillOut = cameOff.filter((off) => !off).length;
    expect(stillOut, 'five minutes and still out on the beach').toBe(0);
  });

  it('keeps a roamer on the sand and out of the sea', () => {
    const crowd = createCrowd({ network, count: 30, variants: 4, seed: 16 });
    for (let frame = 0; frame < 6000; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) {
        const tileX = Math.floor(crowd.x[i]! / TILE_VOXELS);
        const tileZ = Math.floor(crowd.z[i]! / TILE_VOXELS);
        expect(terrainAt(shore, tileX, tileZ), `${tileX},${tileZ} at frame ${frame}`).not.toBe(
          'water',
        );
      }
    }
  });

  it('walks round what stands on the sand rather than through it', () => {
    // Two rows of parasol-sized boxes across the beach either side of the
    // boardwalk, a tile apart: plenty of sand, and plenty in the way.
    const boxes = Array.from({ length: 16 }, (_, index) => ({
      x: (index < 8 ? 2 + index : 12 + index - 8) * TILE_VOXELS + 4,
      z: (index % 2 === 0 ? 13 : 15) * TILE_VOXELS + 4,
      width: 8,
      depth: 8,
    }));
    const furnished = walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20, obstacles: boxes });
    const crowd = createCrowd({ network: furnished, count: 40, variants: 2, seed: 18 });
    const startX = Float32Array.from(crowd.x);
    let travelled = 0;
    // Collected and asserted once: a check per person per box per sample is a
    // lot of expects for a test whose answer is one list.
    const intruders: string[] = [];
    for (let frame = 0; frame < 60 * 180; frame++) {
      stepCrowd(crowd, 1 / 60);
      if (frame % 10 !== 0) continue;
      for (let i = 0; i < crowd.count; i++) {
        if (crowd.node[i] !== -1) continue;
        for (const box of boxes) {
          const inside =
            crowd.x[i]! > box.x &&
            crowd.x[i]! < box.x + box.width &&
            crowd.z[i]! > box.z &&
            crowd.z[i]! < box.z + box.depth;
          if (inside) intruders.push(`person ${i} at frame ${frame}`);
        }
      }
    }
    expect(intruders).toEqual([]);
    for (let i = 0; i < crowd.count; i++) travelled += Math.abs(crowd.x[i]! - startX[i]!);
    // And the beach is still walked, rather than everybody stood still boxed in.
    expect(travelled / crowd.count).toBeGreaterThan(TILE_VOXELS);
  });

  it('brings people back onto the paving again', () => {
    // Watched over the run rather than sampled at the end of it: what has to be
    // true is that the sand is somewhere people leave, not that anybody in
    // particular is off it at one moment.
    const crowd = createCrowd({ network, count: 30, variants: 4, seed: 17 });
    const wasRoaming = new Uint8Array(crowd.count);
    let returned = 0;
    for (let frame = 0; frame < 12000; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) {
        const roaming = crowd.node[i] === -1;
        if (wasRoaming[i] && !roaming) returned++;
        wasRoaming[i] = roaming ? 1 : 0;
      }
    }
    expect(returned, 'everybody stayed on the beach for ever').toBeGreaterThan(0);
  });
});

/**
 * Comfortably longer than the longest sit, so a test that waits this out is
 * waiting for somebody to get up rather than racing them.
 */
const SIT_LIMIT = 400;

/** Who is sitting on each seat, as the crowd's own claims report it. */
const sitters = (crowd: Crowd): number[] => Array.from(crowd.seatBy);

/** The first person actually sitting down, or -1 while they are all walking. */
const anyoneSeated = (crowd: Crowd): number => {
  for (let i = 0; i < crowd.count; i++) if (isSeated(crowd, i)) return i;
  return -1;
};

describe('the people who sit down', () => {
  /** A street with one three-seat bench beside its middle tile. */
  const benched = (length: number, seats = 3): WalkNetwork =>
    walkNetworkFor({
      paved: street(length),
      levelOf: FLAT,
      shore: null,
      tilesX: 20,
      seats: Array.from({ length: seats }, (_, index) => ({
        x: (Math.floor(length / 2) + 0.25 + index * 0.1) * TILE_VOXELS,
        z: TILE_VOXELS * 1.5,
        y: walkingSurface(0) + 2,
        heading: Math.PI,
        pose: 'sit' as const,
        tileX: Math.floor(length / 2),
        tileZ: 1,
      })),
    });

  it('fills a bench beside a busy path', () => {
    const crowd = createCrowd({ network: benched(9), count: 30, variants: 2, seed: 11 });
    expect(sitters(crowd)).toEqual([-1, -1, -1]);
    run(crowd, 120);
    expect(sitters(crowd).filter((person) => person >= 0).length).toBeGreaterThan(0);
  });

  /** Runs until somebody is sitting down, and hands them back. */
  const untilSeated = (crowd: Crowd, seconds = 600): number => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) {
      stepCrowd(crowd, 1 / 30);
      const seated = anyoneSeated(crowd);
      if (seated >= 0) return seated;
    }
    throw new Error('nobody sat down');
  };

  it('seats a person on the seat, facing the way the seat faces', () => {
    const crowd = createCrowd({ network: benched(9), count: 30, variants: 2, seed: 12 });
    const person = untilSeated(crowd);
    const spot = crowd.network.seats[crowd.seat[person]!]!;
    expect(crowd.x[person]).toBeCloseTo(spot.x);
    expect(crowd.y[person]).toBeCloseTo(spot.y);
    expect(crowd.z[person]).toBeCloseTo(spot.z);
    // The seat's own heading, not the one the last step they took would give
    // them: a person on a bench faces out over its front however they arrived.
    expect(crowd.heading[person]).toBeCloseTo(spot.heading);
  });

  it('never seats two people on one seat', () => {
    const crowd = createCrowd({ network: benched(9), count: 60, variants: 2, seed: 13 });
    for (let elapsed = 0; elapsed < 600; elapsed += 1 / 30) {
      stepCrowd(crowd, 1 / 30);
      const held = Array.from(crowd.seat).filter((seat) => seat >= 0);
      expect(new Set(held).size, 'two people on one seat').toBe(held.length);
      // And the two halves of the claim agree: the seat a person holds is the
      // seat that says it is held by them.
      for (let i = 0; i < crowd.count; i++) {
        if (crowd.seat[i]! >= 0) expect(crowd.seatBy[crowd.seat[i]!]).toBe(i);
      }
    }
  });

  it('gets people up again, and back onto the paving', () => {
    const crowd = createCrowd({ network: benched(9), count: 30, variants: 2, seed: 14 });
    const first = untilSeated(crowd);
    // Long enough that the longest sit is over several times: whoever was found
    // sitting is up and walking again at some point, which is the only thing
    // asserted here — watched rather than sampled at the end, because somebody
    // who got up is free to sit down again before the run is over.
    let walkedOn = false;
    for (let elapsed = 0; elapsed < SIT_LIMIT && !walkedOn; elapsed += 1 / 30) {
      stepCrowd(crowd, 1 / 30);
      walkedOn = crowd.seat[first] === -1 && !isSeated(crowd, first);
    }
    expect(walkedOn, 'the first sitter never got up').toBe(true);
    expect(crowd.rate[first]!).toBeGreaterThan(1 / SIT_LIMIT);
  });

  it('holds a seat while walking to it, so nobody sets off for a taken one', () => {
    const crowd = createCrowd({ network: benched(9, 1), count: 40, variants: 2, seed: 15 });
    run(crowd, 400);
    const claims = Array.from(crowd.seat).filter((seat) => seat === 0).length;
    expect(claims).toBeLessThanOrEqual(1);
  });

  it('leaves a seated person exactly where they sat', () => {
    const crowd = createCrowd({ network: benched(9), count: 40, variants: 2, seed: 16 });
    const person = untilSeated(crowd);
    const where = [crowd.x[person]!, crowd.y[person]!, crowd.z[person]!];
    // Five seconds against a sit of at least thirty, so they are certainly
    // still on it: the point is that a lerp between a point and itself is that
    // point, however many frames it is run for.
    run(crowd, 5);
    expect(isSeated(crowd, person)).toBe(true);
    expect([crowd.x[person]!, crowd.y[person]!, crowd.z[person]!]).toEqual(where);
  });

  it('walks a plot with nothing to sit on exactly as it did before', () => {
    const bare = createCrowd({ network: networkOf(street(9)), count: 20, variants: 2, seed: 17 });
    run(bare, 120);
    expect(bare.seatBy).toHaveLength(0);
    for (const seat of bare.seat) expect(seat).toBe(-1);
  });
});

/**
 * A row of loungers on the sand, two columns clear of the boardwalk in the
 * fixture below, so not one of them is within reach of a paved tile: every seat
 * here is a beach seat, which is the point of it. A lounger laid against the
 * boardwalk hangs off its node instead — that is `walkNetwork.test.ts`'s case.
 */
const loungers = (count: number): SeatSpot[] =>
  Array.from({ length: count }, (_, index) => ({
    x: (12 + index) * TILE_VOXELS + 8,
    z: 14 * TILE_VOXELS + 8,
    y: BEACH_SURFACE + 5,
    heading: 0,
    pose: 'lie' as const,
    tileX: 12 + index,
    tileZ: 14,
  }));

describe('the people who lie down', () => {
  // Water from z = 18, six rows of sand in front of it, a boardwalk down to it
  // and a row of loungers on the sand beside the boardwalk's foot.
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
  const sandy = (count = 6): WalkNetwork =>
    walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20, seats: loungers(count) });

  it('takes loungers nobody could have reached from the paving', () => {
    const network = sandy();
    expect(network.beachSeats).toHaveLength(6);
    const crowd = createCrowd({ network, count: 40, variants: 2, seed: 21 });
    let lying = 0;
    for (let frame = 0; frame < 60 * 600; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) if (restingOn(crowd, i) === RESTING.lying) lying++;
    }
    expect(lying, 'nobody ever lay on a lounger').toBeGreaterThan(0);
  });

  it('reports lying rather than sitting, off the seat rather than the person', () => {
    const crowd = createCrowd({ network: sandy(), count: 40, variants: 2, seed: 22 });
    // Sampled once a second rather than every frame: what is being checked is a
    // state, not a transition, and 36 000 frames of it is 1.4 million
    // assertions for the same answer.
    const seen = new Set<number>();
    for (let frame = 0; frame < 60 * 600; frame++) {
      stepCrowd(crowd, 1 / 60);
      if (frame % 60 !== 0) continue;
      for (let i = 0; i < crowd.count; i++) {
        // Every seat on this plot is a lounger, so everybody resting is lying.
        const pose = restingOn(crowd, i);
        expect(pose).toBe(isSeated(crowd, i) ? RESTING.lying : RESTING.none);
        seen.add(pose);
      }
    }
    expect(seen, 'nobody was ever seen lying down').toContain(RESTING.lying);
  });

  it('sends a sunbather back out onto the sand rather than to a node', () => {
    const crowd = createCrowd({ network: sandy(1), count: 40, variants: 2, seed: 23 });
    let rose = 0;
    let onSand = 0;
    for (let frame = 0; frame < 60 * 900; frame++) {
      const before = crowd.seatBy[0]!;
      stepCrowd(crowd, 1 / 60);
      // The frame the one lounger is given up: whoever was on it is roaming,
      // not walking to a node, and is out on the beach rather than on paving.
      if (before >= 0 && crowd.seatBy[0] === -1) {
        rose++;
        if (crowd.node[before] === -1) onSand++;
      }
    }
    expect(rose, 'the lounger was never given up').toBeGreaterThan(0);
    expect(onSand).toBe(rose);
  });

  it('gets a sunbather up and off the beach once they have somewhere to be', () => {
    let called = false;
    const crowd = createCrowd({
      network: sandy(),
      count: 40,
      variants: 2,
      seed: 21,
      offTheSand: () => called,
    });
    let lying = -1;
    for (let frame = 0; frame < 60 * 600 && lying < 0; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) if (restingOn(crowd, i) === RESTING.lying) lying = i;
    }
    expect(lying, 'nobody ever lay on a lounger').toBeGreaterThanOrEqual(0);
    // Uncalled, rousing is nothing at all.
    rouseSunbathers(crowd);
    stepCrowd(crowd, MAX_STEP);
    expect(restingOn(crowd, lying)).toBe(RESTING.lying);

    called = true;
    rouseSunbathers(crowd);
    stepCrowd(crowd, MAX_STEP);
    expect(restingOn(crowd, lying), 'still lying down').toBe(RESTING.none);
    expect(crowd.seat[lying]).toBe(-1);
    for (let step = 0; step < 3000 && crowd.node[lying]! < 0; step++) stepCrowd(crowd, MAX_STEP);
    expect(crowd.node[lying], 'never made it back to the boardwalk').toBeGreaterThanOrEqual(0);
  });

  it('keeps a lounger held while its sunbather walks over to it', () => {
    const crowd = createCrowd({ network: sandy(2), count: 40, variants: 2, seed: 24 });
    for (let frame = 0; frame < 60 * 600; frame++) {
      stepCrowd(crowd, 1 / 60);
      const held = Array.from(crowd.seat).filter((seat) => seat >= 0);
      expect(new Set(held).size, 'two people on one lounger').toBe(held.length);
    }
  });
});

/** Every column that is about the person rather than about the graph. */
const personOf = (crowd: Crowd) => ({
  variant: Array.from(crowd.variant),
  speed: Array.from(crowd.speed),
  phase: Array.from(crowd.phase),
  capacity: crowd.capacity,
});

const positionsOf = (crowd: Crowd) => [
  Array.from(crowd.x),
  Array.from(crowd.y),
  Array.from(crowd.z),
];

/** A boardwalk running south from the middle of the plot down onto the beach. */
const boardwalk = (length: number): PavedTile[] =>
  Array.from({ length }, (_, index) => ({ tileX: 10, tileZ: 10 + index, y: 0 }));

describe('the people the simulation holds still', () => {
  /** Where the crowd may be told to stand: the middle of the street, off-node. */
  const SPOT = { x: 4.5 * TILE_VOXELS, y: walkingSurface(0), z: 2 };

  it('draws a held person standing, not walking on the spot', () => {
    const crowd = createCrowd({ network: networkOf(street(12)), count: 4, variants: 2, seed: 26 });
    expect(restingOn(crowd, 0)).toBe(RESTING.none);
    holdAt(crowd, 0, SPOT.x, SPOT.y, SPOT.z, 0);
    expect(restingOn(crowd, 0)).toBe(RESTING.standing);
    releaseTo(crowd, 0, 8);
    expect(restingOn(crowd, 0)).toBe(RESTING.none);
  });

  it('leaves somebody held exactly where they were put, however long it runs', () => {
    const crowd = createCrowd({ network: networkOf(street(12)), count: 4, variants: 2, seed: 21 });
    holdAt(crowd, 0, SPOT.x, SPOT.y, SPOT.z, 1.25);
    for (let step = 0; step < 100; step++) stepCrowd(crowd, MAX_STEP);
    expect(crowd.x[0]).toBeCloseTo(SPOT.x);
    expect(crowd.y[0]).toBeCloseTo(SPOT.y);
    expect(crowd.z[0]).toBeCloseTo(SPOT.z);
    expect(crowd.heading[0]).toBeCloseTo(1.25);
    expect(isWaiting(crowd, 0)).toBe(true);
    // Everybody else carried on, so this is a held person and not a dead crowd.
    expect(crowd.x[1]).not.toBeCloseTo(crowd.fromX[1]!);
  });

  it('does not let a crush push a held person off their spot', () => {
    const crowd = createCrowd({ network: networkOf(street(12)), count: 10, variants: 2, seed: 22 });
    // Everybody on the one point, which is the worst case avoidance can see.
    for (let i = 0; i < crowd.count; i++) holdAt(crowd, i, SPOT.x, SPOT.y, SPOT.z, 0);
    // Nine of them let go again, so the held one stands in a real crush.
    for (let i = 1; i < crowd.count; i++) releaseTo(crowd, i, 0);
    for (let step = 0; step < 120; step++) stepCrowd(crowd, MAX_STEP);
    expect(crowd.side[0]).toBe(0);
    expect(crowd.x[0]).toBeCloseTo(SPOT.x);
    expect(crowd.z[0]).toBeCloseTo(SPOT.z);
  });

  it('frees the seat of anybody taken in hand on their way to one', () => {
    /** A street with one bench beside its middle tile, so somebody sits. */
    const network = walkNetworkFor({
      paved: street(9),
      levelOf: FLAT,
      shore: null,
      tilesX: 20,
      seats: [
        {
          x: 4.25 * TILE_VOXELS,
          z: TILE_VOXELS * 1.5,
          y: walkingSurface(0) + 2,
          heading: Math.PI,
          pose: 'sit' as const,
          tileX: 4,
          tileZ: 1,
        },
      ],
    });
    const crowd = createCrowd({ network, count: 30, variants: 2, seed: 23 });
    let person = -1;
    for (let elapsed = 0; person < 0 && elapsed < 600; elapsed += 1 / 30) {
      stepCrowd(crowd, 1 / 30);
      person = crowd.seatBy[0]!;
    }
    expect(person, 'nobody ever went for the bench').toBeGreaterThanOrEqual(0);
    holdAt(crowd, person, SPOT.x, SPOT.y, SPOT.z, 0);
    expect(crowd.seat[person]).toBe(-1);
    expect(crowd.seatBy[0]).toBe(-1);
  });

  it('puts a released person back on a segment, and they arrive', () => {
    const network = networkOf(street(12));
    const crowd = createCrowd({ network, count: 2, variants: 1, seed: 24 });
    holdAt(crowd, 0, SPOT.x, SPOT.y, SPOT.z, 0);
    releaseTo(crowd, 0, 8);
    expect(isWaiting(crowd, 0)).toBe(false);
    expect(crowd.node[0]).toBe(8);
    expect(crowd.cameFrom[0]).toBe(-1);
    run(crowd, 30);
    // They walked: whatever the wander did with them afterwards, they left.
    expect(Math.hypot(crowd.x[0]! - SPOT.x, crowd.z[0]! - SPOT.z)).toBeGreaterThan(TILE_VOXELS);
  });

  it('walks a held person again when the graph is rebuilt under them', () => {
    const network = networkOf(street(12));
    const crowd = createCrowd({ network, count: 4, variants: 2, seed: 25 });
    holdAt(crowd, 0, SPOT.x, SPOT.y, SPOT.z, 0);
    const reseated = reseatCrowd(crowd, networkOf(street(14)));
    expect(isWaiting(reseated, 0)).toBe(false);
    run(reseated, 20);
    expect(Math.hypot(reseated.x[0]! - SPOT.x, reseated.z[0]! - SPOT.z)).toBeGreaterThan(1);
  });
});

describe('resting where the simulation puts them', () => {
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const network = walkNetworkFor({
    paved: boardwalk(8),
    levelOf: FLAT,
    shore,
    tilesX: 20,
    seats: loungers(2),
  });

  it('draws somebody held sitting on the sand as sitting, and leaves them there', () => {
    const crowd = createCrowd({ network, count: 6, variants: 2, seed: 30 });
    const spot = { x: 6.5 * TILE_VOXELS, y: BEACH_SURFACE + 1.5, z: 14.5 * TILE_VOXELS };
    holdAt(crowd, 0, spot.x, spot.y, spot.z, 0, RESTING.sitting);
    expect(restingOn(crowd, 0)).toBe(RESTING.sitting);
    for (let step = 0; step < 200; step++) stepCrowd(crowd, MAX_STEP);
    expect(restingOn(crowd, 0)).toBe(RESTING.sitting);
    expect([crowd.x[0], crowd.y[0], crowd.z[0]]).toEqual([
      Math.fround(spot.x),
      Math.fround(spot.y),
      Math.fround(spot.z),
    ]);
  });

  it('lies somebody on a free lounger, keeps it theirs, and frees it when they are let go', () => {
    const crowd = createCrowd({ network, count: 6, variants: 2, seed: 31 });
    const [lounger] = network.beachSeats as [number];
    const seat = network.seats[lounger]!;
    expect(seatIsFree(crowd, lounger)).toBe(true);
    expect(holdOnSeat(crowd, 0, lounger)).toBe(true);
    expect(restingOn(crowd, 0)).toBe(RESTING.lying);
    expect(isWaiting(crowd, 0)).toBe(true);
    expect(crowd.seat[0]).toBe(lounger);
    expect(seatIsFree(crowd, lounger)).toBe(false);
    expect(crowd.heading[0]).toBeCloseTo(seat.heading);
    // Held, not timed: a lie on a lounger that ran out would stand them up.
    for (let step = 0; step < 200; step++) stepCrowd(crowd, MAX_STEP);
    expect(restingOn(crowd, 0)).toBe(RESTING.lying);

    expect(holdOnSeat(crowd, 1, lounger), 'two people on one lounger').toBe(false);
    expect(isWaiting(crowd, 1)).toBe(false);
    expect(holdOnSeat(crowd, 1, network.seats.length)).toBe(false);

    releaseTo(crowd, 0, network.gates[0]!);
    expect(crowd.seat[0]).toBe(-1);
    expect(seatIsFree(crowd, lounger)).toBe(true);
  });
});

/** Steps until `person` has been asked about the sand `times` times, or a minute passes. */
const until = (crowd: Crowd, asked: number[], person: number, times: number): void => {
  for (let step = 0; step < 600; step++) {
    if (asked.filter((each) => each === person).length >= times) return;
    stepCrowd(crowd, MAX_STEP);
  }
};

describe('an errand over the sand', () => {
  // Water from z = 18; six rows of sand in front of it, and a boardwalk down to it.
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const network = walkNetworkFor({ paved: boardwalk(8), levelOf: FLAT, shore, tilesX: 20 });
  /** A point on the open sand west of the boardwalk, and another further along. */
  const FIRST = { x: 6.5 * TILE_VOXELS, z: 14.5 * TILE_VOXELS };
  const SECOND = { x: 3.5 * TILE_VOXELS, z: 13.5 * TILE_VOXELS };

  /**
   * A crowd whose router answers every arrival on the sand with `onSand`, and
   * somebody stood at the first gate and sent to {@link FIRST}.
   */
  const errand = (onSand: (crowd: Crowd, person: number, asked: number) => void) => {
    const asked: number[] = [];
    let crowd: Crowd | null = null;
    crowd = createCrowd({
      network,
      count: 6,
      variants: 1,
      seed: 42,
      routeOf: (person, at) => {
        if (at === ON_SAND) {
          asked.push(person);
          onSand(crowd!, person, asked.filter((each) => each === person).length);
        }
        return -1;
      },
    });
    const person = [...Array(crowd.count).keys()].find((i) => crowd!.node[i]! >= 0)!;
    const gate = network.nodes[network.gates[0]!]!;
    holdAt(crowd, person, gate.x, gate.y, gate.z, 0);
    walkSandTo(crowd, person, FIRST.x, FIRST.z);
    return { crowd, person, asked };
  };

  it('walks them to the point and asks the router once when they get there', () => {
    const { crowd, person, asked } = errand(() => undefined);
    expect(isRoaming(crowd, person)).toBe(false);
    expect(crowd.lane[person]).toBe(LANE.sand);
    until(crowd, asked, person, 1);
    expect(asked.filter((each) => each === person)).toHaveLength(1);
    expect(Math.hypot(crowd.fromX[person]! - FIRST.x, crowd.fromZ[person]! - FIRST.z)).toBeLessThan(
      1,
    );
    run(crowd, 30);
    expect(asked.filter((each) => each === person)).toHaveLength(1);
  });

  it('chains a second leg when the router sends them on', () => {
    const { crowd, person, asked } = errand((people, i, times) => {
      if (times === 1) walkSandTo(people, i, SECOND.x, SECOND.z);
    });
    until(crowd, asked, person, 2);
    expect(asked.filter((each) => each === person)).toHaveLength(2);
    expect(
      Math.hypot(crowd.fromX[person]! - SECOND.x, crowd.fromZ[person]! - SECOND.z),
    ).toBeLessThan(1);
  });

  it('turns somebody the router forgot into a roamer rather than leaving them stood there', () => {
    const { crowd, person, asked } = errand(() => undefined);
    until(crowd, asked, person, 1);
    stepCrowd(crowd, MAX_STEP);
    expect(isRoaming(crowd, person)).toBe(true);
    expect(network.gates).toContain(crowd.gate[person]);
    const there = { x: crowd.x[person]!, z: crowd.z[person]! };
    run(crowd, 20);
    expect(Math.hypot(crowd.x[person]! - there.x, crowd.z[person]! - there.z)).toBeGreaterThan(1);
  });

  it('turns somebody back from where they have got to, not from where they set off', () => {
    const { crowd, person } = errand(() => undefined);
    for (let step = 0; step < 30; step++) stepCrowd(crowd, MAX_STEP);
    const there = { x: crowd.x[person]!, z: crowd.z[person]! };
    const gate = network.gates[0]!;
    expect(
      Math.hypot(there.x - crowd.fromX[person]!, there.z - crowd.fromZ[person]!),
    ).toBeGreaterThan(TILE_VOXELS / 2);
    walkSandTo(crowd, person, SECOND.x, SECOND.z);
    stepCrowd(crowd, MAX_STEP);
    expect(Math.hypot(crowd.x[person]! - there.x, crowd.z[person]! - there.z)).toBeLessThan(2);
    for (let step = 0; step < 10; step++) stepCrowd(crowd, MAX_STEP);
    const later = { x: crowd.x[person]!, z: crowd.z[person]! };
    releaseTo(crowd, person, gate);
    stepCrowd(crowd, MAX_STEP);
    expect(Math.hypot(crowd.x[person]! - later.x, crowd.z[person]! - later.z)).toBeLessThan(2);
  });

  it('walks somebody let go from the sand back to the paving over sand', () => {
    const gate = network.gates[0]!;
    const { crowd, person, asked } = errand((people, i) => releaseTo(people, i, gate));
    until(crowd, asked, person, 1);
    expect(crowd.node[person]).toBe(gate);
    expect(crowd.lane[person]).toBe(LANE.sand);

    // Held on the sand's own surface is on the sand too; held on paving is not.
    holdAt(crowd, person, FIRST.x, BEACH_SURFACE, FIRST.z, 0);
    releaseTo(crowd, person, gate);
    expect(crowd.lane[person]).toBe(LANE.sand);
    const node = network.nodes[gate]!;
    holdAt(crowd, person, node.x, node.y, node.z, 0);
    releaseTo(crowd, person, gate);
    expect(crowd.lane[person]).toBe(LANE.paved);
  });

  it('leaves an errand-runner on the sand, as a roamer, across a rebuild', () => {
    const { crowd, person } = errand(() => undefined);
    stepCrowd(crowd, MAX_STEP);
    const rebuilt = walkNetworkFor({
      paved: [...boardwalk(8), { tileX: 11, tileZ: 10, y: 0 }],
      levelOf: FLAT,
      shore,
      tilesX: 20,
    });
    const reseated = reseatCrowd(crowd, rebuilt);
    expect(isRoaming(reseated, person)).toBe(true);
    expect(rebuilt.gates).toContain(reseated.gate[person]);
  });

  /**
   * Every bench comparison since plan 017 depends on a crowd with no router
   * replaying the afternoon it always has, and this plan added a state beside
   * the roaming one. Pinned before `walkSandTo` existed, on a beach with a
   * promenade, loungers, a bench and things standing on the sand, so the wander,
   * the sand, the seats and the obstacles all draw.
   */
  it('replays a crowd with no router to the voxel over 2 000 steps', () => {
    const paved = [
      ...boardwalk(8),
      ...Array.from({ length: 12 }, (_, tileX) => ({ tileX: tileX + 4, tileZ: 9, y: 0 })),
    ];
    const seats: SeatSpot[] = Array.from({ length: 6 }, (_, index) => ({
      x: (3 + index * 2) * TILE_VOXELS + 8,
      z: 14 * TILE_VOXELS + 8,
      y: 3,
      heading: 0,
      pose: 'lie' as const,
      tileX: 3 + index * 2,
      tileZ: 14,
    }));
    seats.push({
      x: 6 * TILE_VOXELS + 4,
      z: 8 * TILE_VOXELS + 12,
      y: walkingSurface(0) + 2,
      heading: 0,
      pose: 'lie',
      tileX: 6,
      tileZ: 8,
    });
    const obstacles = Array.from({ length: 8 }, (_, index) => ({
      x: (2 + index * 2) * TILE_VOXELS + 4,
      z: 15 * TILE_VOXELS + 4,
      width: 8,
      depth: 8,
    }));
    const furnished = walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20, seats, obstacles });
    const crowd = createCrowd({ network: furnished, count: 40, variants: 4, seed: 27 });
    for (let step = 0; step < 2000; step++) stepCrowd(crowd, MAX_STEP);
    let hash = 2166136261;
    for (const column of [crowd.x, crowd.z]) {
      for (const byte of new Uint8Array(column.buffer, column.byteOffset, column.byteLength)) {
        hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      }
    }
    expect(hash).toBe(2894628438);
  });
});

describe('reseatCrowd', () => {
  /** A street along z = 0 with a lane running north off its middle. */
  const crossroads = (length: number): PavedTile[] => [
    ...street(length),
    ...Array.from({ length: 6 }, (_, index) => ({
      tileX: Math.floor(length / 2),
      tileZ: index + 1,
      y: 0,
    })),
  ];

  /** A crowd that has been walking a while, so nobody is where they started. */
  const walked = (network: WalkNetwork, seed: number, count = 40): Crowd => {
    const crowd = createCrowd({ network, count, variants: 4, seed });
    run(crowd, 30);
    return crowd;
  };

  it('keeps who everybody is', () => {
    const crowd = walked(networkOf(street(20)), 31);
    const before = personOf(crowd);
    const reseated = reseatCrowd(crowd, networkOf(crossroads(20)));
    expect(personOf(reseated)).toEqual(before);
  });

  it('keeps everybody where they are standing', () => {
    const crowd = walked(networkOf(street(20)), 32);
    const before = positionsOf(crowd);
    const reseated = reseatCrowd(crowd, networkOf(crossroads(24)));
    expect(positionsOf(reseated)).toEqual(before);
  });

  it('gives every seat up, against the new network’s seats', () => {
    const seat: SeatSpot = {
      x: 4.3 * TILE_VOXELS,
      z: 1.5 * TILE_VOXELS,
      y: walkingSurface(0) + 2,
      heading: Math.PI,
      pose: 'sit',
      tileX: 4,
      tileZ: 1,
    };
    const benched = walkNetworkFor({
      paved: street(9),
      levelOf: FLAT,
      shore: null,
      tilesX: 20,
      seats: [seat, { ...seat, x: 4.5 * TILE_VOXELS }],
    });
    const crowd = createCrowd({ network: benched, count: 40, variants: 2, seed: 33 });
    run(crowd, 120);
    expect(
      Array.from(crowd.seat).some((held) => held >= 0),
      'nobody sat down',
    ).toBe(true);
    const moved = walkNetworkFor({
      paved: street(9),
      levelOf: FLAT,
      shore: null,
      tilesX: 20,
      seats: [seat, { ...seat, x: 4.5 * TILE_VOXELS }, { ...seat, x: 4.7 * TILE_VOXELS }],
    });
    const reseated = reseatCrowd(crowd, moved);
    expect(Array.from(reseated.seat)).toEqual(Array(reseated.capacity).fill(-1));
    expect(Array.from(reseated.seatBy)).toEqual([-1, -1, -1]);
    for (let i = 0; i < reseated.count; i++) expect(isSeated(reseated, i)).toBe(false);
  });

  it('puts everybody on the new graph', () => {
    const crowd = walked(networkOf(crossroads(20)), 34);
    const network = networkOf(street(12));
    const reseated = reseatCrowd(crowd, network);
    for (let i = 0; i < reseated.count; i++) {
      const node = reseated.node[i]!;
      expect(node === -1 || (node >= 0 && node < network.nodes.length), `node ${node}`).toBe(true);
      const cameFrom = reseated.cameFrom[i]!;
      expect(cameFrom >= -1 && cameFrom < network.nodes.length).toBe(true);
    }
  });

  it('walks a person to the node beside them, not to the first node there is', () => {
    const crowd = walked(networkOf(street(40)), 35);
    // Laid east to west, so node 0 is at the far east end of the street.
    const network = networkOf(street(40).toReversed());
    expect(network.nodes[0]!.tileX).toBe(39);
    const reseated = reseatCrowd(crowd, network);
    let westerners = 0;
    for (let i = 0; i < reseated.count; i++) {
      const node = network.nodes[reseated.node[i]!]!;
      expect(Math.abs(node.x - reseated.x[i]!), `person ${i}`).toBeLessThanOrEqual(TILE_VOXELS);
      if (reseated.x[i]! < 20 * TILE_VOXELS) westerners++;
    }
    expect(westerners).toBeGreaterThan(0);
  });

  it('empties the plot when every path is taken up, without throwing', () => {
    const crowd = walked(networkOf(street(20)), 36);
    const reseated = reseatCrowd(crowd, networkOf([]));
    expect(reseated.count).toBe(0);
    expect(reseated.capacity).toBe(crowd.capacity);
    expect(() => stepCrowd(reseated, 1 / 60)).not.toThrow();
  });

  it('brings everybody back when paving is laid again', () => {
    const crowd = walked(networkOf(street(20)), 37);
    const before = personOf(crowd);
    const emptied = reseatCrowd(crowd, networkOf([]));
    const back = reseatCrowd(emptied, networkOf(crossroads(20)));
    expect(back.count).toBe(crowd.capacity);
    expect(personOf(back)).toEqual(before);
    const startX = Float32Array.from(back.x);
    run(back, 5);
    let moved = 0;
    for (let i = 0; i < back.count; i++) if (back.x[i] !== startX[i]) moved++;
    expect(moved).toBeGreaterThan(back.count / 2);
  });

  it('walks on afterwards, and stays on the new graph', () => {
    const crowd = walked(networkOf(crossroads(30)), 38);
    const network = networkOf(street(10));
    const reseated = reseatCrowd(crowd, network);
    // Long enough for everybody to have walked in off wherever the old graph
    // left them: the far end of the old street is twenty tiles past the new one,
    // which is a minute's walk.
    run(reseated, 120);
    for (let frame = 0; frame < 600; frame++) {
      stepCrowd(reseated, 1 / 60);
      for (let i = 0; i < reseated.count; i++) {
        const node = reseated.node[i]!;
        expect(node >= 0 && node < network.nodes.length, `node ${node}`).toBe(true);
        expect(Number.isFinite(reseated.x[i]!)).toBe(true);
      }
    }
    for (let i = 0; i < reseated.count; i++) {
      expect(reseated.x[i]!).toBeGreaterThanOrEqual(-MAX_SIDE);
      expect(reseated.x[i]!).toBeLessThanOrEqual(10 * TILE_VOXELS + MAX_SIDE);
      expect(Math.abs(reseated.z[i]! - 0.5 * TILE_VOXELS)).toBeLessThanOrEqual(MAX_SIDE + 0.01);
    }
  });

  describe('on the beach', () => {
    const shore = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
    });
    const beachOf = (paved: PavedTile[], seats: SeatSpot[] = []): WalkNetwork =>
      walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX: 20, seats });

    it('leaves a roamer out on the sand', () => {
      const crowd = createCrowd({
        network: beachOf(boardwalk(8)),
        count: 40,
        variants: 2,
        seed: 39,
      });
      const roamers = Array.from({ length: crowd.count }, (_, i) => i).filter(
        (i) => crowd.node[i] === -1,
      );
      expect(roamers.length).toBeGreaterThan(0);
      const network = beachOf([...boardwalk(8), { tileX: 11, tileZ: 10, y: 0 }]);
      const reseated = reseatCrowd(crowd, network);
      for (const i of roamers) {
        expect(reseated.node[i], `person ${i}`).toBe(-1);
        expect(network.gates).toContain(reseated.gate[i]);
      }
    });

    it('gets a sunbather up onto the sand rather than onto the boardwalk', () => {
      const network = beachOf(boardwalk(8), loungers(6));
      const crowd = createCrowd({ network, count: 40, variants: 2, seed: 40 });
      let lying = -1;
      for (let frame = 0; frame < 60 * 600 && lying === -1; frame++) {
        stepCrowd(crowd, 1 / 60);
        for (let i = 0; i < crowd.count; i++) {
          if (restingOn(crowd, i) === RESTING.lying) lying = i;
        }
      }
      expect(lying, 'nobody lay down').toBeGreaterThanOrEqual(0);
      const reseated = reseatCrowd(crowd, beachOf(boardwalk(8), loungers(6)));
      expect(reseated.node[lying]).toBe(-1);
      expect(reseated.seat[lying]).toBe(-1);
    });
  });
});
