import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { OBJECT_TYPES, objectTypeById, TILE_VOXELS } from '../../catalog/domain/objectTypes';
import type { LandConfig } from '../../layout/domain/landConfig';
import { place, placeOnEdge, type Placement } from '../../layout/domain/resortLayout';
import type { Rotation } from '../../layout/domain/rotation';
import { MAX_TERRAIN_LEVEL, terrainFor } from '../../layout/domain/terrain';
import { prepareResort } from '../../resort-prep/domain/prepareResort';
import { savedWorldOf, type SavedWorld } from '../../resort-prep/domain/savedWorld';
import { worldMisfits } from './worldFits';

function preparedWorld(
  kind: 'generate' | 'clear',
  tiles: number,
  tilesZ: number,
  seed: number,
  land?: LandConfig,
) {
  const params = { tilesX: tiles, tilesZ, density: 0.6, seed, ...(land ? { land } : {}) };
  const prepared = prepareResort({ source: { kind, params }, repeat: 1, view: null });
  return savedWorldOf(
    prepared.plan,
    terrainFor(prepared.plan),
    prepared.plot,
    prepared.plan.land ?? null,
  );
}

function at(id: string, tileX: number, tileZ: number, rotation: Rotation = 0): Placement {
  return place(
    layoutItemFor(objectTypeById(id)),
    `${id}@${tileX},${tileZ}`,
    tileX,
    tileZ,
    rotation,
  );
}

function railAt(id: string, tileX: number, tileZ: number, rotation: Rotation = 0): Placement {
  const key = `${id}@${tileX},${tileZ}:${rotation}`;
  return placeOnEdge(layoutItemFor(objectTypeById(id)), key, tileX, tileZ, rotation);
}

const SIDE = 12;

const worldOf = (lists: Partial<Pick<SavedWorld, 'placements' | 'props' | 'paths' | 'rails'>>) => ({
  tilesX: SIDE,
  tilesZ: SIDE,
  shore: null,
  elevation: null,
  terrain: [],
  placements: [],
  props: [],
  paths: [],
  rails: [],
  ...lists,
});

const oblong = OBJECT_TYPES.find((type) => type.model.tiles.x !== type.model.tiles.z)!;

describe('worldMisfits', () => {
  it('passes the worlds the game grows and clears', () => {
    expect(worldMisfits(preparedWorld('generate', 112, 100, 1))).toEqual([]);
    expect(worldMisfits(preparedWorld('generate', 64, 64, 2))).toEqual([]);
    const bare = preparedWorld('clear', 256, 256, 4);
    expect(bare.land).toBeDefined();
    expect(worldMisfits(bare)).toEqual([]);
  });

  it('passes bare land with a river, hills and an island', () => {
    const hilly = preparedWorld('clear', 200, 160, 3, { river: true, hills: true, island: true });
    expect(Math.max(...hilly.terrain.map((edit) => edit.level))).toBeGreaterThan(10);
    expect(worldMisfits(hilly)).toEqual([]);
  });

  it('passes a turned model and terrain edits past the plot', () => {
    const turned = worldOf({ placements: [at(oblong.id, 2, 2, 1)] });
    expect(
      worldMisfits({ ...turned, terrain: [{ tileX: -40, tileZ: 30, level: 1, surface: 'sand' }] }),
    ).toEqual([]);
  });

  it('refuses a placement off the plot', () => {
    const { tiles } = oblong.model;
    const east = at(oblong.id, SIDE - tiles.x + 1, 0);
    expect(worldMisfits(worldOf({ placements: [east] }))).toHaveLength(1);
    expect(worldMisfits(worldOf({ placements: [at(oblong.id, -1, 0)] }))).toHaveLength(1);
  });

  it('refuses a footprint its model does not have', () => {
    const placed = at(oblong.id, 2, 2);
    const swapped = { ...placed, tilesX: placed.tilesZ, tilesZ: placed.tilesX };
    expect(worldMisfits(worldOf({ placements: [swapped] }))).toHaveLength(1);
  });

  it('refuses two claims on one tile, but not a rail on its paving', () => {
    const building = at(oblong.id, 2, 2);
    expect(
      worldMisfits(worldOf({ placements: [building], paths: [at('path', 2, 2)] })),
    ).toHaveLength(1);
    expect(
      worldMisfits(worldOf({ props: [at('hedge', 8, 8)], paths: [at('path', 8, 8)] })),
    ).toHaveLength(1);
    expect(
      worldMisfits(
        worldOf({ paths: [at('path', 8, 8)], rails: [railAt('ramp-head-railing-left', 8, 8)] }),
      ),
    ).toEqual([]);
  });

  it('stops at ten', () => {
    const paths = Array.from({ length: 51 }, () => at('path', 5, 5));
    expect(worldMisfits(worldOf({ paths }))).toHaveLength(10);
  });

  it('refuses a placement moved off where its model stands, or grown past its model', () => {
    const placed = at(oblong.id, 2, 2);
    for (const shift of [1, TILE_VOXELS, 2 ** 40]) {
      const moved = { ...placed, x: placed.x + shift };
      expect(worldMisfits(worldOf({ placements: [moved] }))).toHaveLength(1);
    }
    const wide = { ...placed, width: 2 ** 40 };
    expect(worldMisfits(worldOf({ placements: [wide] }))).toHaveLength(1);
  });

  it('refuses a placement at a height no ground stands at', () => {
    const placed = at(oblong.id, 2, 2);
    const raised = (y: number) => worldMisfits(worldOf({ placements: [{ ...placed, y }] }));
    for (const y of [4, -LEVEL_VOXELS, (MAX_TERRAIN_LEVEL + 1) * LEVEL_VOXELS]) {
      expect(raised(y)).toHaveLength(1);
    }
    expect(raised(MAX_TERRAIN_LEVEL * LEVEL_VOXELS)).toEqual([]);
  });

  it('refuses a rail off the edge it guards', () => {
    const rail = railAt('ramp-head-railing-left', 8, 8);
    const moved = { ...rail, x: rail.x + TILE_VOXELS };
    expect(worldMisfits(worldOf({ paths: [at('path', 8, 8)], rails: [moved] }))).toHaveLength(1);
  });

  it('refuses two rails on one edge, but not rails on opposite edges of a tile', () => {
    const paths = [at('path', 8, 8)];
    const doubled = [railAt('railing', 8, 8, 1), railAt('pier-railing', 8, 8, 1)];
    expect(worldMisfits(worldOf({ paths, rails: doubled }))).toHaveLength(1);
    const opposite = [railAt('railing', 8, 8, 1), railAt('railing', 8, 8, 3)];
    expect(worldMisfits(worldOf({ paths, rails: opposite }))).toEqual([]);
  });

  it('refuses one key on two placements', () => {
    const paths = [
      { ...at('path', 3, 3), key: 'gate' },
      { ...at('path', 4, 3), key: 'gate' },
    ];
    expect(worldMisfits(worldOf({ paths }))).toHaveLength(1);
  });

  it('refuses a terrain cell edited twice', () => {
    const terrain = [1, 2].map((level) => ({
      tileX: 4,
      tileZ: 4,
      level,
      surface: 'grass' as const,
    }));
    expect(worldMisfits({ ...worldOf({}), terrain })).toHaveLength(1);
  });

  it('refuses terraces the game cannot lay, without throwing', () => {
    const terraced = (levels: readonly number[]) => {
      const terraces = levels.map((level) => ({ level, inset: 2 + level, wave: 0 }));
      return worldMisfits({ ...worldOf({}), elevation: { terraces, seed: 1 } });
    };
    expect(terraced([1, 2])).toEqual([]);
    expect(terraced([1, 3])).toEqual(['terraces the game cannot lay']);
  });
});
