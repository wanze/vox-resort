import { describe, expect, it, vi } from 'vitest';
import type * as Voxelgen from '../../../../voxel-gen/voxelgen.ts';

// Painting is what the mesh worker is for; anywhere else it costs the page a second and
// hundreds of megabytes it never gets back.
vi.mock('../../../../voxel-gen/voxelgen.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Voxelgen>()),
  buildModel: () => {
    throw new Error('A model was painted outside the mesh worker');
  },
}));

describe('the page and the prep worker', () => {
  it('prepare a resort without painting a voxel', async () => {
    const { OBJECT_TYPES } = await import('./objectTypes');
    const { priceOf } = await import('./prices');
    await import('./placementFacts');
    const { prepareResort } = await import('../../resort-prep/domain/prepareResort');
    for (const type of OBJECT_TYPES) expect(priceOf(type.id)).toBeGreaterThanOrEqual(0);
    const prepared = prepareResort({
      source: { kind: 'generate', params: { tilesX: 48, tilesZ: 48, density: 0.6, seed: 5 } },
      repeat: 1,
      view: null,
    });
    expect(prepared.plot.placements.length).toBeGreaterThan(0);
  });
});
