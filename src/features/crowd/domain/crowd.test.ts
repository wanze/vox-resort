import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createCrowd, MAX_STEP, stepCrowd, WALK_SPEED, type Crowd } from './crowd';
import { walkingSurface, walkNetworkFor, type PavedTile, type WalkNetwork } from './walkNetwork';

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
      expect(crowd.x[i]!).toBeGreaterThanOrEqual(0);
      expect(crowd.x[i]!).toBeLessThanOrEqual(30 * TILE_VOXELS);
      expect(crowd.z[i]!).toBeCloseTo(0.5 * TILE_VOXELS);
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
    stepCrowd(other, MAX_STEP);
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
