import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement } from '../../layout/domain/resortLayout';
import { reliefAt, shelterOf, venuesOn, type Venue } from './venues';

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

const only = (placements: readonly Placement[]): Venue => {
  const venues = venuesOn(placements);
  expect(venues).toHaveLength(1);
  return venues[0]!;
};

describe('venuesOn', () => {
  it('copies the bakery its own numbers off the art', () => {
    const venue = only([at('bakery#0', 'bakery')]);
    expect(venue.key).toBe('bakery#0');
    expect(venue.id).toBe('bakery');
    expect(venue.label).toBe('Bakery');
    expect(venue.role).toBe('food');
    expect(venue.satisfies).toEqual([{ need: 'hunger', amount: 0.5 }]);
    expect(venue.capacity).toBe(8);
    expect(venue.dwellSeconds).toEqual({ min: 240, max: 480 });
  });

  it('measures to the middle of the footprint, not to the corner it was drawn from', () => {
    const venue = only([at('bakery#0', 'bakery', 4, 6, 3)]);
    expect(venue.x).toBe(4 * TILE_VOXELS + (3 * TILE_VOXELS) / 2);
    expect(venue.z).toBe(6 * TILE_VOXELS + (3 * TILE_VOXELS) / 2);
  });

  it('carries the footprint as tiles, which is what a door is found from', () => {
    const venue = only([
      { ...at('bakery#0', 'bakery', 4, 6), tilesX: 2, tilesZ: 3, width: 2 * TILE_VOXELS },
    ]);
    expect(venue.tileX).toBe(4);
    expect(venue.tileZ).toBe(6);
    expect(venue.tilesX).toBe(2);
    expect(venue.tilesZ).toBe(3);
  });

  it('puts the bakery door in world voxels, on the shopfront it was drawn in', () => {
    const venue = only([at('bakery#0', 'bakery', 4, 6, 2)]);
    expect(venue.doors).toEqual([{ x: 4 * TILE_VOXELS + 8, z: 6 * TILE_VOXELS + 18, facing: 0 }]);
  });

  it('turns the door with the bakery, onto the side the shopfront now faces', () => {
    const venue = only([{ ...at('bakery#0', 'bakery', 4, 6, 2), rotation: 1 }]);
    const [door] = venue.doors;
    expect(door!.facing).toBe(1);
    expect(door!.x - 4 * TILE_VOXELS).toBeGreaterThan(TILE_VOXELS);
    expect(door).toEqual({ x: 4 * TILE_VOXELS + 18, z: 6 * TILE_VOXELS + 32 - 8, facing: 1 });
  });

  it('gives a venue whose art declares no door an empty list rather than nothing', () => {
    const venue = only([at('volleyball#0', 'volleyball')]);
    expect(venue.doors).toEqual([]);
  });

  it('finds nothing to do on a plot of palms and benches', () => {
    expect(venuesOn([at('palm#0', 'palm'), at('bench#0', 'bench', 2, 0)])).toEqual([]);
  });

  it('leaves lodging out: a bed is not somewhere to walk to in the daytime', () => {
    const venues = venuesOn([at('bungalow#0', 'bungalow'), at('bakery#0', 'bakery', 5, 0)]);
    expect(venues.map((venue) => venue.id)).toEqual(['bakery']);
  });

  it('keeps placement order, so an index means the same thing twice', () => {
    const plot = [at('restrooms#0', 'restrooms'), at('bakery#0', 'bakery', 5, 0)];
    expect(venuesOn(plot).map((venue) => venue.key)).toEqual(['restrooms#0', 'bakery#0']);
    expect(venuesOn(plot.toReversed()).map((venue) => venue.key)).toEqual([
      'bakery#0',
      'restrooms#0',
    ]);
  });
});

describe('reliefAt', () => {
  it('hands back what the art declared for a need it serves', () => {
    expect(reliefAt(only([at('bakery#0', 'bakery')]), 'hunger')).toBe(0.5);
  });

  it('is zero for a need the place does not serve at all', () => {
    expect(reliefAt(only([at('bakery#0', 'bakery')]), 'fun')).toBe(0);
  });

  it('carries the check-in desk of the reception off the art, and nobody else', () => {
    expect(only([at('reception#0', 'reception', 0, 0, 4)]).receives).toBe(true);
    expect(only([at('bakery#0', 'bakery')]).receives).toBe(false);
  });

  it("keeps basketball's negative energy, because an hour of it is tiring", () => {
    const court = only([at('basketball-court#0', 'basketball-court')]);
    expect(reliefAt(court, 'fun')).toBe(0.8);
    expect(reliefAt(court, 'energy')).toBe(-0.4);
  });
});

describe('shelterOf', () => {
  it("carries a roofless model's own declaration onto its venue", () => {
    expect(shelterOf(only([at('swimming-pool', 'swimming-pool', 0, 0, 8)]))).toBe('open');
    expect(shelterOf(only([at('tennis-court#0', 'tennis-court', 0, 0, 9)]))).toBe('open');
  });

  it('leaves a model that declares nothing under cover', () => {
    expect(shelterOf(only([at('bakery#0', 'bakery', 0, 0, 2)]))).toBe('covered');
    expect(shelterOf(only([at('restaurant#0', 'restaurant', 0, 0, 4)]))).toBe('covered');
  });

  it('reads a venue that was built before there was any weather as covered', () => {
    const bare = { ...only([at('bakery#0', 'bakery', 0, 0, 2)]) } as Venue;
    delete (bare as { shelter?: unknown }).shelter;
    expect(shelterOf(bare)).toBe('covered');
  });
});
