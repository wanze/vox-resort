import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { TerrainEdit } from '../../layout/domain/terrain';
import { islandBoxesFor } from './islands';

// The sea starts at row 10.
const terrainOf = (edits: readonly TerrainEdit[]) => ({
  edits,
  isSea: (_tileX: number, tileZ: number) => tileZ >= 10,
});

const raised = (tileX: number, tileZ: number, level = 1): TerrainEdit => ({
  tileX,
  tileZ,
  level,
  surface: 'sand',
});

describe('islandBoxesFor', () => {
  it('boxes each island whole, joining tiles that only touch at a corner', () => {
    const boxes = islandBoxesFor(terrainOf([raised(3, 12), raised(4, 13), raised(4, 12, 2)]));
    expect(boxes).toEqual([
      {
        minX: 3 * TILE_VOXELS,
        maxX: 5 * TILE_VOXELS,
        minZ: 12 * TILE_VOXELS,
        maxZ: 14 * TILE_VOXELS,
      },
    ]);
  });

  it('gives islands apart a box each', () => {
    expect(islandBoxesFor(terrainOf([raised(3, 12), raised(9, 12)]))).toHaveLength(2);
  });

  it('leaves out raised land, lowered sea and anything flooded', () => {
    const edits = [
      raised(3, 4),
      raised(3, 12, 0),
      { tileX: 5, tileZ: 12, level: 0, surface: 'water' } as const,
    ];
    expect(islandBoxesFor(terrainOf(edits))).toEqual([]);
  });
});
