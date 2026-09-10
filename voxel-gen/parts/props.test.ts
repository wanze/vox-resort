import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { flowerBox, parasol, pottedPlant } from './props.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

describe('pottedPlant', () => {
  it('stands greenery in a rimmed terracotta pot', () => {
    const b = new VoxelBuilder();
    pottedPlant(b, { x: 0, z: 0, y: 3 });
    expect(at(b, 0, 3, 0)).toBe(PALETTE.terracotta.shade);
    expect(at(b, 1, 5, 1)).toBe(PALETTE.terracotta.base);
    expect(at(b, 0, 6, 0)).toBe(PALETTE.foliage.base);
    expect(at(b, 0, 8, 0)).toBe(PALETTE.foliage.light);
    expect(at(b, 0, 9, 0)).toBeUndefined();
  });

  it('takes the size it is given, and refuses none at all', () => {
    const b = new VoxelBuilder();
    pottedPlant(b, { x: 0, z: 0, y: 0, size: 3 });
    expect(at(b, 2, 0, 2)).toBe(PALETTE.terracotta.shade);
    expect(at(b, 3, 0, 3)).toBeUndefined();
    expect(() => pottedPlant(new VoxelBuilder(), { x: 0, z: 0, y: 0, size: 0 })).toThrow(
      /one voxel/,
    );
  });
});

describe('flowerBox', () => {
  it('runs a planter along the axis it is given, blooming on top', () => {
    const b = new VoxelBuilder();
    flowerBox(b, { x: 0, z: 5, y: 3, w: 4, along: 'x' });
    expect(at(b, 0, 3, 5)).toBe(PALETTE.teak.deep);
    expect(at(b, 3, 4, 5)).toBe(PALETTE.teak.deep);
    expect(at(b, 4, 4, 5)).toBeUndefined();
    expect(at(b, 0, 5, 5)).toBe(PALETTE.bloom.base);
    expect(at(b, 1, 5, 5)).toBe(PALETTE.amber.base);
    expect(at(b, 2, 5, 5)).toBe(PALETTE.foliage.base);
    expect(at(b, 3, 5, 5)).toBe(PALETTE.bloom.base);
  });

  it('grows what it is given, so a long box can be planting rather than bunting', () => {
    const b = new VoxelBuilder();
    flowerBox(b, { x: 0, z: 0, y: 0, w: 3, along: 'x', blooms: [PALETTE.foliage.base] });
    for (const x of [0, 1, 2]) expect(at(b, x, 2, 0)).toBe(PALETTE.foliage.base);
    expect(() =>
      flowerBox(new VoxelBuilder(), { x: 0, z: 0, y: 0, w: 2, along: 'x', blooms: [] }),
    ).toThrow(/at least one thing/);
  });

  it('runs the other way too', () => {
    const b = new VoxelBuilder();
    flowerBox(b, { x: 2, z: 0, y: 0, w: 2, along: 'z' });
    expect(at(b, 2, 0, 1)).toBe(PALETTE.teak.deep);
    expect(at(b, 3, 0, 1)).toBeUndefined();
    expect(() => flowerBox(new VoxelBuilder(), { x: 0, z: 0, y: 0, w: 0, along: 'z' })).toThrow(
      /one voxel long/,
    );
  });
});

describe('parasol', () => {
  it('carries one flat square of canvas on a pole, with a finial over it', () => {
    const b = new VoxelBuilder();
    parasol(b, { x: 10, z: 10, y: 4 });
    for (let y = 4; y <= 11; y++) expect(at(b, 10, y, 10)).toBe(PALETTE.teak.base);
    for (const x of [8, 10, 12]) {
      for (const z of [8, 10, 12]) expect(at(b, x, 12, z)).toBe(PALETTE.amber.base);
    }
    expect(at(b, 7, 12, 10)).toBeUndefined();
    expect(at(b, 10, 13, 10)).toBe(PALETTE.teak.shade);
    expect(at(b, 10, 14, 10)).toBeUndefined();
  });

  it('keeps the canopy one plane however far it reaches', () => {
    // The whole reason this is a part: a dome of stepped rings is a shape
    // nobody reads from above and a pattern the mesher cannot merge.
    const b = new VoxelBuilder();
    parasol(b, { x: 20, z: 20, y: 0, height: 5, reach: 4 });
    expect(at(b, 16, 5, 16)).toBe(PALETTE.amber.base);
    expect(at(b, 24, 5, 24)).toBe(PALETTE.amber.base);
    expect(at(b, 20, 4, 20)).toBe(PALETTE.teak.base);
    expect(at(b, 16, 4, 16)).toBeUndefined();
    expect(at(b, 16, 6, 16)).toBeUndefined();
  });

  it('takes the timber and the canvas it is given, and refuses no pole at all', () => {
    const b = new VoxelBuilder();
    parasol(b, { x: 0, z: 0, y: 0, pole: PALETTE.metal, canvas: PALETTE.bloom });
    expect(at(b, 0, 0, 0)).toBe(PALETTE.metal.base);
    expect(at(b, 0, 8, 0)).toBe(PALETTE.bloom.base);
    expect(at(b, 0, 9, 0)).toBe(PALETTE.metal.shade);
    expect(() => parasol(new VoxelBuilder(), { x: 0, z: 0, y: 0, height: 0 })).toThrow(
      /one layer of pole/,
    );
    expect(() => parasol(new VoxelBuilder(), { x: 0, z: 0, y: 0, reach: 0 })).toThrow(
      /one voxel past/,
    );
  });
});
