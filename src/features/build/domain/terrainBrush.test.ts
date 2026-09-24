import { describe, expect, it } from 'vitest';
import { createTerrain, MAX_TERRAIN_LEVEL, type Terrain } from '../../layout/domain/terrain';
import { shoreFor } from '../../layout/domain/shoreline';
import {
  terrainChangeAt,
  TERRAIN_BRUSHES,
  type TerrainBrush,
  type TerrainRules,
} from './terrainBrush';

const SHORE = { inset: 8, beach: 5, wave: 0, seed: 1 };

const flat = (tiles = 12): Terrain =>
  createTerrain({ shore: null, elevation: null, tilesX: tiles, tilesZ: tiles });

const coastal = (): Terrain =>
  createTerrain({
    shore: shoreFor({ tilesX: 20, tilesZ: 20, shore: SHORE }),
    elevation: null,
    tilesX: 20,
    tilesZ: 20,
  });

const rules = (terrain: Terrain, taken: readonly string[] = []): TerrainRules => ({
  terrain,
  isClear: (tileX, tileZ) => !taken.includes(`${tileX},${tileZ}`),
});

const change = (brush: TerrainBrush, terrain: Terrain, x: number, z: number, taken?: string[]) =>
  terrainChangeAt(brush, { x, z }, rules(terrain, taken));

function raiseTo(terrain: Terrain, x: number, z: number, level: number): void {
  for (let step = 1; step <= level; step++) {
    for (let dz = -(level - step); dz <= level - step; dz++) {
      for (let dx = -(level - step); dx <= level - step; dx++) {
        const plan = change('raise', terrain, x + dx, z + dz);
        if (plan.next) terrain.set(x + dx, z + dz, plan.next);
      }
    }
  }
}

describe('terrainChangeAt', () => {
  it('digs an apron of ground all round the plot, and nothing past it', () => {
    expect(change('raise', flat(), -1, 4).blocked).toBe(false);
    expect(change('raise', flat(), 4, 20).blocked).toBe(false);
    expect(change('raise', flat(), -13, 4).blocked).toBe(true);
    expect(change('sand', flat(), 4, 99).blocked).toBe(true);
  });

  it('refuses a tile something is standing on', () => {
    const terrain = flat();
    for (const brush of TERRAIN_BRUSHES) {
      expect(change(brush.id, terrain, 5, 5, ['5,5']).blocked).toBe(true);
    }
  });
});

describe('raise and lower', () => {
  it('moves a tile one level and keeps what it is made of', () => {
    const terrain = flat();
    expect(change('raise', terrain, 5, 5).next).toEqual({ level: 1, surface: 'grass' });
  });

  it('refuses to go below sea level', () => {
    expect(change('lower', flat(), 5, 5).blocked).toBe(true);
  });

  it('refuses to pile ground higher than the tool allows', () => {
    // Room for the whole feathered cone: a crest of n needs n rings around it.
    const terrain = flat(MAX_TERRAIN_LEVEL * 2 + 3);
    raiseTo(terrain, MAX_TERRAIN_LEVEL + 1, MAX_TERRAIN_LEVEL + 1, MAX_TERRAIN_LEVEL);
    const crest = MAX_TERRAIN_LEVEL + 1;
    expect(terrain.levelOf(crest, crest)).toBe(MAX_TERRAIN_LEVEL);
    expect(change('raise', terrain, crest, crest).blocked).toBe(true);
  });

  it('refuses a raise that would leave a two-level step', () => {
    const terrain = flat();
    terrain.set(5, 5, { level: 1, surface: 'grass' });
    expect(change('raise', terrain, 5, 5).blocked).toBe(true);
  });

  it('allows the raise once a neighbour has come up to meet it', () => {
    const terrain = flat();
    terrain.set(5, 5, { level: 1, surface: 'grass' });
    terrain.set(5, 4, { level: 1, surface: 'grass' });
    expect(change('raise', terrain, 5, 5).blocked).toBe(true);
    for (const [x, z] of [
      [4, 5],
      [6, 5],
      [5, 6],
    ]) {
      terrain.set(x!, z!, { level: 1, surface: 'grass' });
    }
    expect(change('raise', terrain, 5, 5).next).toEqual({ level: 2, surface: 'grass' });
  });

  it('refuses a lower that would leave a two-level step', () => {
    const terrain = flat();
    raiseTo(terrain, 5, 5, 2);
    expect(terrain.levelOf(5, 5)).toBe(2);
    const bench = change('lower', terrain, 5, 6);
    expect(bench.blocked).toBe(true);
    const crest = change('lower', terrain, 5, 5);
    expect(crest.next).toEqual({ level: 1, surface: 'grass' });
  });
});

describe('the sea', () => {
  it('cannot be painted, whichever surface is asked for', () => {
    const terrain = coastal();
    const water = { x: 4, z: 19 };
    expect(terrain.isSea(water.x, water.z)).toBe(true);
    for (const brush of ['grass', 'sand', 'water'] as const) {
      expect(change(brush, terrain, water.x, water.z).blocked).toBe(true);
    }
  });

  it('takes an island, which comes up out of it as sand', () => {
    const terrain = coastal();
    expect(change('raise', terrain, 4, 19).next).toEqual({ level: 1, surface: 'sand' });
  });

  it('comes back when the island is taken apart again', () => {
    const terrain = coastal();
    terrain.set(4, 19, { level: 1, surface: 'sand' });
    expect(change('lower', terrain, 4, 19).next).toEqual({ level: 0, surface: 'water' });
    terrain.set(4, 19, { level: 0, surface: 'water' });
    expect(terrain.edits).toHaveLength(0);
  });

  it('may be painted once it has been raised out of the water', () => {
    const terrain = coastal();
    terrain.set(4, 19, { level: 1, surface: 'sand' });
    expect(change('grass', terrain, 4, 19).next).toEqual({ level: 1, surface: 'grass' });
  });
});

describe('the surface brushes', () => {
  it('swap grass for sand and back without moving the ground', () => {
    const terrain = flat();
    expect(change('sand', terrain, 3, 3).next).toEqual({ level: 0, surface: 'sand' });
    terrain.set(3, 3, { level: 0, surface: 'sand' });
    expect(change('grass', terrain, 3, 3).next).toEqual({ level: 0, surface: 'grass' });
  });

  it('turn the beach to grass, which is the same rule from the other side', () => {
    const terrain = coastal();
    const sand = { x: 4, z: 8 };
    expect(terrain.surfaceOf(sand.x, sand.z)).toBe('sand');
    expect(change('grass', terrain, sand.x, sand.z).next).toEqual({
      level: 0,
      surface: 'grass',
    });
  });

  it('flood a tile at whatever level it stands, so a river runs downhill', () => {
    const terrain = flat();
    raiseTo(terrain, 6, 6, 2);
    expect(change('water', terrain, 6, 6).next).toEqual({ level: 2, surface: 'water' });
  });

  it('change nothing, and refuse nothing, over ground they have already done', () => {
    const terrain = flat();
    const plan = change('grass', terrain, 3, 3);
    expect(plan.next).toBeNull();
    expect(plan.blocked).toBe(false);
  });
});

describe('water raised out of itself', () => {
  it('fills a river in as sand, exactly as the bay gives up an island', () => {
    const terrain = flat();
    terrain.set(3, 3, { level: 0, surface: 'water' });
    expect(change('raise', terrain, 3, 3).next).toEqual({ level: 1, surface: 'sand' });
  });
});
