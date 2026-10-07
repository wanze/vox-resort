import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES, objectTypeById, TILE_VOXELS } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateExtent, type Rotation } from '../../layout/domain/rotation';
import { terrainFor } from '../../layout/domain/terrain';
import { prepareResort } from '../../resort-prep/domain/prepareResort';
import { savedWorldOf, type SavedWorld } from '../../resort-prep/domain/savedWorld';
import { worldMisfits } from './worldFits';

function preparedWorld(kind: 'generate' | 'clear', tiles: number, tilesZ: number, seed: number) {
  const params = { tilesX: tiles, tilesZ, density: 0.6, seed };
  const prepared = prepareResort({ source: { kind, params }, repeat: 1, view: null });
  return savedWorldOf(
    prepared.plan,
    terrainFor(prepared.plan),
    prepared.plot,
    prepared.plan.land ?? null,
  );
}

function at(id: string, tileX: number, tileZ: number, rotation: Rotation = 0): Placement {
  const { tiles } = objectTypeById(id).model;
  const turned = rotateExtent(tiles.x, tiles.z, rotation);
  return {
    key: `${id}@${tileX},${tileZ}`,
    id,
    tileX,
    tileZ,
    tilesX: turned.x,
    tilesZ: turned.z,
    rotation,
    x: tileX * TILE_VOXELS,
    z: tileZ * TILE_VOXELS,
    y: 0,
    width: turned.x * TILE_VOXELS,
    depth: turned.z * TILE_VOXELS,
  };
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
        worldOf({ paths: [at('path', 8, 8)], rails: [at('ramp-head-railing-left', 8, 8)] }),
      ),
    ).toEqual([]);
  });

  it('stops at ten', () => {
    const paths = Array.from({ length: 51 }, () => at('path', 5, 5));
    expect(worldMisfits(worldOf({ paths }))).toHaveLength(10);
  });
});
