import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  elevationFor,
  levelAt,
  levelHeight,
  maxLevelOf,
  stepEdgeZ,
  stepStartZ,
  straddledTile,
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

/** Two terraces climbing away from the water, the shape the resort is cut to. */
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

/** Every row the first step lands on, across a plot's worth of columns. */
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
    // Caught by the same per-column pass that catches two steps meeting, which
    // is the only check that can compare terraces on different anchors at all.
    const backwards = {
      terraces: [terrace({ level: 1, inset: 32 }), terrace({ level: 2, inset: 20 })],
      seed: 1,
    };
    expect(() => elevationFor(plan({ elevation: backwards }))).toThrow(/meet at column/);
  });

  it('measures a plot-anchored step from the plot edge, not from the water', () => {
    // The water starts 10 tiles in, so a water-anchored step 20 in from it lands
    // at z = 49 and a plot-anchored one at z = 59.
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
    // The whole point of the anchor: a step that ignores the coast falls on the
    // same row everywhere, and a step on a street crosses nothing but paving.
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
    // Four tiles apart on paper, and three tiles of wander on each: a spec that
    // reads as fine and crosses itself somewhere across sixty columns.
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
    // The sand is six tiles deep, so a step only four tiles in from the water
    // lands on it: the first terrace has to clear the whole band.
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
    // No shore, so the terraces are measured off the last row: 79 - 20 = 59 and
    // 79 - 32 = 47.
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

/** Land that rises one level north of z = 6. */
const step: LevelProvider = (_tileX, tileZ) => (tileZ < 6 ? 1 : 0);

/** Land with no terraces on it at all. */
const flat: LevelProvider = () => 0;

describe('straddledTile', () => {
  it('finds nothing when the whole footprint is on one bench', () => {
    expect(straddledTile(step, { tileX: 0, tileZ: 6, tilesX: 3, tilesZ: 4 })).toBeNull();
    expect(straddledTile(step, { tileX: 0, tileZ: 2, tilesX: 3, tilesZ: 4 })).toBeNull();
  });

  it('names the first tile off the anchor bench', () => {
    // Anchored at z = 4, one level up, and reaching down to z = 7: the first
    // tile that disagrees is the one just over the step.
    expect(straddledTile(step, { tileX: 2, tileZ: 4, tilesX: 1, tilesZ: 4 })).toEqual({
      x: 2,
      z: 6,
    });
  });

  it('compares against the anchor rather than against the lowest tile', () => {
    // Anchored at z = 5, on the upper bench, and reaching down over the step:
    // the anchor's own tile agrees with itself, so the first mismatch is the
    // tile past the step, not the one the footprint starts on.
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
