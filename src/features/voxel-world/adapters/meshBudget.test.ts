import { describe, expect, it } from 'vitest';
import { materialKeyFor, voxelIdFor } from '../../catalog/domain/materials';
import {
  allMaterials,
  emissiveByModelId,
  materialColorsById,
  OBJECT_TYPES,
  waterByModelId,
  windowsByModelId,
} from '../../catalog/domain/objectTypes';
import { scratchLayoutFor } from '../domain/modelScratch';
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from './dveEngine';
import { meshOnThisThread } from './meshJob';

// Paving is the most repeated object, so every mosaic piece is held near the plain path's 88: a
// resort paved wall to wall in mosaic must not cost much more to draw than one paved in path.
const MOSAIC_TRIANGLES = 128;

describe('the mosaic pieces as meshed', () => {
  it('stays within the triangle budget for paving', async () => {
    const models = OBJECT_TYPES.filter(
      (type) => type.id === 'path' || type.model.mosaic !== null,
    ).map((type) => type.model);
    const scratch = scratchLayoutFor(
      models,
      (color) => voxelIdFor(materialKeyFor(color)),
      sectionSizeOf(DEFAULT_WORLD_SCALE),
    );
    const { models: meshed } = await meshOnThisThread({
      materials: allMaterials(),
      writes: scratch.writes,
      regions: scratch.regions,
      colorsByMaterialId: materialColorsById(),
      emissiveByModelId: emissiveByModelId(),
      waterByModelId: waterByModelId(),
      windowsByModelId: windowsByModelId(),
    });
    const counts = new Map(meshed.map((model) => [model.id, model.triangleCount]));
    console.info([...counts].map(([id, count]) => `${id} ${count}`).join('\n'));
    expect(counts.size).toBe(models.length);
    for (const model of models) {
      if (model.mosaic === null) continue;
      expect(counts.get(model.id), model.id).toBeLessThanOrEqual(MOSAIC_TRIANGLES);
    }
  }, 60_000);
});
