import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { shoreFor } from '../../layout/domain/shoreline';
import { blockedAt, clearLine, sandGridFor } from './sandGrid';

// Water from z = 18; six rows of sand in front of it, so z = 12..17 is beach.
const shore = shoreFor({
  tilesX: 20,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
})!;

/** A lounger-sized box in the middle of the sand. */
const BOX = { x: 5 * TILE_VOXELS, z: 14 * TILE_VOXELS, width: 8, depth: 4 };

const grid = sandGridFor({ shore, tilesX: 20, obstacles: [BOX] });

describe('sandGridFor', () => {
  it('covers the whole band of sand and nothing inland of it', () => {
    expect(grid.originZ).toBe(12 * TILE_VOXELS);
    expect(grid.rows * 2).toBe(6 * TILE_VOXELS);
    expect(grid.columns * 2).toBe(20 * TILE_VOXELS);
  });

  it('blocks the box, grown by the width of a body, and leaves the rest open', () => {
    expect(blockedAt(grid, BOX.x + 4, BOX.z + 2)).toBe(true);
    expect(blockedAt(grid, BOX.x - 1, BOX.z + 2), 'a shoulder would be in it').toBe(true);
    expect(blockedAt(grid, BOX.x + 20, BOX.z + 2)).toBe(false);
    expect(blockedAt(grid, BOX.x + 4, BOX.z + 12)).toBe(false);
  });

  it('ignores anything that does not reach the sand', () => {
    const inland = sandGridFor({
      shore,
      tilesX: 20,
      obstacles: [{ x: 16, z: 16, width: 32, depth: 32 }],
    });
    expect(inland.cells.every((cell) => cell === 0)).toBe(true);
    expect(blockedAt(inland, 20, 20), 'outside the band is never blocked').toBe(false);
  });
});

describe('clearLine', () => {
  const west = { x: BOX.x - 20, z: BOX.z + 2 };
  const east = { x: BOX.x + 30, z: BOX.z + 2 };

  it('refuses a line through a box', () => {
    expect(clearLine(grid, west.x, west.z, east.x, east.z)).toBe(false);
  });

  it('allows a line that passes it by', () => {
    expect(clearLine(grid, west.x, west.z + 12, east.x, east.z + 12)).toBe(true);
  });

  it('does not ask about the ends it is told to skip', () => {
    const inside = { x: BOX.x + 4, z: BOX.z + 2 };
    expect(clearLine(grid, inside.x, inside.z, east.x, east.z)).toBe(false);
    expect(clearLine(grid, inside.x, inside.z, east.x, east.z, 10)).toBe(true);
    expect(clearLine(grid, east.x, east.z, inside.x, inside.z, 0, 10)).toBe(true);
  });
});
