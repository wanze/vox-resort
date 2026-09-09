import { describe, expect, it } from 'vitest';
import { groundAt, isSandGround } from './ground';
import { elevationFor, stepStartZ, type Elevation, type TerraceSpec } from './elevation';
import { shoreFor, waterStartZ, type Shore } from './shoreline';

const SHORE = { inset: 10, beach: 6, wave: 0, seed: 1 };

const shore = (): Shore => shoreFor({ tilesX: 40, tilesZ: 60, shore: SHORE })!;

/** A hill anchored on the coast: sand up the dune, grass above it, back to zero. */
const hill = (surface: 'sand' | 'grass'): Elevation =>
  elevationFor({
    tilesX: 40,
    tilesZ: 60,
    shore: SHORE,
    elevation: {
      terraces: [
        { level: 1, inset: 6, anchor: 'water', wave: 0, surface },
        { level: 2, inset: 12, anchor: 'water', wave: 0 },
        { level: 1, inset: 20, anchor: 'water', wave: 0 },
        { level: 0, inset: 26, anchor: 'water', wave: 0 },
      ] satisfies TerraceSpec[],
      seed: 1,
    },
  })!;

/** The first row behind the step onto terrace `index`, in column 0. */
const behind = (elevation: Elevation, index: number): number => stepStartZ(elevation, index, 0) - 1;

describe('groundAt', () => {
  it('is grass everywhere on a plot with neither coast nor terraces', () => {
    expect(groundAt(null, null, 3, 4)).toBe('grass');
  });

  it('reads the sea, the sand and the land off the coast on a flat plot', () => {
    const coast = shore();
    const water = waterStartZ(coast, 0);
    expect(groundAt(coast, null, 0, water)).toBe('water');
    expect(groundAt(coast, null, 0, water - 1)).toBe('sand');
    expect(groundAt(coast, null, 0, water - SHORE.beach - 1)).toBe('grass');
  });

  it('carries the sand up a dune, which is the whole reason it exists', () => {
    const dune = hill('sand');
    // The first bench is the dune: above sea level, and still sand.
    expect(groundAt(shore(), dune, 0, behind(dune, 0))).toBe('sand');
    // The bench above it is not, and neither is the land back at sea level.
    expect(groundAt(shore(), dune, 0, behind(dune, 1))).toBe('grass');
    expect(groundAt(shore(), dune, 0, behind(dune, 2))).toBe('grass');
  });

  it('leaves a bench of grass green however low it stands', () => {
    const green = hill('grass');
    expect(groundAt(shore(), green, 0, behind(green, 0))).toBe('grass');
  });

  it('lets the sea win over a terrace, wherever the two meet', () => {
    const dune = hill('sand');
    const coast = shore();
    expect(groundAt(coast, dune, 0, waterStartZ(coast, 0))).toBe('water');
  });

  it('keeps the beach in front of the first step level and sandy', () => {
    // The invariant `elevationFor` enforces, seen from the ground: every tile of
    // the sand band answers sand, terraces or no terraces.
    const dune = hill('sand');
    const coast = shore();
    for (let tileX = 0; tileX < 40; tileX++) {
      const water = waterStartZ(coast, tileX);
      for (let tileZ = water - SHORE.beach; tileZ < water; tileZ++) {
        expect({ tileX, tileZ, ground: groundAt(coast, dune, tileX, tileZ) }).toEqual({
          tileX,
          tileZ,
          ground: 'sand',
        });
      }
    }
  });
});

describe('isSandGround', () => {
  it('is the beach and the dune alike, and nothing else', () => {
    const dune = hill('sand');
    const coast = shore();
    expect(isSandGround(coast, dune, 0, waterStartZ(coast, 0) - 1)).toBe(true);
    expect(isSandGround(coast, dune, 0, behind(dune, 0))).toBe(true);
    expect(isSandGround(coast, dune, 0, behind(dune, 1))).toBe(false);
    expect(isSandGround(coast, dune, 0, waterStartZ(coast, 0))).toBe(false);
  });
});
