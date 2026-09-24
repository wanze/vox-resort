import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { plinth, steps } from './ground.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

describe('plinth', () => {
  it('fills the footprint it is given, three layers by default', () => {
    const b = new VoxelBuilder();
    const free = plinth(b, { x: 0, z: 0, w: 16, d: 32 });
    expect(free).toBe(3);
    expect(b.voxels.size).toBe(16 * 32 * 3);
    expect(at(b, 0, 0, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 8, 1, 16)).toBe(PALETTE.stone.base);
  });

  it('lips the top edge all the way round, so the plot has an outline', () => {
    const b = new VoxelBuilder();
    plinth(b, { x: 0, z: 0, w: 8, d: 8 });
    for (const [x, z] of [
      [0, 3],
      [7, 3],
      [3, 0],
      [3, 7],
      [0, 0],
    ] as const) {
      expect(at(b, x, 2, z)).toBe(PALETTE.stone.shade);
    }
    expect(at(b, 3, 2, 3)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 1, 3)).toBe(PALETTE.stone.base);
  });

  it('starts where it is told and stacks the height it is asked for', () => {
    const b = new VoxelBuilder();
    expect(plinth(b, { x: 4, z: 6, w: 4, d: 4, y: 10, height: 1 })).toBe(11);
    expect(at(b, 4, 10, 6)).toBe(PALETTE.stone.shade);
    expect(at(b, 4, 9, 6)).toBeUndefined();
  });

  it('refuses a footprint too small to have an inside', () => {
    expect(() => plinth(new VoxelBuilder(), { x: 0, z: 0, w: 2, d: 8 })).toThrow(/3 voxels/);
    expect(() => plinth(new VoxelBuilder(), { x: 0, z: 0, w: 8, d: 8, height: 0 })).toThrow(
      /one layer/,
    );
  });
});

describe('steps', () => {
  it('drops one layer for every two voxels it goes out', () => {
    const b = new VoxelBuilder();
    steps(b, { x: 0, z: 10, w: 2, y: 5, treads: 3, descends: 'z+' });
    expect(at(b, 0, 5, 10)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 5, 11)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 5, 12)).toBeUndefined();
    expect(at(b, 0, 4, 12)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 3, 14)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 4, 14)).toBeUndefined();
  });

  it('is solid down to the floor the flight stands on', () => {
    const b = new VoxelBuilder();
    steps(b, { x: 0, z: 0, w: 1, y: 4, treads: 2, descends: 'z+' });
    expect(at(b, 0, 3, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 4, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 0, 2, 0)).toBeUndefined();
  });

  it('descends whichever way it is pointed', () => {
    for (const [descends, dx, dz] of [
      ['x+', 1, 0],
      ['x-', -1, 0],
      ['z+', 0, 1],
      ['z-', 0, -1],
    ] as const) {
      const b = new VoxelBuilder();
      steps(b, { x: 20, z: 20, w: 1, y: 3, treads: 2, descends });
      expect(at(b, 20 + dx * 2, 2, 20 + dz * 2), descends).toBe(PALETTE.stone.base);
      expect(at(b, 20 + dx * 2, 3, 20 + dz * 2), descends).toBeUndefined();
    }
  });

  it('refuses a flight with nothing in it', () => {
    expect(() =>
      steps(new VoxelBuilder(), { x: 0, z: 0, w: 1, y: 3, treads: 0, descends: 'z+' }),
    ).toThrow(/one tread/);
    expect(() => steps(new VoxelBuilder(), { x: 0, z: 0, w: 0, y: 3, descends: 'z+' })).toThrow(
      /one voxel wide/,
    );
  });
});
