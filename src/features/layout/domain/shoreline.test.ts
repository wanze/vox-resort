import { describe, expect, it } from 'vitest';
import {
  beachDepthAt,
  beachTilesOf,
  isBeach,
  isWater,
  shoreFor,
  terrainAt,
  waterEdgeZ,
  waterStartZ,
  waterTilesOf,
  type Shore,
  type ShoreSpec,
} from './shoreline';

const spec = (over: Partial<ShoreSpec> = {}): ShoreSpec => ({
  inset: 20,
  beach: 6,
  wave: 0,
  seed: 1,
  ...over,
});

const shore = (over: Partial<ShoreSpec> = {}, tilesX = 40, tilesZ = 40): Shore =>
  shoreFor({ tilesX, tilesZ, shore: spec(over) })!;

describe('shoreFor', () => {
  it('is null for a plan with no shore', () => {
    expect(shoreFor({ tilesX: 40, tilesZ: 40 })).toBeNull();
  });

  it('is null for a shore that reaches nowhere', () => {
    expect(shoreFor({ tilesX: 40, tilesZ: 40, shore: spec({ inset: 0 }) })).toBeNull();
    expect(shoreFor({ tilesX: 40, tilesZ: 40, shore: spec({ beach: 0 }) })).toBeNull();
  });

  it('anchors the spec on the plot it was given', () => {
    expect(shore().tilesX).toBe(40);
    expect(shore(undefined, 60, 20).tilesZ).toBe(20);
  });
});

describe('waterEdgeZ', () => {
  it('is the curve waterStartZ rounds', () => {
    const coast = shore({ wave: 3 });
    for (let tileX = 0; tileX < 40; tileX++) {
      expect(waterStartZ(coast, tileX)).toBe(Math.round(waterEdgeZ(coast, tileX)));
    }
  });

  it('crosses every column boundary without a step in it', () => {
    const coast = shore({ wave: 3 });
    let biggest = 0;
    for (let tileX = 0; tileX < 40; tileX += 0.05) {
      const step = Math.abs(waterEdgeZ(coast, tileX + 0.05) - waterEdgeZ(coast, tileX));
      biggest = Math.max(biggest, step);
    }
    expect(biggest).toBeLessThan(0.05);
  });

  it('is flat all the way out for a coast with no wander in it', () => {
    const straight = shore({ wave: 0 });
    expect(waterEdgeZ(straight, 3.7)).toBe(waterEdgeZ(straight, 91.2));
  });
});

describe('waterStartZ', () => {
  it('cuts the water in from the south edge of the plot', () => {
    const coast = shore();
    expect(waterStartZ(coast, 0)).toBe(19);
    expect(waterStartZ(coast, 20)).toBe(19);
    expect(waterStartZ(coast, 39)).toBe(19);
  });

  it('runs straight across the plot when nothing wanders it', () => {
    const coast = shore();
    for (let x = 1; x < 40; x++) {
      expect(waterStartZ(coast, x)).toBe(waterStartZ(coast, x - 1));
    }
  });

  it('answers for columns outside the plot, which the sea is drawn from', () => {
    const coast = shore();
    expect(waterStartZ(coast, -30)).toBe(19);
    expect(waterStartZ(coast, 400)).toBe(19);
  });

  it('wanders off the straight edge by no more than the wave it was given', () => {
    const straight = shore({ wave: 0 });
    const wavy = shore({ wave: 3 });
    let wandered = 0;
    for (let x = 0; x < 40; x++) {
      const drift = Math.abs(waterStartZ(wavy, x) - waterStartZ(straight, x));
      expect(drift).toBeLessThanOrEqual(3);
      wandered = Math.max(wandered, drift);
    }
    expect(wandered).toBeGreaterThan(0);
  });

  it('gives the same coast for the same seed and a different one otherwise', () => {
    const columns = (seed: number): number[] =>
      Array.from({ length: 40 }, (_, x) => waterStartZ(shore({ wave: 3, seed }), x));
    expect(columns(7)).toEqual(columns(7));
    expect(columns(7)).not.toEqual(columns(8));
  });
});

describe('terrainAt', () => {
  it('is all land when there is no shore', () => {
    expect(terrainAt(null, 39, 39)).toBe('land');
    expect(isWater(null, 39, 39)).toBe(false);
    expect(isBeach(null, 39, 39)).toBe(false);
  });

  it('reads water, then sand, then land walking north from the south edge', () => {
    const coast = shore();
    const start = waterStartZ(coast, 20);
    expect(terrainAt(coast, 20, start)).toBe('water');
    expect(terrainAt(coast, 20, start + 5)).toBe('water');
    expect(terrainAt(coast, 20, start - 1)).toBe('beach');
    expect(terrainAt(coast, 20, start - 6)).toBe('beach');
    expect(terrainAt(coast, 20, start - 7)).toBe('land');
  });

  it('runs the sand the whole width of the plot', () => {
    const coast = shore({ wave: 2 });
    for (let x = 0; x < 40; x++) {
      expect({ x, sand: terrainAt(coast, x, waterStartZ(coast, x) - 1) }).toEqual({
        x,
        sand: 'beach',
      });
    }
  });

  it('leaves the north of the plot dry', () => {
    expect(terrainAt(shore(), 0, 0)).toBe('land');
    expect(terrainAt(shore(), 39, 0)).toBe('land');
  });
});

describe('beachDepthAt', () => {
  it('counts up from the water, and is -1 off the sand', () => {
    const coast = shore();
    const start = waterStartZ(coast, 20);
    expect(beachDepthAt(coast, 20, start - 1)).toBe(0);
    expect(beachDepthAt(coast, 20, start - 6)).toBe(5);
    expect(beachDepthAt(coast, 20, start)).toBe(-1);
    expect(beachDepthAt(coast, 20, start - 7)).toBe(-1);
    expect(beachDepthAt(null, 3, 3)).toBe(-1);
  });
});

describe('waterTilesOf and beachTilesOf', () => {
  it('list nothing without a shore', () => {
    expect(waterTilesOf(null)).toEqual([]);
    expect(beachTilesOf(null)).toEqual([]);
  });

  it('stay inside the plot', () => {
    const coast = shore();
    for (const tile of [...waterTilesOf(coast), ...beachTilesOf(coast)]) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.z).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(40);
      expect(tile.z).toBeLessThan(40);
    }
  });

  it('agree with what terrainAt says of every tile', () => {
    const coast = shore({ wave: 2 });
    const water = new Set(waterTilesOf(coast).map((tile) => `${tile.x},${tile.z}`));
    const sand = new Set(beachTilesOf(coast).map((tile) => `${tile.x},${tile.z}`));
    expect(water.size).toBeGreaterThan(0);
    expect(sand.size).toBeGreaterThan(0);
    for (let z = 0; z < 40; z++) {
      for (let x = 0; x < 40; x++) {
        const key = `${x},${z}`;
        expect({ key, water: water.has(key), sand: sand.has(key) }).toEqual({
          key,
          water: terrainAt(coast, x, z) === 'water',
          sand: terrainAt(coast, x, z) === 'beach',
        });
      }
    }
  });

  it('never overlap', () => {
    const coast = shore({ wave: 3 });
    const water = new Set(waterTilesOf(coast).map((tile) => `${tile.x},${tile.z}`));
    expect(beachTilesOf(coast).some((tile) => water.has(`${tile.x},${tile.z}`))).toBe(false);
  });

  it('walks the sand landward first, so the buildings get first pick', () => {
    const coast = shore({ wave: 2 });
    const rows = beachTilesOf(coast).map((tile) => tile.z);
    expect(rows).toEqual(rows.toSorted((a, b) => a - b));
  });
});
