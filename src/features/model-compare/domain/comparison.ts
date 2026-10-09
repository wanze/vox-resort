import { MODEL_SOURCES } from '../../../../voxel-gen/models/index.ts';
import {
  DRAFT_VARIANTS,
  VARIANTS,
  type ModelVariant,
} from '../../../../voxel-gen/variants/index.ts';
import {
  buildModel,
  type VoxelModel,
  type VoxelModelSource,
} from '../../../../voxel-gen/voxelgen.ts';
import { meshVoxelModel, type VoxelMesh } from './voxelMesh';

export interface ComparedModel {
  readonly model: VoxelModel;
  readonly mesh: VoxelMesh;
  readonly colorCount: number;
}

export interface Comparison {
  readonly id: string;
  readonly label: string;
  readonly original: ComparedModel;
  readonly variant: ComparedModel;
}

// 'original' and 'variant' show one take at a time in the same spot, so flipping between them
// shows what changed.
export type CompareView = 'side' | 'original' | 'variant';

export interface ComparisonEntry {
  readonly id: string;
  readonly label: string;
  readonly variantId: string;
}

const COMPARED: readonly ModelVariant[] = [...VARIANTS, ...DRAFT_VARIANTS];

function compared(source: VoxelModelSource): ComparedModel {
  const model = buildModel(source);
  return {
    model,
    mesh: meshVoxelModel(model),
    colorCount: new Set(model.voxels.map((voxel) => voxel.color)).size,
  };
}

function originalOf(variant: ModelVariant): VoxelModelSource {
  const original = MODEL_SOURCES.find((source) => source.id === variant.of);
  if (!original) throw new Error(`${variant.source.id} is a variant of unknown ${variant.of}`);
  return original;
}

// Listed cheaply so the page can show every pair before meshing any of them.
export function comparisonEntries(): ComparisonEntry[] {
  return COMPARED.map((variant) => ({
    id: variant.of,
    label: originalOf(variant).label,
    variantId: variant.source.id,
  }));
}

export function buildComparison(variantId: string): Comparison {
  const variant = COMPARED.find((candidate) => candidate.source.id === variantId);
  if (!variant) throw new Error(`No variant ${variantId}`);
  const original = originalOf(variant);
  return {
    id: variant.of,
    label: original.label,
    original: compared(original),
    variant: compared(variant.source),
  };
}

export interface StatChange {
  readonly name: string;
  readonly original: number;
  readonly variant: number;
  readonly ratio: number;
}

const change = (name: string, original: number, variant: number): StatChange => ({
  name,
  original,
  variant,
  ratio: variant / Math.max(1, original),
});

export function statChanges({ original, variant }: Comparison): StatChange[] {
  return [
    change('Voxels', original.model.voxels.length, variant.model.voxels.length),
    change('Triangles', original.mesh.triangleCount, variant.mesh.triangleCount),
    change('Colours', original.colorCount, variant.colorCount),
    change('Height', original.model.height, variant.model.height),
  ];
}
