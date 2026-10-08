import { describe, expect, it } from 'vitest';
import { buildModel, defineModel } from '../../../../voxel-gen/voxelgen.ts';
import { paintedCatalogue, paintedModelsOf } from '../../catalog/domain/paintedModels';
import { coarseIdOf } from '../domain/coarseVoxels';
import { layoutFor } from './meshJob';

describe('layoutFor', () => {
  it('lays out a model built at runtime beside the registry', () => {
    const extra = buildModel(
      defineModel({
        id: 'made-at-runtime',
        label: 'Made at runtime',
        category: 'grounds',
        tiles: { x: 1, z: 1 },
        build: (b) => b.box(0, 3, 0, 3, 0, 3, 0x808080),
      }),
    );
    const catalogue = paintedCatalogue();
    const { regions } = layoutFor(
      [...paintedModelsOf(catalogue), extra],
      [...catalogue.types.map((type) => type.model), extra],
    );
    const ids = new Set(regions.map((region) => region.id));
    expect(ids.has(extra.id)).toBe(true);
    expect(ids.has(coarseIdOf(extra.id))).toBe(true);
  });
});
