import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import { describe, expect, it } from 'vitest';
import { coarseIdOf, coarsenVoxels, coarseScratchModelOf, fullIdOf } from './coarseVoxels';

const cube = (size: number, color: number): PaintedVoxel[] => {
  const voxels: PaintedVoxel[] = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) voxels.push({ x, y, z, color });
    }
  }
  return voxels;
};

describe('coarsenVoxels', () => {
  it('halves a solid cube along every axis', () => {
    const coarse = coarsenVoxels(cube(4, 0x112233));
    expect(coarse).toHaveLength(8);
    expect(coarse.every((voxel) => voxel.color === 0x112233)).toBe(true);
    expect(Math.max(...coarse.map((voxel) => voxel.x))).toBe(1);
  });

  it('keeps a lone voxel rather than letting a thin post vanish', () => {
    expect(coarsenVoxels([{ x: 5, y: 7, z: 3, color: 1 }])).toEqual([
      { x: 2, y: 3, z: 1, color: 1 },
    ]);
  });

  it('paints a block the colour most of it is', () => {
    const coarse = coarsenVoxels([
      { x: 0, y: 0, z: 0, color: 1 },
      { x: 1, y: 0, z: 0, color: 2 },
      { x: 0, y: 1, z: 0, color: 2 },
    ]);
    expect(coarse).toEqual([{ x: 0, y: 0, z: 0, color: 2 }]);
  });

  it('breaks a tie towards the colour seen first, so every run agrees', () => {
    const voxels: PaintedVoxel[] = [
      { x: 0, y: 0, z: 0, color: 7 },
      { x: 1, y: 1, z: 1, color: 9 },
    ];
    expect(coarsenVoxels(voxels)[0]?.color).toBe(7);
    expect(coarsenVoxels(voxels)).toEqual(coarsenVoxels(voxels));
  });

  it('refuses a scale that is not a whole number of voxels', () => {
    expect(() => coarsenVoxels([], 1.5)).toThrow(/Cannot coarsen/);
  });
});

describe('coarse ids', () => {
  it('pairs a coarse id back with the model it came from', () => {
    expect(fullIdOf(coarseIdOf('hotel'))).toBe('hotel');
    expect(fullIdOf('hotel')).toBeNull();
  });
});

describe('coarseScratchModelOf', () => {
  it('meshes at coarse width, scales back up, and colours by the full model', () => {
    const model = coarseScratchModelOf({ id: 'hut', width: 5, voxels: cube(4, 3) });
    expect(model).toMatchObject({ id: coarseIdOf('hut'), width: 3, scale: 2, source: 'hut' });
    expect(model.voxels).toHaveLength(8);
  });
});
