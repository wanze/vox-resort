import { describe, expect, it } from 'vitest';
import { materialKeyFor, voxelIdFor } from '../../catalog/domain/materials';
import {
  emissiveByModelId,
  materialColorsOf,
  materialsOf,
  paintedCatalogue,
  paintedModelsOf,
  waterByModelId,
  windowsByModelId,
} from '../../catalog/domain/paintedModels';
import { scratchLayoutFor } from '../domain/modelScratch';
import { DEFAULT_WORLD_SCALE, sectionSizeOf } from './dveEngine';
import { meshOnThisThread } from './meshJob';

// Paving is the most repeated object, so every mosaic piece is held near the plain path's 88: a
// resort paved wall to wall in mosaic must not cost much more to draw than one paved in path.
const MOSAIC_TRIANGLES = 128;

describe('the mosaic pieces as meshed', () => {
  it('stays within the triangle budget for paving', async () => {
    const models = paintedCatalogue()
      .types.map((type) => type.model)
      .filter((model) => model.id === 'path' || model.mosaic !== null);
    const painted = paintedModelsOf(paintedCatalogue());
    const materials = materialsOf(painted);
    const scratch = scratchLayoutFor(
      models,
      (color) => voxelIdFor(materialKeyFor(color)),
      sectionSizeOf(DEFAULT_WORLD_SCALE),
    );
    const { models: meshed } = await meshOnThisThread({
      materials,
      writes: scratch.writes,
      regions: scratch.regions,
      colorsByMaterialId: materialColorsOf(materials),
      emissiveByModelId: emissiveByModelId(painted),
      waterByModelId: waterByModelId(painted),
      windowsByModelId: windowsByModelId(painted),
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
