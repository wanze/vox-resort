import { describe, expect, it } from 'vitest';
import { derivedKey, place, type LayoutItem } from '../../layout/domain/resortLayout';
import { demolishAt } from './demolish';
import { createTileOccupancy } from './tileOccupancy';

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * 16,
  depth: tilesZ * 16,
});

const plot = () =>
  createTileOccupancy([
    place(item('cottage', 2, 3), 'cottage#0', 4, 4),
    place(item('path'), derivedKey('path', 1, 1), 1, 1),
  ]);

describe('demolishAt', () => {
  it('names the placement standing on a tile', () => {
    expect(demolishAt({ x: 1, z: 1 }, plot())).toBe('path@1,1');
  });

  it('names the same placement from any tile of its footprint', () => {
    const occupancy = plot();
    const answers = [
      { x: 4, z: 4 },
      { x: 5, z: 4 },
      { x: 4, z: 6 },
      { x: 5, z: 6 },
    ].map((tile) => demolishAt(tile, occupancy));
    expect(answers).toEqual(['cottage#0', 'cottage#0', 'cottage#0', 'cottage#0']);
  });

  it('takes nothing from a tile nothing stands on', () => {
    expect(demolishAt({ x: 2, z: 2 }, plot())).toBeNull();
  });

  it('takes nothing from a tile off the plot', () => {
    expect(demolishAt({ x: -1, z: 400 }, plot())).toBeNull();
  });
});
