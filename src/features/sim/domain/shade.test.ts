import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement } from '../../layout/domain/resortLayout';
import { shadedAt, shadeMapOf } from './shade';

const at = (id: string, tileX: number, tileZ: number, tiles = 2): Placement => ({
  key: `${id}#0`,
  id,
  tileX,
  tileZ,
  tilesX: tiles,
  tilesZ: tiles,
  rotation: 0,
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  width: tiles * TILE_VOXELS,
  depth: tiles * TILE_VOXELS,
});

const shades = (id: string): boolean => id === 'shade-sail';

const middleOf = (tile: number): number => (tile + 0.5) * TILE_VOXELS;

describe('shadeMapOf', () => {
  it('shades the four tiles under a 2x2 sail and nothing else', () => {
    const shade = shadeMapOf([at('shade-sail', 3, 5)], shades, 20);
    expect([...shade.tiles].toSorted((a, b) => a - b)).toEqual([103, 104, 123, 124]);
    for (let tileZ = 2; tileZ < 9; tileZ++) {
      for (let tileX = 0; tileX < 8; tileX++) {
        const under = tileX >= 3 && tileX <= 4 && tileZ >= 5 && tileZ <= 6;
        expect(shadedAt(shade, middleOf(tileX), middleOf(tileZ)), `${tileX},${tileZ}`).toBe(under);
      }
    }
  });

  it('shades the same tiles under a turned sail', () => {
    const straight = shadeMapOf([at('shade-sail', 3, 5)], shades, 20);
    const turned = shadeMapOf([{ ...at('shade-sail', 3, 5), rotation: 1 }], shades, 20);
    expect(turned.tiles).toEqual(straight.tiles);
  });

  it('is empty with no shade model on the plot', () => {
    const shade = shadeMapOf([at('sun_lounger', 3, 5, 1), at('resort-bar', 8, 8)], shades, 20);
    expect(shade.tiles.size).toBe(0);
    expect(shadedAt(shade, middleOf(3), middleOf(5))).toBe(false);
    expect(shadedAt(null, middleOf(3), middleOf(5))).toBe(false);
  });
});
