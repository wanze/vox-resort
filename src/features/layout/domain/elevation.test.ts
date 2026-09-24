import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  elevationFor,
  levelAt,
  levelHeight,
  maxLevelOf,
  stepEdgeZ,
  stepStartZ,
  raisedTilesOf,
  straddledTile,
  terraceAt,
  type LevelProvider,
  type Elevation,
  type ElevationPlan,
  type ElevationSpec,
  type TerraceSpec,
} from './elevation';
import { waterStartZ, type ShoreSpec } from './shoreline';

const terrace = (over: Partial<TerraceSpec> = {}): TerraceSpec => ({
  level: 1,
  inset: 20,
  wave: 0,
  ...over,
});

const bench: ElevationSpec = {
  terraces: [terrace({ level: 1, inset: 20 }), terrace({ level: 2, inset: 32 })],
  seed: 1,
};

const shoreSpec = (over: Partial<ShoreSpec> = {}): ShoreSpec => ({
  inset: 10,
  beach: 6,
  wave: 0,
  seed: 1,
  ...over,
});

const plan = (over: Partial<ElevationPlan> = {}): ElevationPlan => ({
  tilesX: 60,
  tilesZ: 80,
  elevation: bench,
  ...over,
});

const built = (over: Partial<ElevationPlan> = {}): Elevation => elevationFor(plan(over))!;

const stepRows = (slope: Elevation): Set<number> =>
  new Set(Array.from({ length: 60 }, (_, tileX) => stepStartZ(slope, 0, tileX)));

describe('elevationFor', () => {
  it('is null for a plan with no terraces', () => {
    expect(elevationFor({ tilesX: 60, tilesZ: 80 })).toBeNull();
    expect(elevationFor(plan({ elevation: { terraces: [], seed: 1 } }))).toBeNull();
  });

  it('anchors the spec on the plot it was given', () => {
    expect(built().tilesX).toBe(60);
    expect(built({ tilesZ: 40 }).tilesZ).toBe(40);
  });

  it('carries the coast the steps are measured off, when the plan has one', () => {
    expect(built().shore).toBeNull();
    expect(built({ shore: shoreSpec() }).shore).not.toBeNull();
  });

  it('refuses a step of more than one level', () => {
    const twoUp = { terraces: [terrace({ level: 2 })], seed: 1 };
    expect(() => elevationFor(plan({ elevation: twoUp }))).toThrow(/a step is one level/);
  });

  it('refuses a terrace that does not rise or fall at all', () => {
    const flat = {
      terraces: [terrace({ level: 1 }), terrace({ level: 1, inset: 32 })],
      seed: 1,
    };
    expect(() => elevationFor(plan({ elevation: flat }))).toThrow(/a step is one level/);
  });

  it('accepts a terrace that steps back down, so the land can fall away again', () => {
    const knoll = {
      terraces: [terrace({ level: 1 }), terrace({ level: 0, inset: 32 })],
      seed: 1,
    };
    expect(() => elevationFor(plan({ elevation: knoll }))).not.toThrow();
  });

  it('refuses terraces listed out of order', () => {
    const backwards = {
      terraces: [terrace({ level: 1, inset: 32 }), terrace({ level: 2, inset: 20 })],
      seed: 1,
    };
    expect(() => elevationFor(plan({ elevation: backwards }))).toThrow(/meet at column/);
  });

  it('measures a plot-anchored step from the plot edge, not from the water', () => {
    // The water starts 10 tiles in, so a step 20 in lands at z = 49 (water) or z = 59 (plot).
    const spec = (anchor: 'water' | 'plot') => ({
      terraces: [terrace({ level: 1, inset: 20, anchor })],
      seed: 1,
    });
    const water = built({ shore: shoreSpec(), elevation: spec('water') });
    const plot = built({ shore: shoreSpec(), elevation: spec('plot') });
    expect(stepStartZ(water, 0, 0)).toBe(49);
    expect(stepStartZ(plot, 0, 0)).toBe(59);
  });

  it('holds a plot-anchored step to one row in every column, so it can sit on a street', () => {
    const straight = built({
      shore: shoreSpec({ wave: 4 }),
      elevation: { terraces: [terrace({ level: 1, inset: 20, anchor: 'plot' })], seed: 1 },
    });
    const following = built({
      shore: shoreSpec({ wave: 4 }),
      elevation: { terraces: [terrace({ level: 1, inset: 20, anchor: 'water' })], seed: 1 },
    });
    expect(stepRows(straight).size).toBe(1);
    expect(stepRows(following).size).toBeGreaterThan(1);
  });

  it('falls back to the plot edge for a water anchor with no water', () => {
    const spec = (anchor: 'water' | 'plot') => ({
      terraces: [terrace({ level: 1, inset: 20, anchor })],
      seed: 1,
    });
    expect(stepStartZ(built({ elevation: spec('water') }), 0, 0)).toBe(
      stepStartZ(built({ elevation: spec('plot') }), 0, 0),
    );
  });

  it('refuses two steps that meet', () => {
    const touching = {
      terraces: [terrace({ level: 1, inset: 20 }), terrace({ level: 2, inset: 20.4 })],
      seed: 1,
    };
    expect(() => elevationFor(plan({ elevation: touching }))).toThrow(/meet at column/);
  });

  it('refuses two steps that only meet in one column, once their wobble is rounded', () => {
    const wobbly = {
      terraces: [
        terrace({ level: 1, inset: 20, wave: 3 }),
        terrace({ level: 2, inset: 24, wave: 3 }),
      ],
      seed: 8,
    };
    expect(() => elevationFor(plan({ elevation: wobbly }))).toThrow(/meet at column/);
  });

  it('refuses a first step that cuts into the sand', () => {
    // The sand is six tiles deep, so a step four tiles in from the water lands on it.
    const onSand = { terraces: [terrace({ level: 1, inset: 4 })], seed: 1 };
    expect(() => elevationFor(plan({ shore: shoreSpec(), elevation: onSand }))).toThrow(
      /steps onto the beach/,
    );
  });

  it('leaves the whole sand band at sea level', () => {
    const slope = built({ shore: shoreSpec({ wave: 3 }), elevation: bench });
    const { shore } = slope;
    for (let tileX = 0; tileX < slope.tilesX; tileX++) {
      const water = waterStartZ(shore!, tileX);
      for (let tileZ = water - shore!.spec.beach; tileZ < water; tileZ++) {
        expect(levelAt(slope, tileX, tileZ)).toBe(0);
      }
    }
  });
});

describe('stepEdgeZ', () => {
  it('is the curve stepStartZ rounds', () => {
    const slope = built({ elevation: { terraces: bench.terraces, seed: 7 } });
    for (let tileX = 0; tileX < 60; tileX++) {
      expect(stepStartZ(slope, 0, tileX)).toBe(Math.round(stepEdgeZ(slope, 0, tileX)));
    }
  });

  it('crosses every column boundary without a step in it', () => {
    const wavy = {
      terraces: [terrace({ level: 1, inset: 20, wave: 2 })],
      seed: 3,
    };
    const slope = built({ elevation: wavy });
    let biggest = 0;
    for (let tileX = 0; tileX < 60; tileX += 0.05) {
      biggest = Math.max(
        biggest,
        Math.abs(stepEdgeZ(slope, 0, tileX + 0.05) - stepEdgeZ(slope, 0, tileX)),
      );
    }
    expect(biggest).toBeLessThan(0.05);
  });

  it('runs seaward of the terrace behind it', () => {
    const slope = built();
    for (let tileX = 0; tileX < 60; tileX++) {
      expect(stepEdgeZ(slope, 1, tileX)).toBeLessThan(stepEdgeZ(slope, 0, tileX));
    }
  });

  it('follows the coast it is measured off', () => {
    const straight = built({ shore: shoreSpec() });
    const wandering = built({ shore: shoreSpec({ wave: 4 }) });
    const flat = new Set<number>();
    const bent = new Set<number>();
    for (let tileX = 0; tileX < 60; tileX++) {
      flat.add(stepStartZ(straight, 0, tileX));
      bent.add(stepStartZ(wandering, 0, tileX));
    }
    expect(flat.size).toBe(1);
    expect(bent.size).toBeGreaterThan(1);
  });

  it('has no terrace to report past the last one', () => {
    expect(() => stepEdgeZ(built(), 2, 0)).toThrow(/no terrace 2/);
  });
});

describe('levelAt', () => {
  it('is flat sea level everywhere on a plan with no terraces', () => {
    expect(levelAt(null, 0, 0)).toBe(0);
    expect(levelAt(null, 12, 34)).toBe(0);
  });

  it('climbs one level per step, walking inland', () => {
    // No shore, so the terraces are measured off the last row: 79 - 20 = 59 and 79 - 32 = 47.
    const slope = built();
    expect(levelAt(slope, 0, 70)).toBe(0);
    expect(levelAt(slope, 0, 59)).toBe(0);
    expect(levelAt(slope, 0, 58)).toBe(1);
    expect(levelAt(slope, 0, 47)).toBe(1);
    expect(levelAt(slope, 0, 46)).toBe(2);
    expect(levelAt(slope, 0, 0)).toBe(2);
  });

  it('never steps more than one level between neighbouring tiles', () => {
    const slope = built({
      shore: shoreSpec({ wave: 3 }),
      elevation: {
        terraces: [
          terrace({ level: 1, inset: 20, wave: 2 }),
          terrace({ level: 2, inset: 34, wave: 2 }),
        ],
        seed: 9,
      },
    });
    for (let tileX = 0; tileX < 59; tileX++) {
      for (let tileZ = 0; tileZ < 79; tileZ++) {
        const here = levelAt(slope, tileX, tileZ);
        expect(Math.abs(levelAt(slope, tileX + 1, tileZ) - here)).toBeLessThanOrEqual(1);
        expect(Math.abs(levelAt(slope, tileX, tileZ + 1) - here)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('answers past the plot own edges, where the terraces run on', () => {
    const slope = built();
    expect(levelAt(slope, -4, -4)).toBe(2);
    expect(levelAt(slope, 64, 200)).toBe(0);
  });

  it('gives the same answer for the same seed', () => {
    const one = built({ elevation: { terraces: bench.terraces, seed: 12 } });
    const two = built({ elevation: { terraces: bench.terraces, seed: 12 } });
    for (let tileX = 0; tileX < 60; tileX++) {
      expect(levelAt(one, tileX, 50)).toBe(levelAt(two, tileX, 50));
    }
  });
});

describe('levelHeight', () => {
  it('is one level of voxels per level', () => {
    expect(levelHeight(0)).toBe(0);
    expect(levelHeight(1)).toBe(LEVEL_VOXELS);
    expect(levelHeight(3)).toBe(3 * LEVEL_VOXELS);
  });
});

describe('maxLevelOf', () => {
  it('is sea level for a flat plot', () => {
    expect(maxLevelOf(null)).toBe(0);
  });

  it('is the highest bench, wherever it appears in the list', () => {
    expect(maxLevelOf(built())).toBe(2);
    const knoll = built({
      elevation: {
        terraces: [terrace({ level: 1 }), terrace({ level: 0, inset: 32 })],
        seed: 1,
      },
    });
    expect(maxLevelOf(knoll)).toBe(1);
  });
});

const step: LevelProvider = (_tileX, tileZ) => (tileZ < 6 ? 1 : 0);

const flat: LevelProvider = () => 0;

describe('straddledTile', () => {
  it('finds nothing when the whole footprint is on one bench', () => {
    expect(straddledTile(step, { tileX: 0, tileZ: 6, tilesX: 3, tilesZ: 4 })).toBeNull();
    expect(straddledTile(step, { tileX: 0, tileZ: 2, tilesX: 3, tilesZ: 4 })).toBeNull();
  });

  it('names the first tile off the anchor bench', () => {
    expect(straddledTile(step, { tileX: 2, tileZ: 4, tilesX: 1, tilesZ: 4 })).toEqual({
      x: 2,
      z: 6,
    });
  });

  it('compares against the anchor rather than against the lowest tile', () => {
    expect(straddledTile(step, { tileX: 0, tileZ: 5, tilesX: 1, tilesZ: 3 })).toEqual({
      x: 0,
      z: 6,
    });
  });

  it('never straddles for a single tile, wherever it stands', () => {
    for (let tileZ = 0; tileZ < 12; tileZ++) {
      expect(straddledTile(step, { tileX: 0, tileZ, tilesX: 1, tilesZ: 1 })).toBeNull();
    }
  });

  it('is flat everywhere on a plot with no terraces', () => {
    expect(straddledTile(flat, { tileX: 0, tileZ: 0, tilesX: 9, tilesZ: 9 })).toBeNull();
  });
});

describe('terraceAt', () => {
  it('names the bench a tile stands on, and nothing in front of the first step', () => {
    const slope = built();
    const first = stepStartZ(slope, 0, 0);
    expect(terraceAt(slope, 0, first)).toBeNull();
    expect(terraceAt(slope, 0, first - 1)).toMatchObject({ level: 1 });
    expect(terraceAt(slope, 0, stepStartZ(slope, 1, 0) - 1)).toMatchObject({ level: 2 });
  });

  it('carries the surface the bench is made of, so the ground can be asked', () => {
    const dune = built({
      elevation: {
        terraces: [
          terrace({ level: 1, inset: 20, surface: 'sand' }),
          terrace({ level: 2, inset: 32 }),
        ],
        seed: 1,
      },
    });
    expect(terraceAt(dune, 0, stepStartZ(dune, 0, 0) - 1)?.surface).toBe('sand');
    expect(terraceAt(dune, 0, stepStartZ(dune, 1, 0) - 1)?.surface).toBeUndefined();
  });

  it('is null everywhere on a plot with no terraces', () => {
    expect(terraceAt(null, 3, 4)).toBeNull();
  });
});

describe('raisedTilesOf', () => {
  it('gives every tile above sea level, and only those', () => {
    const slope = built();
    const tiles = raisedTilesOf(slope);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) expect(levelAt(slope, tile.x, tile.z)).toBeGreaterThan(0);
    const raised = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
    for (let z = 0; z < 80; z++) {
      for (let x = 0; x < 60; x++) {
        expect({ x, z, up: levelAt(slope, x, z) > 0 }).toEqual({
          x,
          z,
          up: raised.has(`${x},${z}`),
        });
      }
    }
  });

  it('walks landward first, the way the beach is walked', () => {
    const rows = raisedTilesOf(built()).map((tile) => tile.z);
    expect(rows).toEqual(rows.toSorted((a, b) => a - b));
  });

  it('is empty on a plot with no terraces', () => {
    expect(raisedTilesOf(null)).toEqual([]);
  });
});
