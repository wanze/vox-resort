/**
 * Meshes the catalogue, in a worker when the browser allows one.
 *
 * The catalogue is meshed exactly once, however large the resort is — that is
 * what makes instancing pay — but "once" still costs about 1.2 seconds of DVE
 * and a further 0.2 running the greedy merge over its output, and on the main
 * thread that is 1.4 seconds in which the page does not respond, does not paint
 * and does not answer a click.
 *
 * None of that work touches the DOM or the renderer: it reads plain numbers and
 * writes typed arrays. So it runs in a worker and the arrays are transferred
 * back, leaving the main thread free to show a loading state that actually
 * animates. The main-thread path is kept as a fallback, because a worker can
 * fail to start for reasons that have nothing to do with this code, and a resort
 * that renders late is better than one that does not render.
 */

import type { MaterialDefinition } from "../catalog/domain/materials";
import type { ModelAttributes } from "../rendering/domain/modelAttributes";
import { buildModelAttributes } from "../rendering/domain/modelAttributes";
import type { ScratchRegion } from "./domain/modelScratch";
import type { PackedVoxelWrites, VoxelWrite } from "./domain/voxelWrites";
import { packVoxelWrites, unpackVoxelWrites } from "./domain/voxelWrites";
import { buildSectionMeshes } from "./dveEngine";

export interface MeshCatalogueRequest {
  readonly materials: readonly MaterialDefinition[];
  readonly writes: readonly VoxelWrite[];
  readonly regions: readonly ScratchRegion[];
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
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
  };
}

export function fromWire(wire: WireRequest): MeshCatalogueRequest {
  return {
    materials: wire.materials,
    writes: unpackVoxelWrites(wire.writes),
    regions: wire.regions,
    colorsByMaterialId: new Map(wire.colors),
    emissiveByModelId: new Map(wire.emissive.map(([id, colors]) => [id, new Set(colors)])),
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
    }),
    dveMs,
  };
}

/** How long to wait for the worker before giving up and meshing here instead. */
const WORKER_TIMEOUT_MS = 30_000;

function runInWorker(request: MeshCatalogueRequest): Promise<MeshCatalogueResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./meshWorker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("The mesh worker did not answer"));
    }, WORKER_TIMEOUT_MS);

    const finish = (outcome: () => void): void => {
      clearTimeout(timer);
      worker.terminate();
      outcome();
    };

    worker.addEventListener("message", (event: MessageEvent<WireResponse>) => {
      const data = event.data;
      finish(() =>
        data.error
          ? reject(new Error(data.error))
          : resolve({ models: data.models, dveMs: data.dveMs, threaded: true }),
      );
    });
    worker.addEventListener("error", (event) => {
      finish(() => reject(new Error(event.message || "The mesh worker failed")));
    });
    const wire = toWire(request);
    // Three quarters of a million writes: transferred, not cloned.
    worker.postMessage(wire, {
      transfer: [wire.writes.positions.buffer, wire.writes.voxelIds.buffer],
    });
  });
}

/**
 * Meshes the catalogue off the main thread, falling back to the main thread if
 * the worker cannot be started or does not answer.
 */
export async function meshCatalogue(
  request: MeshCatalogueRequest,
  options: { readonly forceMainThread?: boolean } = {},
): Promise<MeshCatalogueResult> {
  if (options.forceMainThread !== true && typeof Worker !== "undefined") {
    try {
      return await runInWorker(request);
    } catch (cause: unknown) {
      console.warn("Meshing on the main thread; the worker was unavailable.", cause);
    }
  }
  const { models, dveMs } = await meshOnThisThread(request);
  return { models, dveMs, threaded: false };
}
