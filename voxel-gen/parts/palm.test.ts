import { describe, expect, it } from 'vitest';
import { TILE_VOXELS, VoxelBuilder } from '../voxelgen.ts';
import { palmFrond } from './palm.ts';

const CROWN = 30;

function frondAt(turn: number, reach?: number): { x: number; y: number; z: number }[] {
  const b = new VoxelBuilder();
  const colours = { droop: 8, rib: 1, leaflet: 2, tip: 3 };
  palmFrond(
    b,
    [7.5, 7.5],
    CROWN,
    reach === undefined ? { turn, ...colours } : { turn, reach, ...colours },
  );
  const cells: { x: number; y: number; z: number }[] = [];
  for (let x = -4; x < TILE_VOXELS + 4; x++)
    for (let z = -4; z < TILE_VOXELS + 4; z++)
      for (let y = 0; y < CROWN + 8; y++) if (b.get(x, y, z) !== undefined) cells.push({ x, y, z });
  return cells;
}

describe('palmFrond', () => {
  it('runs out to the tile edge across a side and further across a corner, never past it', () => {
    const side = frondAt(0);
    const corner = frondAt(Math.PI / 4);
    for (const { x, z } of [...side, ...corner]) {
      expect(x >= 0 && x < TILE_VOXELS && z >= 0 && z < TILE_VOXELS).toBe(true);
    }
    expect(Math.max(...side.map(({ x }) => x))).toBe(TILE_VOXELS - 1);
    expect(Math.max(...corner.map(({ x, z }) => Math.min(x, z)))).toBeGreaterThanOrEqual(14);
  });

  it('hangs below the crown at its tip, as a frond does under its own weight', () => {
    const cells = frondAt(0);
    const tip = cells.reduce((far, cell) => (cell.x > far.x ? cell : far));
    expect(tip.y).toBeLessThan(CROWN);
  });

  it('keeps a short frond to its own length', () => {
    const cells = frondAt(0, 3.5);
    expect(Math.max(...cells.map(({ x }) => x))).toBeLessThanOrEqual(11);
  });
});
