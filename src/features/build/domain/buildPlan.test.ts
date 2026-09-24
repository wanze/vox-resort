import { describe, expect, it } from 'vitest';
import { place, type LayoutItem, type Tile } from '../../layout/domain/resortLayout';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import {
  buildKey,
  isPaintable,
  layoutItemFor,
  planAt,
  planStroke,
  tilesBetween,
} from './buildPlan';
import { createTileOccupancy } from './tileOccupancy';
import type { LevelProvider } from '../../layout/domain/elevation';
import { createTerrain } from '../../layout/domain/terrain';
import { shoreFor } from '../../layout/domain/shoreline';

const dry = ({ z }: Tile): boolean => z < 7;

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * 16,
  depth: tilesZ * 16,
});

const PATH = item('path');
const COTTAGE = item('cottage', 2, 3);

describe('buildKey', () => {
  it('keys a placement by its type and tile, so it survives an edit', () => {
    expect(buildKey(PATH, { x: 12, z: 7 })).toBe('path@12,7');
  });
});

describe('isPaintable', () => {
  it('paints a one-tile object', () => {
    expect(isPaintable(PATH)).toBe(true);
  });

  it('does not paint a row of buildings out of one drag', () => {
    expect(isPaintable(COTTAGE)).toBe(false);
  });
});

const stepAt =
  (z: number): LevelProvider =>
  (_tileX, tileZ) =>
    tileZ < z ? 1 : 0;

describe('planAt', () => {
  it('stands the object on the tile it was dropped on', () => {
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy());
    expect(plan.blocked).toBe(false);
    expect(plan.placement).toEqual(place(COTTAGE, 'cottage@3,5', 3, 5));
  });

  it('drops the object at sea level when nobody said which terrace', () => {
    expect(planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy()).placement.y).toBe(0);
  });

  it('drops the object on the terrace under the pointer', () => {
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 0, () => 2);
    expect(plan.placement).toEqual(place(COTTAGE, 'cottage@3,5', 3, 5, 0, 2));
  });

  it('still plans a blocked placement, so the preview can show it refused', () => {
    const occupancy = createTileOccupancy([place(PATH, 'path@3,5', 3, 5)]);
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, occupancy);
    expect(plan.blocked).toBe(true);
    expect(plan.placement.tileX).toBe(3);
  });

  it('is blocked when its footprint straddles a step', () => {
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 0, stepAt(6));
    expect(plan.blocked).toBe(true);
    expect(plan.placement.tileX).toBe(3);
  });

  it('stands the same object one tile over, where the ground is level', () => {
    const plan = planAt(COTTAGE, { x: 3, z: 6 }, createTileOccupancy(), 0, stepAt(6));
    expect({ blocked: plan.blocked, y: plan.placement.y }).toEqual({ blocked: false, y: 0 });
  });

  it('asks about the tiles the turned footprint covers, not the ones it would not', () => {
    const upright = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 0, stepAt(7));
    const turned = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 1, stepAt(7));
    expect({ upright: upright.blocked, turned: turned.blocked }).toEqual({
      upright: true,
      turned: false,
    });
  });

  it('is blocked by anything under any tile of its footprint', () => {
    const occupancy = createTileOccupancy([place(PATH, 'path@4,7', 4, 7)]);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, occupancy).blocked).toBe(true);
  });

  it('stands the object the way round it was asked for', () => {
    const plan = planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 1);
    expect(plan.placement).toEqual(place(COTTAGE, 'cottage@3,5', 3, 5, 1));
    expect(plan.placement).toMatchObject({ rotation: 1, tilesX: 3, tilesZ: 2 });
  });

  it('asks about the tiles the turned object would claim, not the ones it would not', () => {
    const belowIt = createTileOccupancy([place(PATH, 'path@3,7', 3, 7)]);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, belowIt).blocked).toBe(true);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, belowIt, 1).blocked).toBe(false);

    const besideIt = createTileOccupancy([place(PATH, 'path@5,5', 5, 5)]);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, besideIt).blocked).toBe(false);
    expect(planAt(COTTAGE, { x: 3, z: 5 }, besideIt, 1).blocked).toBe(true);
  });

  it('blocks an object the ground under it will not take', () => {
    expect(planAt(COTTAGE, { x: 3, z: 7 }, createTileOccupancy(), 0, undefined, dry).blocked).toBe(
      true,
    );
    expect(planAt(COTTAGE, { x: 3, z: 3 }, createTileOccupancy(), 0, undefined, dry).blocked).toBe(
      false,
    );
  });

  it('builds on an island out in the bay, past the plot itself', () => {
    const coast = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 6, beach: 4, wave: 0, seed: 1 },
    });
    const bay = createTerrain({ shore: coast, elevation: null, tilesX: 20, tilesZ: 20 });
    const island: Tile = { x: -6, z: 28 };
    const isDry = (tile: Tile): boolean => bay.surfaceOf(tile.x, tile.z) !== 'water';
    const levelOf: LevelProvider = (tileX, tileZ) => bay.levelOf(tileX, tileZ);
    expect(bay.isSea(island.x, island.z)).toBe(true);
    expect(planAt(PATH, island, createTileOccupancy(), 0, levelOf, isDry).blocked).toBe(true);

    bay.set(island.x, island.z, { level: 1, surface: 'sand' });
    expect(planAt(PATH, island, createTileOccupancy(), 0, levelOf, isDry).blocked).toBe(false);
  });

  it('asks the ground about every tile of the footprint, not only its corner', () => {
    expect(planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 0, undefined, dry).blocked).toBe(
      true,
    );
    expect(planAt(COTTAGE, { x: 3, z: 5 }, createTileOccupancy(), 1, undefined, dry).blocked).toBe(
      false,
    );
  });
});

describe('tilesBetween', () => {
  it('gives just the tile when a drag never left it', () => {
    expect(tilesBetween({ x: 2, z: 2 }, { x: 2, z: 2 })).toEqual([{ x: 2, z: 2 }]);
  });

  it('fills a straight run, ends included', () => {
    expect(tilesBetween({ x: 0, z: 3 }, { x: 3, z: 3 })).toEqual([
      { x: 0, z: 3 },
      { x: 1, z: 3 },
      { x: 2, z: 3 },
      { x: 3, z: 3 },
    ]);
  });

  it('runs backwards as readily as forwards', () => {
    expect(tilesBetween({ x: 0, z: 2 }, { x: 0, z: 0 })).toEqual([
      { x: 0, z: 2 },
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ]);
  });

  it('leaves no gap when the pointer jumped a diagonal', () => {
    const tiles = tilesBetween({ x: 0, z: 0 }, { x: 4, z: 2 });
    expect(tiles[0]).toEqual({ x: 0, z: 0 });
    expect(tiles.at(-1)).toEqual({ x: 4, z: 2 });
    for (let index = 1; index < tiles.length; index++) {
      const step = Math.max(
        Math.abs(tiles[index]!.x - tiles[index - 1]!.x),
        Math.abs(tiles[index]!.z - tiles[index - 1]!.z),
      );
      expect(step).toBe(1);
    }
  });
});

describe('planStroke', () => {
  it('paves every free tile the stroke ran over', () => {
    const stroke = planStroke(
      PATH,
      tilesBetween({ x: 0, z: 0 }, { x: 2, z: 0 }),
      createTileOccupancy(),
    );
    expect(stroke.map((placement) => placement.key)).toEqual(['path@0,0', 'path@1,0', 'path@2,0']);
  });

  it('paves around what is in the way rather than stopping at it', () => {
    const occupancy = createTileOccupancy([place(PATH, 'hedge@1,0', 1, 0)]);
    const stroke = planStroke(PATH, tilesBetween({ x: 0, z: 0 }, { x: 2, z: 0 }), occupancy);
    expect(stroke.map((placement) => placement.key)).toEqual(['path@0,0', 'path@2,0']);
  });
});

describe('layoutItemFor', () => {
  it('takes the footprint and the shelf of a catalogue type, without its voxels', () => {
    const cottage = objectTypeById('cottage');
    expect(layoutItemFor(cottage)).toEqual({
      id: 'cottage',
      tilesX: cottage.model.tiles.x,
      tilesZ: cottage.model.tiles.z,
      width: cottage.model.width,
      depth: cottage.model.depth,
      category: cottage.category,
      doors: cottage.venue!.doors,
    });
  });

  it('leaves the doors off a type that declares none', () => {
    expect(layoutItemFor(objectTypeById('palm'))).not.toHaveProperty('doors');
  });
});
