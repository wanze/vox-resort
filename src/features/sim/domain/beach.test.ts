import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { walkNetworkFor, type PavedTile } from '../../crowd/domain/walkNetwork';
import { shoreFor } from '../../layout/domain/shoreline';
import { beachVenueFor, isBeach } from './beach';
import type { Venue } from './venues';

// Water from z = 18; six rows of sand in front of it, so z = 12..17 is beach.
const shore = shoreFor({ tilesX: 20, tilesZ: 20, shore: { inset: 1, beach: 6, wave: 0, seed: 1 } });

/** A boardwalk running south down the plot and out onto the sand, at column `tileX`. */
const boardwalk = (tileX: number): PavedTile[] =>
  Array.from({ length: 8 }, (_, index) => ({ tileX, tileZ: 10 + index, y: 0 }));

describe('beachVenueFor', () => {
  it('is nothing on a plot with no beach, or no way onto it', () => {
    expect(
      beachVenueFor(
        walkNetworkFor({ paved: boardwalk(10), levelOf: () => 0, shore: null, tilesX: 20 }),
      ),
    ).toBeNull();
    const inland: PavedTile[] = [{ tileX: 3, tileZ: 2, y: 0 }];
    expect(
      beachVenueFor(walkNetworkFor({ paved: inland, levelOf: () => 0, shore, tilesX: 20 })),
    ).toBeNull();
  });

  it('is somewhere for fun and a rest, that nobody is ever turned away from', () => {
    const network = walkNetworkFor({
      paved: [...boardwalk(4), ...boardwalk(14)],
      levelOf: () => 0,
      shore,
      tilesX: 20,
    });
    expect(network.gates.length).toBeGreaterThan(1);
    const beach = beachVenueFor(network)!;
    expect(beach.label).toBe('Beach');
    expect(beach.satisfies.map((relief) => relief.need).toSorted()).toEqual(['energy', 'fun']);
    expect(beach.capacity).toBeGreaterThan(10_000);
    expect(beach.dwellSeconds.min).toBeGreaterThanOrEqual(30 * 60);
    // Between the two boardwalks: the middle of the gates, not of either one.
    expect(beach.x).toBeGreaterThan(4 * TILE_VOXELS);
    expect(beach.x).toBeLessThan(15 * TILE_VOXELS);
  });
});

describe('isBeach', () => {
  it('tells the beach from a building, whatever the building is called', () => {
    const network = walkNetworkFor({ paved: boardwalk(10), levelOf: () => 0, shore, tilesX: 20 });
    const beach = beachVenueFor(network)!;
    expect(isBeach(beach)).toBe(true);
    const club: Venue = { ...beach, key: 'beach-club#0', id: 'beach-club', label: 'Beach Club' };
    expect(isBeach(club)).toBe(false);
  });
});
