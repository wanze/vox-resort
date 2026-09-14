import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import {
  createCrowd,
  isSeated,
  MAX_STEP,
  reseatCrowd,
  RESTING,
  restingOn,
  stepCrowd,
  WALK_SPEED,
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
import { MAX_SIDE } from './avoidance';

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
