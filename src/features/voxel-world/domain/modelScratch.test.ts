import { describe, expect, it } from 'vitest';
import { regionOwning, scratchLayoutFor, type ScratchModel } from './modelScratch';

const SECTION = { x: 16, y: 16, z: 16 };
const voxelIdOf = (color: number): string => `vox_${color}`;

const model = (id: string, width: number, voxels: number): ScratchModel => ({
  id,
  width,
  voxels: Array.from({ length: voxels }, (_, index) => ({
    x: index % width,
    y: 0,
    z: 0,
    color: 0x112233,
  })),
});

describe('scratchLayoutFor', () => {
  it('starts the first model at the origin', () => {
    const { regions } = scratchLayoutFor([model('a', 16, 1)], voxelIdOf, SECTION);
    expect(regions[0]).toEqual({ id: 'a', x: 0, endX: 16 });
  });

  it('rounds a region up to whole sections', () => {
    const { regions } = scratchLayoutFor([model('a', 20, 1)], voxelIdOf, SECTION);
    expect(regions[0]?.endX).toBe(32);
  });

  it('leaves an empty section between models so neither culls the other', () => {
    const { regions } = scratchLayoutFor(
      [model('a', 16, 1), model('b', 16, 1)],
      voxelIdOf,
      SECTION,
    );
    expect(regions[1]?.x).toBe(32); // 16 of model a, then 16 of padding
  });

  it("shifts a model's voxels into its own region", () => {
    const { writes } = scratchLayoutFor([model('a', 16, 1), model('b', 4, 2)], voxelIdOf, SECTION);
    expect(writes.filter((write) => write.x >= 32).map((write) => write.x)).toEqual([32, 33]);
  });

  it('resolves every voxel colour to a voxel id', () => {
    const { writes } = scratchLayoutFor([model('a', 4, 1)], voxelIdOf, SECTION);
    expect(writes[0]?.voxelId).toBe('vox_1122867');
  });

  it('reports the span the whole catalogue needs', () => {
    const { extentX } = scratchLayoutFor(
      [model('a', 16, 1), model('b', 33, 1)],
      voxelIdOf,
      SECTION,
    );
    expect(extentX).toBe(16 + 16 + 48 + 16);
  });

  it('gives a model with no width a region of its own anyway', () => {
    const { regions } = scratchLayoutFor([{ id: 'a', width: 0, voxels: [] }], voxelIdOf, SECTION);
    expect(regions[0]).toEqual({ id: 'a', x: 0, endX: 16 });
  });
});

describe('regionOwning', () => {
  const regions = scratchLayoutFor(
    [model('a', 16, 1), model('b', 16, 1)],
    voxelIdOf,
    SECTION,
  ).regions;

  it('finds the region a section origin falls in', () => {
    expect(regionOwning(regions, 0)?.id).toBe('a');
    expect(regionOwning(regions, 32)?.id).toBe('b');
  });

  it('finds nothing in the padding between two models', () => {
    expect(regionOwning(regions, 16)).toBeUndefined();
  });
});
