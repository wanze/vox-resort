import { describe, expect, it } from 'vitest';
import { VoxelBuilder } from './voxelgen.ts';

describe('VoxelBuilder', () => {
  it('reads back what was painted, at the edges of the grid too', () => {
    const b = new VoxelBuilder();
    const corners = [
      [-1024, -1024, -1024],
      [1023, 1023, 1023],
      [-1, 0, 1],
      [0, -7, 300],
    ] as const;
    corners.forEach(([x, y, z], index) => b.set(x, y, z, index + 1));

    expect(b.size).toBe(corners.length);
    corners.forEach(([x, y, z], index) => {
      expect(b.get(x, y, z)).toBe(index + 1);
      expect(b.has(x, y, z)).toBe(true);
    });
    expect([...b]).toEqual(corners.map(([x, y, z], index) => ({ x, y, z, color: index + 1 })));
    expect(b.get(0, 0, 0)).toBeUndefined();
    expect(b.has(0, 0, 0)).toBe(false);
  });

  it('repaints in place and forgets a deleted voxel', () => {
    const b = new VoxelBuilder();
    b.box(0, 1, 0, 0, 0, 0, 5);
    b.set(0, 0, 0, 9);
    b.del(1, 0, 0);
    b.del(4, 4, 4);

    expect([...b]).toEqual([{ x: 0, y: 0, z: 0, color: 9 }]);
  });

  it('visits a voxel added mid-loop, so art can grow from what it has painted', () => {
    const b = new VoxelBuilder();
    b.set(0, 0, 0, 1);
    for (const { x, y, z } of b) if (y < 2) b.set(x, y + 1, z, 1);

    expect(b.size).toBe(3);
  });

  it('refuses a voxel off the grid rather than painting over another', () => {
    const b = new VoxelBuilder();
    expect(() => b.set(0.5, 0, 0, 1)).toThrow(/whole voxel/);
    expect(() => b.set(0, 1024, 0, 1)).toThrow(/within 1024/);
    expect(() => b.get(-1025, 0, 0)).toThrow(/within 1024/);
    expect(() => b.set(0, 0, Number.NaN, 1)).toThrow(/whole voxel/);
  });
});
