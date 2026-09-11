/**
 * The catalogue-meshing job: what it is asked to do, how that crosses a worker
 * boundary, and how to run it on whichever thread is calling.
 *
 * This sits between `meshCatalogue.ts`, which owns the worker, and
 * `meshWorker.ts`, which is the far side of it. Both need the same request
 * shape, the same wire encoding and the same work; keeping all three here is
 * what stops the two halves importing each other in a circle.
 */

import type { MaterialDefinition } from '../../catalog/domain/materials';
import type { ModelAttributes } from '../../rendering/domain/modelAttributes';
import { buildModelAttributes } from '../../rendering/domain/modelAttributes';
import type { ScratchRegion } from '../domain/modelScratch';
import type { PackedVoxelWrites, VoxelWrite } from '../domain/voxelWrites';
import { packVoxelWrites, unpackVoxelWrites } from '../domain/voxelWrites';
import { buildSectionMeshes } from './dveEngine';

export interface MeshCatalogueRequest {
  readonly materials: readonly MaterialDefinition[];
  readonly writes: readonly VoxelWrite[];
  readonly regions: readonly ScratchRegion[];
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly waterByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly windowsByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface MeshCatalogueResult {
  readonly models: readonly ModelAttributes[];
  /** Milliseconds the voxel mesher itself took, wherever it ran. */
  readonly dveMs: number;
  /** Whether the work happened off the main thread. */
  readonly threaded: boolean;
}

/**
 * The wire form of a request. `Map` survives structured cloning, but a `Set`
 * inside a `Map` value is clearer written out, and the catalogue is small.
 */
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
  return {
    materials: request.materials,
    writes: packVoxelWrites(request.writes),
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
    writes: unpackVoxelWrites(wire.writes),
    regions: wire.regions,
    colorsByMaterialId: new Map(wire.colors),
    emissiveByModelId: new Map(wire.emissive.map(([id, colors]) => [id, new Set(colors)])),
    waterByModelId: new Map(wire.water.map(([id, colors]) => [id, new Set(colors)])),
    windowsByModelId: new Map(wire.windows.map(([id, colors]) => [id, new Set(colors)])),
  };
}

/** Meshes the catalogue on whichever thread is calling. */
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
