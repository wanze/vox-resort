import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement } from '../../layout/domain/resortLayout';
import { outlookFor, type OutlookParts } from './outlook';

// Wide enough for the diagonals from the plateau to reach the sea inside the plot.
const TILES_X = 80;

const TILES_Z = 50;

// A plateau at level 4 above a dune stepping down to a beach at level 0, and the sea from row 36.
const levelOf = (_tileX: number, tileZ: number): number =>
  tileZ < 20 ? 4 : tileZ < 23 ? 3 : tileZ < 26 ? 2 : tileZ < 29 ? 1 : 0;

const isSea = (_tileX: number, tileZ: number): boolean => tileZ >= 36;

const tall = (tileX: number, tileZ: number): Placement => ({
  key: `palm#${tileX},${tileZ}`,
  id: 'palm',
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: tileX * 16,
  z: tileZ * 16,
  y: 0,
  width: 16,
  depth: 16,
});

const outlookOn = (standing: readonly Placement[], parts: Partial<OutlookParts> = {}) =>
  outlookFor({
    tilesX: TILES_X,
    tilesZ: TILES_Z,
    levelOf,
    isSea,
    standing,
    topOf: () => 3 * LEVEL_VOXELS,
    ...parts,
  });

const at = (x: number, z: number) => z * TILES_X + x;

describe('outlookFor', () => {
  it('sees the sea across open sand, straight ahead and on both diagonals', () => {
    const outlook = outlookOn([]);
    expect(outlook.horizon[at(40, 33)]).toBe(1);
    expect(outlook.horizon[at(40, 19)]).toBe(1);
    expect(outlook.horizonHeading[at(40, 33)]).toBe(0);
  });

  it('loses the line a palm stands in, from the beach but not from the plateau above it', () => {
    const outlook = outlookOn([tall(40, 34)]);
    expect(outlook.horizon[at(40, 33)]).toBeCloseTo(2 / 3);
    expect(Math.abs(outlook.horizonHeading[at(40, 33)]!)).toBeCloseTo(Math.PI / 4);
    expect(outlookOn([tall(40, 30)]).horizon[at(40, 19)]).toBe(1);
  });

  it('fades the sea with distance and sees nothing far inland', () => {
    const far = outlookOn([], {
      tilesZ: 120,
      isSea: (_tileX, tileZ) => tileZ >= 110,
      levelOf: () => 0,
    });
    const tile = (z: number) => z * TILES_X + 40;
    expect(far.horizon[tile(85)]).toBe(1);
    expect(far.horizon[tile(55)]).toBeGreaterThan(0);
    expect(far.horizon[tile(55)]).toBeLessThan(1);
    expect(far.horizon[tile(20)]).toBe(0);
    expect(Number.isNaN(far.horizonHeading[tile(20)]!)).toBe(true);
  });

  it('sees no sea where there is none', () => {
    const outlook = outlookOn([], { isSea: () => false });
    expect(outlook.horizon.every((seen) => seen === 0)).toBe(true);
  });

  it('overlooks the dune from the edge of the plateau, not from its middle or the beach', () => {
    const outlook = outlookOn([]);
    expect(outlook.overlook[at(40, 19)]).toBe(1);
    expect(outlook.overlook[at(40, 21)]).toBeCloseTo(0.75);
    expect(outlook.overlook[at(40, 2)]).toBe(0);
    expect(outlook.overlook[at(40, 33)]).toBe(0);
  });

  it('faces down the slope, and has no downhill on the flat', () => {
    const outlook = outlookOn([]);
    expect(outlook.downhill[at(40, 22)]).toBeCloseTo(0);
    expect(Number.isNaN(outlook.downhill[at(40, 2)]!)).toBe(true);
  });
});
