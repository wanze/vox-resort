import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { beachTilesOf, shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { launchSitesFor, ownedBeachTiles, sandOf, watchRoom } from './launch';

const shore = shoreFor({
  tilesX: 80,
  tilesZ: 40,
  shore: { inset: 3, beach: 6, wave: 2, seed: 4 },
})!;

const WHOLE = { from: 0, to: 80 };

describe('ownedBeachTiles', () => {
  it('counts the sand in the owned columns, as the list of beach tiles does', () => {
    expect(ownedBeachTiles(shore, WHOLE)).toBe(beachTilesOf(shore).length);
    const part = beachTilesOf(shore).filter((tile) => tile.x >= 10 && tile.x < 30).length;
    expect(ownedBeachTiles(shore, { from: 10, to: 30 })).toBe(part);
    expect(ownedBeachTiles(null, WHOLE)).toBe(0);
  });
});

describe('launchSitesFor', () => {
  it('has nowhere to launch from without a shore', () => {
    expect(launchSitesFor(null, WHOLE)).toEqual([]);
  });

  it('launches from the water, out beyond the sand', () => {
    const sites = launchSitesFor(shore, WHOLE);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      const tileX = Math.floor(site.x / TILE_VOXELS);
      const tileZ = Math.floor(site.z / TILE_VOXELS);
      expect(tileZ >= shore.tilesZ || terrainAt(shore, tileX, tileZ) === 'water').toBe(true);
    }
  });

  it('keeps to the owned columns', () => {
    for (const site of launchSitesFor(shore, { from: 20, to: 36 })) {
      expect(site.x).toBeGreaterThanOrEqual(20 * TILE_VOXELS);
      expect(site.x).toBeLessThan(36 * TILE_VOXELS);
    }
  });

  it('uses fewer sites on a narrow beach, but always one', () => {
    expect(launchSitesFor(shore, WHOLE)).toHaveLength(5);
    expect(launchSitesFor(shore, { from: 20, to: 36 })).toHaveLength(2);
    expect(launchSitesFor(shore, { from: 20, to: 23 })).toHaveLength(1);
  });
});

describe('sandOf', () => {
  it('counts the sand and the sites in the band the guests roam, and nothing with no beach', () => {
    const band = { shore, tilesX: 80, span: { from: 10, to: 30 } };
    expect(sandOf(band)).toEqual({
      beachTiles: ownedBeachTiles(shore, band.span),
      launchSites: launchSitesFor(shore, band.span),
    });
    expect(sandOf(null)).toEqual({ beachTiles: 0, launchSites: [] });
  });
});

describe('watchRoom', () => {
  it('gives two people a tile, up to a cap', () => {
    expect(watchRoom(0)).toBe(0);
    expect(watchRoom(40)).toBe(80);
    expect(watchRoom(10_000)).toBe(360);
  });
});
