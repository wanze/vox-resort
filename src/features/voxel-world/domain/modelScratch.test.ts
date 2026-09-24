import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
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

const xsOf = (positions: Int32Array): number[] => [...positions].filter((_, at) => at % 3 === 0);

describe('scratchLayoutFor', () => {
  it('starts the first model at the origin', () => {
    const { regions } = scratchLayoutFor([model('a', 16, 1)], voxelIdOf, SECTION);
    expect(regions[0]).toEqual({ id: 'a', x: 0, endX: 16 });
  });

  it('carries a scaled copy’s scale and source onto its region', () => {
    const { regions } = scratchLayoutFor(
      [{ ...model('a~coarse', 8, 1), scale: 2, source: 'a' }],
      voxelIdOf,
      SECTION,
    );
    expect(regions[0]).toEqual({ id: 'a~coarse', x: 0, endX: 16, scale: 2, source: 'a' });
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
    expect(xsOf(writes.positions).filter((x) => x >= 32)).toEqual([32, 33]);
  });

  it('packs every voxel in order, offset by its region', () => {
    const shaped: ScratchModel = {
      id: 'b',
      width: 8,
      voxels: [
        { x: 1, y: 2, z: 3, color: 0x010101 },
        { x: 7, y: 0, z: 5, color: 0x020202 },
      ],
    };
    const { writes } = scratchLayoutFor([model('a', 16, 1), shaped], voxelIdOf, SECTION);
    expect([...writes.positions]).toEqual([0, 0, 0, 33, 2, 3, 39, 0, 5]);
    expect(writes.voxelIds).toBeInstanceOf(Uint16Array);
    expect(writes.voxelIds).toHaveLength(3);
  });

  it('resolves every voxel colour to a voxel id', () => {
    const { writes } = scratchLayoutFor([model('a', 4, 1)], voxelIdOf, SECTION);
    expect(writes.palette[writes.voxelIds[0]!]).toBe('vox_1122867');
  });

  it('keeps one palette entry per distinct colour, in first-seen order', () => {
    const colors = [0x30, 0x10, 0x30, 0x20, 0x10];
    const painted: ScratchModel = {
      id: 'a',
      width: 8,
      voxels: colors.map((color, x) => ({ x, y: 0, z: 0, color })),
    };
    const { writes } = scratchLayoutFor([painted], voxelIdOf, SECTION);
    expect(writes.palette).toEqual(['vox_48', 'vox_16', 'vox_32']);
    expect([...writes.voxelIds].map((index) => writes.palette[index])).toEqual(
      colors.map(voxelIdOf),
    );
  });

  it('asks for an id once per distinct colour, not once per voxel', () => {
    let asked = 0;
    const counting = (color: number): string => {
      asked++;
      return voxelIdOf(color);
    };
    const models = [model('a', 4, 50), model('b', 4, 50)];
    scratchLayoutFor(models, counting, SECTION);
    expect(asked).toBe(1);
  });

  it('shares a palette entry between colours that name the same id', () => {
    const painted: ScratchModel = {
      id: 'a',
      width: 4,
      voxels: [
        { x: 0, y: 0, z: 0, color: 0x10 },
        { x: 1, y: 0, z: 0, color: 0x20 },
      ],
    };
    const { writes } = scratchLayoutFor([painted], () => 'same', SECTION);
    expect(writes.palette).toEqual(['same']);
    expect([...writes.voxelIds]).toEqual([0, 0]);
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

  it('gives a model with no voxels a region and no writes', () => {
    const { regions, writes } = scratchLayoutFor(
      [model('a', 16, 1), { id: 'empty', width: 16, voxels: [] }],
      voxelIdOf,
      SECTION,
    );
    expect(regions[1]).toEqual({ id: 'empty', x: 32, endX: 48 });
    expect(writes.voxelIds).toHaveLength(1);
    expect(writes.positions).toHaveLength(3);
  });

  it('refuses more distinct ids than a palette index can hold', () => {
    const voxels: PaintedVoxel[] = Array.from({ length: 0x1_0001 }, (_, color) => ({
      x: 0,
      y: 0,
      z: 0,
      color,
    }));
    expect(() => scratchLayoutFor([{ id: 'a', width: 1, voxels }], voxelIdOf, SECTION)).toThrow(
      /cannot be packed/,
    );
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
