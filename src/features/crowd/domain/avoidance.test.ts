import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { LANE, MAX_SIDE, proximityFor, steerWalkers, type Walkers } from './avoidance';
import { sandGridFor } from './sandGrid';
import { shoreFor } from '../../layout/domain/shoreline';

interface Line {
  readonly x: number;
  readonly z: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly speed: number;
}

function walkersOn(lines: readonly Line[], lane: number = LANE.paved) {
  const count = lines.length;
  const walkers: Walkers = {
    count,
    x: Float32Array.from(lines, (line) => line.x),
    y: new Float32Array(count),
    z: Float32Array.from(lines, (line) => line.z),
    dirX: Float32Array.from(lines, (line) => line.dirX),
    dirZ: Float32Array.from(lines, (line) => line.dirZ),
    speed: Float32Array.from(lines, (line) => line.speed),
    side: new Float32Array(count),
    pace: new Float32Array(count).fill(1),
    lane: new Uint8Array(count).fill(lane),
    ...proximityFor(count),
  };
  const along = new Float32Array(count);
  const step = (dt: number): number => {
    steerWalkers(walkers, dt, null);
    for (let i = 0; i < count; i++) {
      along[i]! += walkers.speed[i]! * walkers.pace[i]! * dt;
      const line = lines[i]!;
      walkers.x[i] = line.x + line.dirX * along[i]! + line.dirZ * walkers.side[i]!;
      walkers.z[i] = line.z + line.dirZ * along[i]! - line.dirX * walkers.side[i]!;
    }
    let closest = Infinity;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        closest = Math.min(
          closest,
          Math.hypot(walkers.x[i]! - walkers.x[j]!, walkers.z[i]! - walkers.z[j]!),
        );
      }
    }
    return closest;
  };
  return { walkers, along, step };
}

const closestOver = (step: (dt: number) => number, seconds: number): number => {
  let closest = Infinity;
  for (let frame = 0; frame < seconds * 60; frame++) closest = Math.min(closest, step(1 / 60));
  return closest;
};

describe('proximityFor', () => {
  it('keeps the smallest table for a small crowd', () => {
    expect(proximityFor(600).cellHead).toHaveLength(4096);
  });

  it('grows the table with the crowd, a power of two with two slots a person', () => {
    const { cellHead, cellNext } = proximityFor(5000);
    expect(cellHead).toHaveLength(16_384);
    expect(cellNext).toHaveLength(5000);
  });
});

describe('steerWalkers', () => {
  it('passes two people walking at each other down the same line', () => {
    const { walkers, step } = walkersOn([
      { x: 0, z: 8, dirX: 1, dirZ: 0, speed: 5.6 },
      { x: 60, z: 8, dirX: -1, dirZ: 0, speed: 5.6 },
    ]);
    expect(closestOver(step, 12)).toBeGreaterThan(3);
    expect(walkers.x[0]!).toBeGreaterThan(60);
    expect(walkers.x[1]!).toBeLessThan(0);
  });

  it('never has a fast walker walk through a slow one ahead', () => {
    const { along, step } = walkersOn([
      { x: 0, z: 8, dirX: 1, dirZ: 0, speed: 7 },
      { x: 10, z: 8, dirX: 1, dirZ: 0, speed: 4 },
    ]);
    expect(closestOver(step, 20)).toBeGreaterThan(3);
    expect(along[0]!).toBeGreaterThan(along[1]! + 10);
  });

  it('keeps a crossing moving, rather than both waiting for each other', () => {
    const { along, step } = walkersOn([
      { x: 0, z: 30, dirX: 1, dirZ: 0, speed: 5.6 },
      { x: 30, z: 0, dirX: 0, dirZ: 1, speed: 5.6 },
    ]);
    expect(closestOver(step, 15)).toBeGreaterThan(2.5);
    expect(along[0]!).toBeGreaterThan(60);
    expect(along[1]!).toBeGreaterThan(60);
  });

  it('never steps anybody further aside than the path allows', () => {
    const lines: Line[] = Array.from({ length: 30 }, (_, index) => ({
      x: index % 2 === 0 ? index * 3 : 200 - index * 3,
      z: 8,
      dirX: index % 2 === 0 ? 1 : -1,
      dirZ: 0,
      speed: 4 + (index % 5),
    }));
    const { walkers, step } = walkersOn(lines);
    for (let frame = 0; frame < 60 * 30; frame++) {
      step(1 / 60);
      for (let i = 0; i < walkers.count; i++) {
        expect(Math.abs(walkers.side[i]!)).toBeLessThanOrEqual(MAX_SIDE);
        expect(walkers.pace[i]!).toBeGreaterThan(0);
      }
    }
  });

  it('leaves somebody resting exactly where they are', () => {
    const { walkers, step } = walkersOn(
      [
        { x: 0, z: 8, dirX: 1, dirZ: 0, speed: 0 },
        { x: 1, z: 8, dirX: 1, dirZ: 0, speed: 0 },
      ],
      LANE.none,
    );
    step(1 / 60);
    expect(Array.from(walkers.side)).toEqual([0, 0]);
    expect(Array.from(walkers.pace)).toEqual([1, 1]);
  });

  it('does not sidestep into something standing on the sand', () => {
    const shore = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
    })!;
    const z = 13 * TILE_VOXELS;
    const sand = sandGridFor({
      shore,
      tilesX: 20,
      obstacles: [
        { x: 0, z: z + 2, width: 300, depth: 6 },
        { x: 0, z: z - 8, width: 300, depth: 6 },
      ],
    });
    const walkers: Walkers = {
      count: 2,
      x: Float32Array.of(20, 30),
      y: new Float32Array(2),
      z: Float32Array.of(z, z),
      dirX: Float32Array.of(1, -1),
      dirZ: new Float32Array(2),
      speed: Float32Array.of(5.6, 5.6),
      side: new Float32Array(2),
      pace: Float32Array.of(1, 1),
      lane: new Uint8Array(2).fill(LANE.sand),
      ...proximityFor(2),
    };
    for (let frame = 0; frame < 60; frame++) steerWalkers(walkers, 1 / 60, sand);
    expect(Array.from(walkers.side)).toEqual([0, 0]);
    expect(walkers.pace[0]!).toBeLessThan(1);
  });
});
