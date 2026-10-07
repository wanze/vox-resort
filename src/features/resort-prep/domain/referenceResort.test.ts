import { describe, expect, it } from 'vitest';
import json from '../../../../fixtures/reference-resort.json';
import { familyOf, objectTypeById, ORIGINAL_TYPES } from '../../catalog/domain/objectTypes';
import { shoreFor } from '../../layout/domain/shoreline';
import { rotateExtent } from '../../layout/domain/rotation';
import { terrainFor } from '../../layout/domain/terrain';
import { islandBoxesFor } from '../../sea/domain/islands';
import { pierBoxesFor } from '../../sea/domain/piers';
import { worldMisfits } from '../../sharing/domain/worldFits';
import { referenceWorldOf } from './referenceResort';
import { planOfWorld } from './savedWorld';

// Append-only: a new model goes onto the reference resort, or onto this list on purpose.
const NOT_IN_REFERENCE: readonly string[] = [];

const world = referenceWorldOf(json);
const plan = planOfWorld(world);
const everything = [...world.placements, ...world.props, ...world.paths, ...world.rails];

describe('the reference resort', () => {
  it('parses as a saved world, its land owned as the game keeps it', () => {
    expect(world.land?.owned).toBeInstanceOf(Uint8Array);
    expect(everything.length).toBeGreaterThan(0);
  });

  it('holds every placement at its model’s size, so a model that grows needs a re-export', () => {
    const misfits = everything.flatMap((placement) => {
      const { model } = objectTypeById(placement.id);
      const tiles = rotateExtent(model.tiles.x, model.tiles.z, placement.rotation);
      const size = rotateExtent(model.width, model.depth, placement.rotation);
      const fits =
        placement.tilesX === tiles.x &&
        placement.tilesZ === tiles.z &&
        placement.width === size.x &&
        placement.depth === size.z;
      return fits ? [] : [placement.key];
    });
    expect(misfits).toEqual([]);
    expect(worldMisfits(world)).toEqual([]);
  });

  it('has a shore with a pier out into the sea and an island off it', () => {
    const shore = shoreFor(plan);
    expect(shore).not.toBeNull();
    expect(pierBoxesFor(shore, world.paths).length).toBeGreaterThan(0);
    expect(islandBoxesFor(terrainFor(plan)).length).toBeGreaterThan(0);
  });

  it('stands every family but those kept off it', () => {
    const standing = new Set(everything.map((placement) => familyOf(placement.id)));
    const missing = ORIGINAL_TYPES.map((type) => type.id).filter((id) => !standing.has(id));
    expect(missing).toEqual(NOT_IN_REFERENCE);
  });
});
