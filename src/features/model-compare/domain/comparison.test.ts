import { describe, expect, it } from 'vitest';
import { DRAFT_VARIANTS, VARIANTS } from '../../../../voxel-gen/variants/index.ts';
import { buildComparison, comparisonEntries, statChanges } from './comparison';

describe('comparisonEntries', () => {
  it('lists one entry per variant, drafts last, named after the model it would replace', () => {
    const entries = comparisonEntries();
    expect(entries.map((entry) => entry.variantId)).toEqual(
      [...VARIANTS, ...DRAFT_VARIANTS].map((v) => v.source.id),
    );
    expect(entries.find((entry) => entry.id === 'palm')?.label).toBe('Palm');
  });
});

describe('buildComparison', () => {
  it('builds the original and the variant side by side', () => {
    const comparison = buildComparison('palm-b');
    expect(comparison.original.model.id).toBe('palm');
    expect(comparison.variant.model.id).toBe('palm-b');
    expect(comparison.variant.mesh.triangleCount).toBeGreaterThan(0);
  });

  it('refuses an unknown variant', () => {
    expect(() => buildComparison('casino-b')).toThrow(/casino-b/);
  });
});

describe('statChanges', () => {
  it('reports each figure before and after, and how far it moved', () => {
    const voxels = statChanges(buildComparison('palm-b')).find((stat) => stat.name === 'Voxels')!;
    expect(voxels.ratio).toBeCloseTo(voxels.variant / voxels.original);
  });
});
