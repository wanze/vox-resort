import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement } from '../../layout/domain/resortLayout';
import { lodgingFor, lodgingsOn } from './lodgings';

const at = (key: string, id: string, tileX = 0, tileZ = 0, tiles = 1): Placement => ({
  key,
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

describe('lodgingsOn', () => {
  it('keeps the bungalow and leaves the bakery to the venues', () => {
    const lodgings = lodgingsOn([at('bungalow#0', 'bungalow'), at('bakery#0', 'bakery', 5, 0)]);
    expect(lodgings.map((lodging) => lodging.key)).toEqual(['bungalow#0']);
  });

  it('reads the beds and the length of a night off the art', () => {
    const [bungalow] = lodgingsOn([at('bungalow#0', 'bungalow')]);
    expect(bungalow!.label).toBe('Bungalow');
    expect(bungalow!.beds).toBe(4);
    expect(bungalow!.dwellSeconds).toEqual({ min: 25_200, max: 32_400 });
    expect(bungalow!.doors.length).toBeGreaterThan(0);
  });

  it('carries the footprint and measures to its middle', () => {
    const [bungalow] = lodgingsOn([
      { ...at('bungalow#0', 'bungalow', 4, 6, 2), tilesZ: 3, depth: 3 * TILE_VOXELS },
    ]);
    expect(bungalow).toMatchObject({ tileX: 4, tileZ: 6, tilesX: 2, tilesZ: 3 });
    expect(bungalow!.x).toBe(4 * TILE_VOXELS + TILE_VOXELS);
    expect(bungalow!.z).toBe(6 * TILE_VOXELS + (3 * TILE_VOXELS) / 2);
  });
});

describe('lodgingFor', () => {
  it('finds a home by its key, and says -1 for one that is not standing', () => {
    const lodgings = lodgingsOn([at('hotel#0', 'hotel', 0, 0, 4), at('bungalow#2', 'bungalow', 8)]);
    expect(lodgingFor(lodgings, 'bungalow#2')).toBe(1);
    expect(lodgingFor(lodgings, 'hotel#0')).toBe(0);
    expect(lodgingFor(lodgings, 'bungalow#9')).toBe(-1);
  });
});
