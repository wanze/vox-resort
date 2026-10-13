import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { walkNetworkFor, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { TICKS_PER_DAY } from './simClock';
import {
  CALM_TILES,
  darknessAt,
  gloomAt,
  lightFieldFor,
  litAt,
  unlitStretchOf,
  type Glow,
} from './lamplight';

const HOUR = 60;

// A street lamp's light, hung over the middle of a tile.
const lamp = (tileX: number, tileZ: number, intensity = 90): Glow => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  intensity,
  distance: 46,
});

describe('lightFieldFor', () => {
  it('lights two tiles around a street lamp and nothing past its reach', () => {
    const field = lightFieldFor([lamp(5, 5)], 20, 20);
    expect(litAt(field, 5, 5)).toBe(1);
    expect(litAt(field, 7, 5)).toBe(1);
    expect(litAt(field, 7, 6)).toBe(1);
    expect(litAt(field, 7, 7)).toBeGreaterThan(0);
    expect(litAt(field, 7, 7)).toBeLessThan(1);
    expect(litAt(field, 8, 5)).toBe(0);
    expect(litAt(field, 0, 0)).toBe(0);
  });

  it('lights the whole path between two lamps five tiles apart', () => {
    const field = lightFieldFor([lamp(0, 0), lamp(5, 0)], 20, 20);
    for (let x = 0; x <= 5; x++) expect(litAt(field, x, 0), `${x}`).toBe(1);
  });

  it('lets a dim lantern reassure less than a street lamp', () => {
    const bright = lightFieldFor([lamp(5, 5)], 20, 20);
    const dim = lightFieldFor([lamp(5, 5, 45)], 20, 20);
    expect(litAt(dim, 7, 6)).toBeLessThan(litAt(bright, 7, 6));
  });

  it('keeps a light at the plot edge inside the grid', () => {
    const field = lightFieldFor([lamp(0, 0), lamp(19, 19)], 20, 20);
    expect(litAt(field, 0, 0)).toBe(1);
    expect(litAt(field, 19, 19)).toBe(1);
    expect(litAt(field, -1, 0)).toBe(0);
    expect(litAt(field, 20, 19)).toBe(0);
  });
});

describe('darknessAt', () => {
  it('is light by day and dark at night, across midnight', () => {
    expect(darknessAt(12 * HOUR)).toBe(0);
    expect(darknessAt(20 * HOUR)).toBe(0);
    expect(darknessAt(23 * HOUR)).toBe(1);
    expect(darknessAt(2 * HOUR)).toBe(1);
    expect(darknessAt(5 * HOUR)).toBe(1);
    expect(darknessAt(7 * HOUR)).toBe(0);
  });

  it('falls through the twilight rather than at once', () => {
    expect(darknessAt(21.5 * HOUR)).toBeCloseTo(0.5);
    expect(darknessAt(6 * HOUR)).toBeCloseTo(0.5);
  });

  it('reads any day as the first', () => {
    expect(darknessAt(3 * TICKS_PER_DAY + 23 * HOUR)).toBe(1);
    expect(darknessAt(-HOUR)).toBe(1);
  });
});

// A street along z = 0, as long as asked.
const streetOf = (length: number): WalkNetwork =>
  walkNetworkFor({
    paved: Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 })),
    levelOf: () => 0,
    shore: null,
    tilesX: 40,
  });

const unlitAlong = (network: WalkNetwork, glows: readonly Glow[]): number[] => {
  const unlit = unlitStretchOf(network, lightFieldFor(glows, 40, 4));
  return network.nodes
    .toSorted((a, b) => a.tileX - b.tileX)
    .map((node) => {
      return unlit[network.nodes.indexOf(node)]!;
    });
};

describe('unlitStretchOf', () => {
  it('minds nothing within a few tiles of a lamp and grows uneasy further along', () => {
    const along = unlitAlong(streetOf(20), [lamp(0, 0)]);
    const calmTo = 2 + CALM_TILES;
    for (let x = 0; x <= calmTo; x++) expect(along[x], `${x}`).toBe(0);
    expect(along[calmTo + 1]).toBeGreaterThan(0);
    expect(along[calmTo + 1]).toBeLessThan(1);
    expect(along[19]).toBe(1);
  });

  it('keeps a street calm with a lamp every dozen tiles', () => {
    const along = unlitAlong(streetOf(26), [lamp(0, 0), lamp(13, 0), lamp(25, 0)]);
    expect(Math.max(...along)).toBe(0);
  });

  it('reads a street no light reaches as dark throughout', () => {
    expect(unlitAlong(streetOf(5), [])).toEqual([1, 1, 1, 1, 1]);
  });

  it('counts a lamp only where it lights the paving, not across the grass', () => {
    const far = unlitAlong(streetOf(12), [lamp(11, 3)]);
    expect(Math.min(...far)).toBe(1);
  });
});

describe('gloomAt', () => {
  const unlit = Float32Array.from([0, 0.5, 1]);

  it('is nothing by day, however dark the stretch', () => {
    expect(gloomAt(unlit, 2, 0)).toBe(0);
  });

  it('is the darkness as deep as the stretch, and nothing off the paths', () => {
    expect(gloomAt(unlit, 2, 1)).toBe(1);
    expect(gloomAt(unlit, 1, 1)).toBe(0.5);
    expect(gloomAt(unlit, 2, 0.5)).toBe(0.5);
    expect(gloomAt(unlit, 0, 1)).toBe(0);
    expect(gloomAt(unlit, -1, 1)).toBe(0);
  });
});
