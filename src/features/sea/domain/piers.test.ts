import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { shoreFor, waterStartZ } from '../../layout/domain/shoreline';
import { pierBoxesFor } from './piers';

const shore = shoreFor({
  tilesX: 20,
  tilesZ: 30,
  shore: { inset: 10, beach: 4, wave: 0, seed: 2 },
})!;
const water = waterStartZ(shore, 0);

/** A lane down column `tileX`, from the sand out `pier` tiles over the water. */
const lane = (tileX: number, pier: number) =>
  Array.from({ length: 4 + pier }, (_, index) => ({ tileX, tileZ: water - 4 + index }));

describe('pierBoxesFor', () => {
  it('finds nothing on a plot with no sea', () => {
    expect(pierBoxesFor(null, lane(3, 6))).toEqual([]);
  });

  it('merges a pier into one box that starts at the tideline', () => {
    expect(pierBoxesFor(shore, lane(3, 6))).toEqual([
      {
        minX: 3 * TILE_VOXELS,
        maxX: 4 * TILE_VOXELS,
        minZ: water * TILE_VOXELS,
        maxZ: (water + 6) * TILE_VOXELS,
      },
    ]);
  });

  it('gives each lane its own box, whatever order the paving came in', () => {
    const boxes = pierBoxesFor(shore, [...lane(12, 6), ...lane(3, 5)].toReversed());
    expect(boxes.map((box) => box.minX)).toEqual([3 * TILE_VOXELS, 12 * TILE_VOXELS]);
  });
});
