// Shared by meshCatalogue.ts and meshWorker.ts so the two halves do not import each other in a circle.

import type { VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { materialKeyFor, voxelIdFor } from '../../catalog/domain/materials';
import type { MaterialDefinition } from '../../catalog/domain/materials';
import {
  emissiveByModelId,
  materialColorsOf,
  materialsOf,
  paintedCatalogue,
  paintedModelsOf,
  waterByModelId,
  windowsByModelId,
} from '../../catalog/domain/paintedModels';
import type { ModelAttributes } from '../../rendering/domain/modelAttributes';
import { buildModelAttributes } from '../../rendering/domain/modelAttributes';
import { coarseScratchModelOf } from '../domain/coarseVoxels';
import {
  canopyScratchModelsOf,
  scratchLayoutFor,
  type PackedVoxelWrites,
  type ScratchLayout,
  type ScratchRegion,
} from '../domain/modelScratch';
import { buildSectionMeshes, DEFAULT_WORLD_SCALE, sectionSizeOf } from './dveEngine';

export interface MeshCatalogueRequest {
  readonly materials: readonly MaterialDefinition[];
  readonly writes: PackedVoxelWrites;
  readonly regions: readonly ScratchRegion[];
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly waterByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly windowsByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface MeshModelsRequest {
  // Built models to mesh beside the registry, as object types. Empty until models can be made
  // at runtime; plain data, so it crosses to the worker by structured clone.
  readonly extraTypes: readonly VoxelModel[];
}

export interface MeshModelsResult {
  readonly models: readonly ModelAttributes[];
  readonly dveMs: number;
  // Painting and laying out, before DVE starts.
  readonly buildMs: number;
  readonly meshedVoxelCount: number;
}

export interface WireResponse {
  readonly models: readonly ModelAttributes[];
  readonly dveMs: number;
  readonly buildMs: number;
  readonly meshedVoxelCount: number;
  readonly error?: string;
}

export async function meshOnThisThread(
  request: MeshCatalogueRequest,
): Promise<{ models: ModelAttributes[]; dveMs: number }> {
  const started = performance.now();
  const sections = await buildSectionMeshes(request.materials, request.writes);
  const dveMs = Math.round(performance.now() - started);
  return {
    models: buildModelAttributes({
      sections,
      regions: request.regions,
      colorsByMaterialId: request.colorsByMaterialId,
      emissiveByModelId: request.emissiveByModelId,
      waterByModelId: request.waterByModelId,
      windowsByModelId: request.windowsByModelId,
    }),
    dveMs,
  };
}

export function layoutFor(
  painted: readonly VoxelModel[],
  types: readonly VoxelModel[],
): ScratchLayout {
  const scratch = scratchLayoutFor(
    [
      ...painted,
      ...painted.flatMap(canopyScratchModelsOf),
      ...types.map((model) => coarseScratchModelOf(model)),
    ],
    (color) => voxelIdFor(materialKeyFor(color)),
    sectionSizeOf(DEFAULT_WORLD_SCALE),
  );
  if (scratch.extentX > DEFAULT_WORLD_SCALE.horizontalExtent) {
    throw new Error(
      `The models need ${scratch.extentX} voxels of scratch space, the world allows ${DEFAULT_WORLD_SCALE.horizontalExtent}`,
    );
  }
  return scratch;
}

export async function meshModelsOnThisThread(
  request: MeshModelsRequest,
): Promise<MeshModelsResult> {
  const started = performance.now();
  const catalogue = paintedCatalogue();
  const types = [...catalogue.types.map((type) => type.model), ...request.extraTypes];
  const painted = [...paintedModelsOf(catalogue), ...request.extraTypes];
  const { writes, regions } = layoutFor(painted, types);
  const materials = materialsOf(painted);
  const buildMs = Math.round(performance.now() - started);
  const { models, dveMs } = await meshOnThisThread({
    materials,
    writes,
    regions,
    colorsByMaterialId: materialColorsOf(materials),
    emissiveByModelId: emissiveByModelId(painted),
    waterByModelId: waterByModelId(painted),
    windowsByModelId: windowsByModelId(painted),
  });
  return { models, dveMs, buildMs, meshedVoxelCount: writes.voxelIds.length };
}
