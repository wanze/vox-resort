import { describe, expect, it } from 'vitest';
import { islandBayInset, islandEditsFor, islandSizeFor, type IslandParts } from './island';
import { shoreFor, waterStartZ } from './shoreline';
import { createTerrain, type TerrainEdit } from './terrain';

const TILES_X = 120;
const TILES_Z = 100;
const WAVE = 3;

const parts = (over: { readonly seed?: number; readonly inset?: number } = {}): IslandParts => {
  const inset = over.inset ?? islandBayInset(islandSizeFor(TILES_X, TILES_Z), WAVE);
  const shore = shoreFor({
    tilesX: TILES_X,
    tilesZ: TILES_Z,
    shore: { inset, beach: 12, wave: WAVE, seed: 7 },
  })!;
  return { shore, tilesX: TILES_X, tilesZ: TILES_Z, seed: over.seed ?? 11 };
};

const terrainOf = (made: IslandParts, edits: readonly TerrainEdit[]) =>
  createTerrain({ shore: made.shore, elevation: null, tilesX: TILES_X, tilesZ: TILES_Z, edits });

const SEEDS = [1, 2, 3, 11, 42, 977];

describe('islandEditsFor', () => {
  it('is the same island for the same seed, and a different one for another', () => {
    expect(islandEditsFor(parts())).toEqual(islandEditsFor(parts()));
    expect(islandEditsFor(parts({ seed: 12 }))).not.toEqual(islandEditsFor(parts()));
  });

  it('stands wholly in the plot’s own sea, clear of its sides and its far edge', () => {
    for (const seed of SEEDS) {
      const made = parts({ seed });
      const edits = islandEditsFor(made);
      const bare = terrainOf(made, []);
      expect(edits.length).toBeGreaterThan(0);
      for (const edit of edits) {
        expect(bare.isSea(edit.tileX, edit.tileZ)).toBe(true);
        expect(edit.tileX).toBeGreaterThan(0);
        expect(edit.tileX).toBeLessThan(TILES_X - 1);
        expect(edit.tileZ).toBeLessThan(TILES_Z - 1);
      }
    }
  });

  it('leaves the swimming area and a boat’s passage open between it and the coast', () => {
    for (const seed of SEEDS) {
      const made = parts({ seed });
      for (const edit of islandEditsFor(made)) {
        expect(edit.tileZ - waterStartZ(made.shore, edit.tileX)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('never climbs more than a level between neighbours, diagonals included', () => {
    for (const seed of SEEDS) {
      const made = parts({ seed });
      const terrain = terrainOf(made, islandEditsFor(made));
      for (const edit of islandEditsFor(made)) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const beside = terrain.levelOf(edit.tileX + dx, edit.tileZ + dz);
            expect(Math.abs(beside - edit.level)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('is ringed with sand wherever it meets the sea', () => {
    const made = parts();
    const edits = islandEditsFor(made);
    const terrain = terrainOf(made, edits);
    for (const edit of edits) {
      const shoreside = [-1, 1].some(
        (d) =>
          terrain.surfaceOf(edit.tileX + d, edit.tileZ) === 'water' ||
          terrain.surfaceOf(edit.tileX, edit.tileZ + d) === 'water',
      );
      if (shoreside) expect(edit.surface).toBe('sand');
    }
    expect(edits.some((edit) => edit.surface === 'grass')).toBe(true);
  });

  it('is one piece of land', () => {
    for (const seed of SEEDS) {
      const edits = islandEditsFor(parts({ seed }));
      const land = new Set(edits.map((edit) => `${edit.tileX},${edit.tileZ}`));
      const reached = new Set<string>();
      const queue = [edits[0]!];
      while (queue.length > 0) {
        const { tileX, tileZ } = queue.pop()!;
        const key = `${tileX},${tileZ}`;
        if (!land.has(key) || reached.has(key)) continue;
        reached.add(key);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          queue.push({ tileX: tileX + dx, tileZ: tileZ + dz, level: 0, surface: 'sand' });
        }
      }
      expect(reached.size).toBe(land.size);
    }
  });

  it('raises nothing when the bay is too shallow to hold it', () => {
    expect(islandEditsFor(parts({ inset: 8 }))).toEqual([]);
  });
});

describe('islandBayInset', () => {
  it('grows with the island, so a bigger island still fits its bay', () => {
    const small = islandBayInset({ x: 5, z: 3 }, WAVE);
    const large = islandBayInset({ x: 5, z: 8 }, WAVE);
    expect(large).toBeGreaterThan(small);
  });
});
