import { describe, expect, it } from 'vitest';
import { elevationFor, levelAt, maxLevelOf, type TerraceSpec } from './elevation';
import { groundAt } from './ground';
import { shoreFor, waterStartZ } from './shoreline';
import {
  createTerrain,
  MAX_TERRAIN_LEVEL,
  terrainFor,
  type TerrainEdit,
  type TerrainPlan,
} from './terrain';

const SHORE = { inset: 10, beach: 6, wave: 2, seed: 7 };

/** A wandering coast with a hill on it: sand up the dune, grass over the crest. */
const plan = (over: Partial<TerrainPlan> = {}): TerrainPlan => ({
  tilesX: 40,
  tilesZ: 60,
  shore: SHORE,
  elevation: {
    terraces: [
      { level: 1, inset: 6, anchor: 'water', wave: 0, surface: 'sand' },
      { level: 2, inset: 12, anchor: 'water', wave: 1 },
      { level: 1, inset: 20, anchor: 'water', wave: 0 },
      { level: 0, inset: 26, anchor: 'water', wave: 0 },
    ] satisfies TerraceSpec[],
    seed: 3,
  },
  ...over,
});

describe('createTerrain', () => {
  it('answers grass at sea level for a plot with neither coast nor hill', () => {
    const terrain = createTerrain({ shore: null, elevation: null, tilesX: 8, tilesZ: 8 });
    expect(terrain.tileAt(3, 4)).toEqual({ level: 0, surface: 'grass' });
    expect(terrain.maxLevel).toBe(0);
  });

  /**
   * The invariant the whole design rests on: an untouched tile answers exactly
   * what the procedural pair answers, so every caller moved from `groundAt` and
   * `levelAt` over to the terrain reads the same plot it always did.
   */
  it('agrees with groundAt and levelAt on every tile of an unedited plot', () => {
    const shaped = plan();
    const shore = shoreFor(shaped);
    const elevation = elevationFor(shaped);
    const terrain = terrainFor(shaped);
    for (let tileX = 0; tileX < shaped.tilesX; tileX++) {
      for (let tileZ = 0; tileZ < shaped.tilesZ; tileZ++) {
        expect({
          surface: terrain.surfaceOf(tileX, tileZ),
          level: terrain.levelOf(tileX, tileZ),
        }).toEqual({
          surface: groundAt(shore, elevation, tileX, tileZ),
          level: levelAt(elevation, tileX, tileZ),
        });
      }
    }
  });

  it('answers off the plot, where the coast and its terraces carry on', () => {
    const shaped = plan();
    const shore = shoreFor(shaped);
    const elevation = elevationFor(shaped);
    const terrain = terrainFor(shaped);
    for (const tileX of [-4, 44]) {
      for (const tileZ of [-3, 12, 30, 64]) {
        expect(terrain.surfaceOf(tileX, tileZ)).toBe(groundAt(shore, elevation, tileX, tileZ));
      }
    }
  });

  it('starts its ceiling at the tallest terrace and raises it with an edit', () => {
    const shaped = plan();
    const terrain = terrainFor(shaped);
    expect(terrain.maxLevel).toBe(maxLevelOf(elevationFor(shaped)));
    terrain.set(5, 5, { level: 6, surface: 'grass' });
    expect(terrain.maxLevel).toBe(6);
  });

  /**
   * A ceiling that fell would have the pick miss the one tile that was highest
   * for a frame; one that stays put costs a crossing that lands on nothing.
   */
  it('does not lower its ceiling when the highest tile is taken away again', () => {
    const terrain = createTerrain({ shore: null, elevation: null, tilesX: 8, tilesZ: 8 });
    terrain.set(1, 1, { level: 4, surface: 'grass' });
    terrain.set(1, 1, { level: 0, surface: 'grass' });
    expect(terrain.maxLevel).toBe(4);
  });
});

describe('Terrain.set', () => {
  it('changes a tile without touching the one beside it', () => {
    const terrain = terrainFor(plan());
    const beside = terrain.tileAt(11, 10);
    terrain.set(10, 10, { level: 3, surface: 'sand' });
    expect(terrain.tileAt(10, 10)).toEqual({ level: 3, surface: 'sand' });
    expect(terrain.tileAt(11, 10)).toEqual(beside);
  });

  it('drops an edit that comes back to what the plot already was', () => {
    const terrain = terrainFor(plan());
    const base = terrain.tileAt(10, 10);
    terrain.set(10, 10, { level: base.level + 1, surface: base.surface });
    expect(terrain.edits).toHaveLength(1);
    terrain.set(10, 10, base);
    expect(terrain.edits).toHaveLength(0);
  });

  it('takes an edit out in the apron, which is ground somebody can dig', () => {
    // An island belongs out in the bay rather than off the end of the beach, so
    // the ground an edit may touch runs a plot's width past the plot itself —
    // and reads back at the coordinates it was made at, negatives and all.
    const terrain = terrainFor(plan());
    terrain.set(-8, 70, { level: 1, surface: 'sand' });
    expect(terrain.edits).toEqual([{ tileX: -8, tileZ: 70, level: 1, surface: 'sand' }]);
    expect(terrain.levelOf(-8, 70)).toBe(1);
  });

  it('ignores anything past the apron, which is ground nobody can see', () => {
    const terrain = terrainFor(plan());
    terrain.set(-41, 4, { level: 5, surface: 'grass' });
    terrain.set(4, 121, { level: 5, surface: 'grass' });
    expect(terrain.edits).toHaveLength(0);
    expect(terrain.levelOf(-41, 4)).toBe(0);
  });

  it('reads its edits back as the list a plan would carry', () => {
    const terrain = terrainFor(plan());
    terrain.set(3, 4, { level: 1, surface: 'water' });
    terrain.set(9, 2, { level: 2, surface: 'sand' });
    expect(terrain.edits).toEqual([
      { tileX: 3, tileZ: 4, level: 1, surface: 'water' },
      { tileX: 9, tileZ: 2, level: 2, surface: 'sand' },
    ] satisfies TerrainEdit[]);
  });
});

describe('Terrain.isSea', () => {
  it('is the base rather than the tile as it stands, so an island knows the bay', () => {
    const shaped = plan();
    const terrain = terrainFor(shaped);
    const water = waterStartZ(shoreFor(shaped)!, 12);
    expect(terrain.isSea(12, water)).toBe(true);
    terrain.set(12, water, { level: 1, surface: 'sand' });
    expect(terrain.surfaceOf(12, water)).toBe('sand');
    expect(terrain.isSea(12, water)).toBe(true);
  });

  it('is false for a lake somebody dug inland', () => {
    const terrain = terrainFor(plan());
    terrain.set(4, 2, { level: 0, surface: 'water' });
    expect(terrain.surfaceOf(4, 2)).toBe('water');
    expect(terrain.isSea(4, 2)).toBe(false);
  });
});

describe('terrainFor', () => {
  it('seeds itself from the edits the plan carries', () => {
    const terrain = terrainFor(
      plan({ terrain: [{ tileX: 6, tileZ: 3, level: 0, surface: 'water' }] }),
    );
    expect(terrain.tileAt(6, 3)).toEqual({ level: 0, surface: 'water' });
  });

  it('refuses a plan whose steps cross, exactly as elevationFor does', () => {
    expect(() =>
      terrainFor({
        tilesX: 40,
        tilesZ: 60,
        shore: SHORE,
        elevation: {
          terraces: [
            { level: 1, inset: 6, anchor: 'water', wave: 0 },
            { level: 2, inset: 6, anchor: 'water', wave: 0 },
          ],
          seed: 1,
        },
      }),
    ).toThrow(/meet at column/);
  });
});

describe('MAX_TERRAIN_LEVEL', () => {
  it('leaves headroom over the tallest hill the generator grows', () => {
    expect(MAX_TERRAIN_LEVEL).toBeGreaterThan(6);
  });
});
