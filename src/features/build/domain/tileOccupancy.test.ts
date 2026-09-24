import { describe, expect, it } from 'vitest';
import { place, type LayoutItem } from '../../layout/domain/resortLayout';
import { createTileOccupancy, footprintTiles } from './tileOccupancy';

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * 16,
  depth: tilesZ * 16,
});

const PATH = item('path');
const COTTAGE = item('cottage', 2, 3);

describe('footprintTiles', () => {
  it('covers a one-tile footprint with its own tile', () => {
    expect(footprintTiles({ tileX: 3, tileZ: 4, tilesX: 1, tilesZ: 1 })).toEqual([{ x: 3, z: 4 }]);
  });

  it('covers every tile of a larger footprint', () => {
    const tiles = footprintTiles({ tileX: 1, tileZ: 1, tilesX: 2, tilesZ: 3 });
    expect(tiles).toHaveLength(6);
    expect(tiles).toContainEqual({ x: 2, z: 3 });
    expect(tiles).not.toContainEqual({ x: 3, z: 1 });
  });
});

describe('createTileOccupancy', () => {
  it('starts empty', () => {
    const occupancy = createTileOccupancy();
    expect(occupancy.size).toBe(0);
    expect(occupancy.isFree(place(PATH, 'path@0,0', 0, 0))).toBe(true);
  });

  it('indexes every tile a seeded placement covers', () => {
    const occupancy = createTileOccupancy([place(COTTAGE, 'cottage', 4, 4)]);
    expect(occupancy.size).toBe(6);
    expect(occupancy.keyAt({ x: 5, z: 6 })).toBe('cottage');
    expect(occupancy.keyAt({ x: 6, z: 6 })).toBeUndefined();
  });

  it('refuses a footprint that overlaps one tile of another', () => {
    const occupancy = createTileOccupancy([place(COTTAGE, 'cottage', 4, 4)]);
    expect(occupancy.isFree(place(item('street-lamp'), 'lamp', 5, 6))).toBe(false);
    expect(occupancy.isFree(place(item('street-lamp'), 'lamp', 6, 6))).toBe(true);
  });

  it('names what is in the way when a claim collides', () => {
    const occupancy = createTileOccupancy([place(COTTAGE, 'cottage', 4, 4)]);
    expect(() => occupancy.claim(place(PATH, 'path@5,5', 5, 5), 'path@5,5')).toThrow(/cottage/);
  });

  it('leaves nothing claimed when a claim is refused', () => {
    const occupancy = createTileOccupancy([place(PATH, 'path@1,0', 1, 0)]);
    expect(() => occupancy.claim(place(COTTAGE, 'cottage', 0, 0), 'cottage')).toThrow();
    expect(occupancy.keyAt({ x: 0, z: 0 })).toBeUndefined();
    expect(occupancy.size).toBe(1);
  });

  it("frees a footprint's tiles again", () => {
    const occupancy = createTileOccupancy();
    const cottage = place(COTTAGE, 'cottage', 2, 2);
    occupancy.claim(cottage, 'cottage');
    occupancy.release(cottage, 'cottage');
    expect(occupancy.size).toBe(0);
    expect(occupancy.isFree(cottage)).toBe(true);
  });

  it('ignores a release of tiles something else holds', () => {
    const occupancy = createTileOccupancy([place(PATH, 'path@0,0', 0, 0)]);
    occupancy.release(place(PATH, 'path@0,0', 0, 0), 'hedge@0,0');
    expect(occupancy.keyAt({ x: 0, z: 0 })).toBe('path@0,0');
  });

  it('rejects a resort that stands two things on one tile', () => {
    expect(() =>
      createTileOccupancy([place(PATH, 'path@0,0', 0, 0), place(PATH, 'hedge@0,0', 0, 0)]),
    ).toThrow(/0,0/);
  });
});

describe('ground nothing is standing on', () => {
  it('is free, whatever the ground under it happens to be', () => {
    const occupancy = createTileOccupancy();
    expect(occupancy.isFree({ tileX: 3, tileZ: 4, tilesX: 1, tilesZ: 1 })).toBe(true);
    expect(occupancy.keyAt({ x: 3, z: 4 })).toBeUndefined();
    expect(occupancy.size).toBe(0);
  });
});
