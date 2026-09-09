import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { gableRoof, hipRoof } from './roof.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

/** The inclusive span a layer covers on one axis, or null if it is empty. */
const span = (b: VoxelBuilder, y: number, axis: 'x' | 'z'): [number, number] | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const key of b.voxels.keys()) {
    const [x, layer, z] = key.split(',').map(Number) as [number, number, number];
    if (layer !== y) continue;
    const value = axis === 'x' ? x : z;
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  return lo === Infinity ? null : [lo, hi];
};

describe('gableRoof', () => {
  it('stands its eaves out past the wall it covers', () => {
    const b = new VoxelBuilder();
    gableRoof(b, { x: 4, z: 4, w: 12, d: 20, y: 10, ridge: 'z' });
    expect(span(b, 10, 'x')).toEqual([2, 17]);
    expect(span(b, 10, 'z')).toEqual([2, 25]);
    expect(at(b, 2, 10, 2)).toBe(PALETTE.terracotta.deep);
  });

  it('steps in two voxels a side for every layer it rises', () => {
    const b = new VoxelBuilder();
    gableRoof(b, { x: 0, z: 0, w: 16, d: 8, y: 0, ridge: 'z', overhang: 0 });
    expect(span(b, 0, 'x')).toEqual([0, 15]);
    expect(span(b, 1, 'x')).toEqual([2, 13]);
    expect(span(b, 2, 'x')).toEqual([4, 11]);
    // The gable ends never move: the ridge runs the length of the building.
    expect(span(b, 2, 'z')).toEqual([0, 7]);
  });

  it('caps the ridge a voxel in from the last course, and says where it ends', () => {
    const b = new VoxelBuilder();
    const free = gableRoof(b, { x: 0, z: 0, w: 16, d: 8, y: 0, ridge: 'z', overhang: 0 });
    // 16 wide closes after four courses, the last of them four voxels across.
    expect(span(b, 3, 'x')).toEqual([6, 9]);
    expect(span(b, 4, 'x')).toEqual([7, 8]);
    expect(at(b, 7, 4, 3)).toBe(PALETTE.terracotta.light);
    expect(free).toBe(5);
  });

  it('runs the ridge along whichever axis it is given', () => {
    const b = new VoxelBuilder();
    gableRoof(b, { x: 0, z: 0, w: 8, d: 16, y: 0, ridge: 'x', overhang: 0 });
    expect(span(b, 1, 'x')).toEqual([0, 7]);
    expect(span(b, 1, 'z')).toEqual([2, 13]);
  });

  it('paints the tile it is handed', () => {
    const b = new VoxelBuilder();
    gableRoof(b, { x: 0, z: 0, w: 8, d: 8, y: 0, ridge: 'x', overhang: 0, tile: PALETTE.thatch });
    expect(at(b, 0, 0, 0)).toBe(PALETTE.thatch.deep);
    expect(at(b, 0, 1, 2)).toBe(PALETTE.thatch.base);
  });
});

describe('hipRoof', () => {
  it('falls away on all four sides and closes to a point on a square plan', () => {
    const b = new VoxelBuilder();
    const free = hipRoof(b, { x: 0, z: 0, w: 8, d: 8, y: 0, overhang: 0 });
    expect(span(b, 0, 'x')).toEqual([0, 7]);
    expect(span(b, 0, 'z')).toEqual([0, 7]);
    expect(span(b, 1, 'x')).toEqual([2, 5]);
    expect(span(b, 1, 'z')).toEqual([2, 5]);
    expect(span(b, 2, 'x')).toEqual([3, 4]);
    expect(at(b, 3, 2, 3)).toBe(PALETTE.terracotta.light);
    expect(free).toBe(3);
  });

  it('leaves a ridge where the plan is longer than it is wide', () => {
    const b = new VoxelBuilder();
    hipRoof(b, { x: 0, z: 0, w: 20, d: 8, y: 0, overhang: 0 });
    // The short axis closes first; the cap is what is left of the long one.
    expect(span(b, 2, 'z')).toEqual([3, 4]);
    expect(span(b, 2, 'x')).toEqual([3, 16]);
  });
});
