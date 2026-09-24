import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES, sceneryOf } from '../../catalog/domain/objectTypes';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import {
  SATURATION,
  SCENERY_REACH,
  sceneryAt,
  sceneryFieldFor,
  sceneryItemsOf,
  sceneryOver,
  type SceneryItem,
} from './scenery';

const item = (tileX: number, tileZ: number, strength = 1, tiles = 1): SceneryItem => ({
  tileX,
  tileZ,
  tilesX: tiles,
  tilesZ: tiles,
  strength,
});

describe('sceneryFieldFor', () => {
  it('saturates a tile under a full-strength item to one over one plus the saturation', () => {
    const field = sceneryFieldFor([item(5, 5)], 20, 20);
    expect(sceneryAt(field, 5, 5)).toBeCloseTo(1 / (1 + SATURATION));
  });

  it('falls with distance and gives nothing past the reach', () => {
    const field = sceneryFieldFor([item(0, 0)], 20, 20);
    for (let distance = 1; distance <= SCENERY_REACH; distance++) {
      expect(sceneryAt(field, distance, 0), `${distance}`).toBeGreaterThan(0);
      expect(sceneryAt(field, distance, 0)).toBeLessThan(sceneryAt(field, distance - 1, 0));
    }
    expect(sceneryAt(field, SCENERY_REACH + 1, 0)).toBe(0);
    expect(sceneryAt(field, SCENERY_REACH + 1, SCENERY_REACH + 1)).toBe(0);
  });

  it('makes two items worth more than one, but less than twice as much', () => {
    const one = sceneryAt(sceneryFieldFor([item(4, 4, 0.5)], 20, 20), 5, 5);
    const two = sceneryAt(sceneryFieldFor([item(4, 4, 0.5), item(6, 6, 0.5)], 20, 20), 5, 5);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(2 * one);
  });

  it('never reaches 1, however much stands around a tile', () => {
    const forest = Array.from({ length: 81 }, (_, index) => item(index % 9, Math.floor(index / 9)));
    expect(sceneryAt(sceneryFieldFor(forest, 9, 9), 4, 4)).toBeLessThan(1);
  });

  it('counts every tile of a big footprint as standing under it', () => {
    const field = sceneryFieldFor([item(3, 3, 1, 2)], 10, 10);
    const under = sceneryAt(field, 3, 3);
    for (const [x, z] of [
      [4, 3],
      [3, 4],
      [4, 4],
    ] as const) {
      expect(sceneryAt(field, x, z)).toBe(under);
    }
    expect(sceneryAt(field, 5, 5)).toBeLessThan(under);
  });
});

describe('sceneryAt', () => {
  it('answers 0 off the grid', () => {
    const field = sceneryFieldFor([item(0, 0)], 4, 4);
    expect(sceneryAt(field, -1, 0)).toBe(0);
    expect(sceneryAt(field, 0, -1)).toBe(0);
    expect(sceneryAt(field, 4, 0)).toBe(0);
    expect(sceneryAt(field, 0, 4)).toBe(0);
  });
});

describe('sceneryOver', () => {
  it('gives a lodging with nothing around it no setting at all', () => {
    const field = sceneryFieldFor([item(0, 0)], 30, 30);
    expect(sceneryOver(field, { tileX: 20, tileZ: 20, tilesX: 3, tilesZ: 2 })).toBe(0);
    expect(sceneryOver(field, { tileX: 1, tileZ: 1, tilesX: 3, tilesZ: 2 })).toBeGreaterThan(0);
  });
});

describe('on the generated plot', () => {
  const TYPES = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    category: type.category,
    placement: type.model.placement,
  }));
  const ITEMS: LayoutItem[] = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
    category: type.category,
    doors: type.venue?.doors ?? [],
  }));
  const plan = generateResort(
    TYPES,
    clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
  );
  const layout = layoutResort(ITEMS, plan);

  it('is pleasant in places, and plain enough elsewhere to leave the player something to do', () => {
    const items = sceneryItemsOf([...layout.placements, ...layout.props], sceneryOf);
    const field = sceneryFieldFor(items, plan.tilesX, plan.tilesZ);
    const paved = layout.paths.map((tile) => sceneryAt(field, tile.tileX, tile.tileZ));
    const mean = paved.reduce((sum, value) => sum + value, 0) / paved.length;
    const plain = paved.filter((value) => value < 0.1).length / paved.length;
    const measured = `mean ${mean.toFixed(3)}, plain ${(plain * 100).toFixed(1)}% of ${paved.length}`;
    expect(mean, measured).toBeGreaterThanOrEqual(0.1);
    expect(mean, measured).toBeLessThanOrEqual(0.5);
    expect(plain, measured).toBeGreaterThanOrEqual(0.1);
  });
});
