/**
 * Builds the scene as instanced draws: one `InstancedMesh` per model, however
 * many of that model the plan puts on the plot.
 *
 * Every object stands in its own footprint and never touches its neighbours, so
 * nothing is lost by meshing a model on its own and repeating it — and the win
 * is large. A resort of 1 100 objects uploads roughly 30 geometries instead of
 * one world-sized blob per colour, and submits on the order of 40 draw calls
 * rather than 217. Placements only ever translate, so the per-instance matrix
 * is a pure translation.
 *
 * Instances are then split by chunk of the plot, so those meshes are small
 * enough for the renderer to cull — see `domain/spatialChunks.ts` for why one
 * mesh per model was never culled at all.
 */

import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type BufferGeometry,
  type Material,
} from "three/webgpu";
import { vertexColor } from "three/tsl";
import type { BakedLightVolume } from "../../lighting/adapters/bakedLightVolume";
import type { Placement } from "../../layout/domain/resortLayout";
import { bucketByChunk, CHUNK_VOXELS, chunkKey } from "../domain/spatialChunks";
import type { ModelGeometry } from "./voxelMeshBuilder";

export interface InstancedWorld {
  readonly group: Group;
  /** Meshes in the scene: one per model, material kind and chunk it appears in. */
  readonly drawCalls: number;
  /** Chunks the plot was split into. */
  readonly chunkCount: number;
  /** Triangles uploaded to the GPU once, across all model geometries. */
  readonly uniqueTriangleCount: number;
  /** What the mesher emitted before coplanar faces were merged. */
  readonly unmergedTriangleCount: number;
  /** Triangles the renderer walks per frame, instances included. */
  readonly drawnTriangleCount: number;
  readonly instanceCount: number;
  dispose(): void;
}

/**
 * Shaded surfaces; colour comes from the vertex attribute, shading from the
 * scene. One instance of this material is shared by every model: they differ
 * only in geometry, and a material per model is a shader program per model for
 * the renderer to compile, bind and sort.
 *
 * The resort's own lamps arrive through `emissiveNode`, read out of the baked
 * volume rather than evaluated per fragment — see `lighting/bakedLightVolume.ts`.
 */
function litMaterial(volume: BakedLightVolume | null): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });
  if (volume) material.emissiveNode = volume.lampLight(vertexColor().rgb);
  return material;
}

/**
 * Glowing surfaces. Unlit rather than emissive-mapped: a basic material takes
 * the vertex colour straight to the screen, which is exactly what a lamp head
 * or a flame wants, in daylight and after dark alike. Shared for the same
 * reason the lit material is.
 */
function glowMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({ vertexColors: true });
}

/** Groups placements by object type, preserving plan order. */
export function instancesByType(
  placements: readonly Placement[],
): ReadonlyMap<string, readonly Placement[]> {
  const byType = new Map<string, Placement[]>();
  for (const placement of placements) {
    let list = byType.get(placement.id);
    if (!list) {
      list = [];
      byType.set(placement.id, list);
    }
    list.push(placement);
  }
  return byType;
}

export interface InstancedWorldOptions {
  /** Baked lamp light to blend into the shaded material; without it, nothing glows at night. */
  readonly lightVolume?: BakedLightVolume | null;
  /** Chunk edge in voxels; a chunk is the unit the renderer culls. */
  readonly chunkVoxels?: number;
}

export function buildInstancedWorld(
  geometries: readonly ModelGeometry[],
  placements: readonly Placement[],
  options: InstancedWorldOptions = {},
): InstancedWorld {
  const group = new Group();
  group.name = "voxel-world";

  const byType = instancesByType(placements);
  const geometryById = new Map(geometries.map((entry) => [entry.id, entry]));
  const lit = litMaterial(options.lightVolume ?? null);
  const glow = glowMaterial();
  const materials: Material[] = [lit, glow];
  const owned: BufferGeometry[] = [];

  let drawCalls = 0;
  let drawnTriangleCount = 0;
  let uniqueTriangleCount = 0;
  let unmergedTriangleCount = 0;
  let instanceCount = 0;

  const chunkVoxels = options.chunkVoxels ?? CHUNK_VOXELS;
  const chunks = new Set<string>();
  const matrix = new Matrix4();
  for (const [id, instances] of byType) {
    const model = geometryById.get(id);
    if (!model) throw new Error(`No geometry was meshed for object type "${id}"`);
    uniqueTriangleCount += model.triangleCount;
    unmergedTriangleCount += model.unmergedTriangleCount;
    instanceCount += instances.length;

    for (const [geometry, material] of [
      [model.lit, lit] as const,
      [model.emissive, glow] as const,
    ]) {
      if (!geometry) continue;
      owned.push(geometry);
      const triangles = (geometry.getIndex()?.count ?? 0) / 3;

      for (const bucket of bucketByChunk(instances, chunkVoxels)) {
        chunks.add(chunkKey(bucket.chunk));
        const mesh = new InstancedMesh(geometry, material, bucket.items.length);
        mesh.name = `${id}@${chunkKey(bucket.chunk)}`;
        bucket.items.forEach((placement, index) => {
          mesh.setMatrixAt(index, matrix.makeTranslation(placement.x, 0, placement.z));
        });
        mesh.instanceMatrix.needsUpdate = true;
        // The sphere is what the frustum test reads; without it the mesh would
        // fall back on the geometry's own, which knows nothing of where the
        // instances stand.
        mesh.computeBoundingSphere();
        group.add(mesh);

        drawCalls++;
        drawnTriangleCount += triangles * bucket.items.length;
      }
    }
  }

  return {
    group,
    drawCalls,
    chunkCount: chunks.size,
    uniqueTriangleCount,
    unmergedTriangleCount,
    drawnTriangleCount,
    instanceCount,
    dispose() {
      group.clear();
      for (const material of materials) material.dispose();
      for (const geometry of owned) geometry.dispose();
    },
  };
}
