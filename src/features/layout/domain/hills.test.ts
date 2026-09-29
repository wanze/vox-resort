import { describe, expect, it } from 'vitest';
import { hillEditsFor, type HillParts } from './hills';
import { createTerrain, type Terrain, type TerrainEdit } from './terrain';

const TILES_X = 100;
const TILES_Z = 90;

// A plot of level grass with a channel of water across it at rows 40 and 41.
const channel: TerrainEdit[] = Array.from({ length: TILES_X }, (_, tileX) => [
  { tileX, tileZ: 40, level: 1, surface: 'water' as const },
  { tileX, tileZ: 41, level: 1, surface: 'water' as const },
]).flat();

function groundOf(edits: readonly TerrainEdit[] = channel): Terrain {
  const terrain = createTerrain({ shore: null, elevation: null, tilesX: TILES_X, tilesZ: TILES_Z });
  for (let z = -1; z <= TILES_Z; z++) {
    for (let x = -1; x <= TILES_X; x++) terrain.set(x, z, { level: 1, surface: 'grass' });
  }
  for (const edit of edits) terrain.set(edit.tileX, edit.tileZ, edit);
  return terrain;
}

const parts = (seed = 4): HillParts => ({
  terrain: groundOf(),
  level: 1,
  tilesX: TILES_X,
  tilesZ: TILES_Z,
  seed,
});

const SEEDS = [1, 2, 4, 9, 31];

describe('hillEditsFor', () => {
  it('is the same land for the same seed, and different land for another', () => {
    expect(hillEditsFor(parts())).toEqual(hillEditsFor(parts()));
    expect(hillEditsFor(parts(5))).not.toEqual(hillEditsFor(parts()));
  });

  it('raises grass hills, one of them standing well above the rest', () => {
    for (const seed of SEEDS) {
      const edits = hillEditsFor(parts(seed));
      expect(edits.length).toBeGreaterThan(40);
      for (const edit of edits) {
        expect(edit.level).toBeGreaterThan(1);
        expect(edit.level).toBeLessThanOrEqual(11);
        expect(edit.surface).toBe('grass');
      }
      const top = Math.max(...edits.map((edit) => edit.level));
      expect({ seed, top: top >= 6 }).toEqual({ seed, top: true });
    }
  });

  it('never climbs more than a level between neighbours, diagonals included', () => {
    for (const seed of SEEDS) {
      const made = parts(seed);
      const terrain = groundOf([...channel, ...hillEditsFor(made)]);
      for (let z = 0; z < TILES_Z; z++) {
        for (let x = 0; x < TILES_X; x++) {
          for (const [dx, dz] of [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1],
          ] as const) {
            const step = Math.abs(terrain.levelOf(x, z) - terrain.levelOf(x + dx, z + dz));
            expect(step).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('keeps three rows of level grass to the water and to the plot’s edge', () => {
    for (const seed of SEEDS) {
      for (const edit of hillEditsFor(parts(seed))) {
        expect(Math.min(Math.abs(edit.tileZ - 40), Math.abs(edit.tileZ - 41))).toBeGreaterThan(3);
        expect(edit.tileX).toBeGreaterThanOrEqual(3);
        expect(edit.tileZ).toBeGreaterThanOrEqual(3);
        expect(edit.tileX).toBeLessThan(TILES_X - 3);
        expect(edit.tileZ).toBeLessThan(TILES_Z - 3);
      }
    }
  });
});
