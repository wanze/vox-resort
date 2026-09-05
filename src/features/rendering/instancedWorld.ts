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
 */

import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from "three/webgpu";
import type { Placement } from "../layout/domain/resortLayout";
import type { ModelGeometry } from "./voxelMeshBuilder";

export interface InstancedWorld {
  readonly group: Group;
  /** Meshes submitted to the renderer — one per model per material kind. */
  readonly drawCalls: number;
  /** Triangles uploaded to the GPU once, across all model geometries. */
  readonly uniqueTriangleCount: number;
  /** Triangles the renderer walks per frame, instances included. */
  readonly drawnTriangleCount: number;
  readonly instanceCount: number;
  dispose(): void;
}

/** Shaded surfaces; colour comes from the vertex attribute, shading from the scene. */
function litMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });
}

/**
 * Glowing surfaces. Unlit rather than emissive-mapped: a basic material takes
 * the vertex colour straight to the screen, which is exactly what a lamp head
 * or a flame wants, in daylight and after dark alike.
 */
function glowMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ vertexColors: true });
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

export function buildInstancedWorld(
  geometries: readonly ModelGeometry[],
  placements: readonly Placement[],
): InstancedWorld {
  const group = new Group();
  group.name = "voxel-world";

  const byType = instancesByType(placements);
  const geometryById = new Map(geometries.map((entry) => [entry.id, entry]));
  const materials: Material[] = [];
  const owned: BufferGeometry[] = [];

  let drawCalls = 0;
  let drawnTriangleCount = 0;
  let uniqueTriangleCount = 0;
  let instanceCount = 0;

  const matrix = new Matrix4();
  for (const [id, instances] of byType) {
    const model = geometryById.get(id);
    if (!model) throw new Error(`No geometry was meshed for object type "${id}"`);
    uniqueTriangleCount += model.triangleCount;
    instanceCount += instances.length;

    for (const [geometry, material] of [
      [model.lit, litMaterial()] as const,
      [model.emissive, glowMaterial()] as const,
    ]) {
      if (!geometry) {
        material.dispose();
        continue;
      }
      materials.push(material);
      owned.push(geometry);
      const mesh = new InstancedMesh(geometry, material, instances.length);
      mesh.name = id;
      instances.forEach((placement, index) => {
        mesh.setMatrixAt(index, matrix.makeTranslation(placement.x, 0, placement.z));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);

      drawCalls++;
      const triangles = (geometry.getIndex()?.count ?? 0) / 3;
      drawnTriangleCount += triangles * instances.length;
    }
  }

  return {
    group,
    drawCalls,
    uniqueTriangleCount,
    drawnTriangleCount,
    instanceCount,
    dispose() {
      group.clear();
      for (const material of materials) material.dispose();
      for (const geometry of owned) geometry.dispose();
    },
  };
}
