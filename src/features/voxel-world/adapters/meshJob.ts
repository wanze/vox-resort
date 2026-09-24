// Shared by meshCatalogue.ts and meshWorker.ts so the two halves do not import each other in a circle.

import type { MaterialDefinition } from '../../catalog/domain/materials';
import type { ModelAttributes } from '../../rendering/domain/modelAttributes';
import { buildModelAttributes } from '../../rendering/domain/modelAttributes';
import type { PackedVoxelWrites, ScratchRegion } from '../domain/modelScratch';
import { buildSectionMeshes } from './dveEngine';

export interface MeshCatalogueRequest {
  readonly materials: readonly MaterialDefinition[];
  readonly writes: PackedVoxelWrites;
  readonly regions: readonly ScratchRegion[];
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly waterByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly windowsByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface MeshCatalogueResult {
  readonly models: readonly ModelAttributes[];
  readonly dveMs: number;
  readonly threaded: boolean;
}

export interface WireRequest {
  readonly materials: readonly MaterialDefinition[];
  readonly writes: PackedVoxelWrites;
  readonly regions: readonly ScratchRegion[];
  readonly colors: readonly (readonly [string, number])[];
  readonly emissive: readonly (readonly [string, readonly number[]])[];
  readonly water: readonly (readonly [string, readonly number[]])[];
  readonly windows: readonly (readonly [string, readonly number[]])[];
}

export interface WireResponse {
  readonly models: readonly ModelAttributes[];
  readonly dveMs: number;
  readonly error?: string;
}

export function toWire(request: MeshCatalogueRequest): WireRequest {
  const { positions, voxelIds, palette } = request.writes;
  return {
    materials: request.materials,
    // Copied, not transferred: the main-thread fallback still reads the request if the
    // worker fails after the post.
    writes: { positions: positions.slice(), voxelIds: voxelIds.slice(), palette },
    regions: request.regions,
    colors: [...request.colorsByMaterialId],
    emissive: [...request.emissiveByModelId].map(([id, colors]) => [id, [...colors]] as const),
    water: [...request.waterByModelId].map(([id, colors]) => [id, [...colors]] as const),
    windows: [...request.windowsByModelId].map(([id, colors]) => [id, [...colors]] as const),
  };
}

export function fromWire(wire: WireRequest): MeshCatalogueRequest {
  return {
    materials: wire.materials,
    writes: wire.writes,
    regions: wire.regions,
    colorsByMaterialId: new Map(wire.colors),
    emissiveByModelId: new Map(wire.emissive.map(([id, colors]) => [id, new Set(colors)])),
    waterByModelId: new Map(wire.water.map(([id, colors]) => [id, new Set(colors)])),
    windowsByModelId: new Map(wire.windows.map(([id, colors]) => [id, new Set(colors)])),
  };
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
