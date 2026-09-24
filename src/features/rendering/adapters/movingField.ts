import {
  Box3,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicNodeMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { litMaterial } from './instancedWorld';

export interface FieldMesh {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly members: Int32Array;
  readonly triangles: number;
}

// Hung on the model's middle and foot so a scale or roll in the matrix acts about
// the object itself. Taken over all surfaces together: hung one at a time, a buoy's
// lamp would drop into its drum and z-fight.
function hangOf(sources: readonly BufferGeometry[]): Vector3 {
  const box = new Box3();
  for (const source of sources) {
    source.computeBoundingBox();
    box.union(source.boundingBox!);
  }
  return new Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
}

// Cloned: the source belongs to the meshed catalogue, which outlives every resort.
function hungGeometry(source: BufferGeometry, hang: Vector3): BufferGeometry {
  const geometry = source.clone();
  geometry.translate(hang.x, hang.y, hang.z);
  return geometry;
}

function buildFieldMesh(parts: {
  readonly source: BufferGeometry;
  readonly hang: Vector3;
  readonly material: Material;
  readonly name: string;
  readonly members: Int32Array;
}): FieldMesh {
  const geometry = hungGeometry(parts.source, parts.hang);
  const mesh = new InstancedMesh(geometry, parts.material, parts.members.length);
  mesh.name = parts.name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame, so a bounding sphere would be stale at once.
  mesh.frustumCulled = false;
  return {
    mesh,
    geometry,
    members: parts.members,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
  };
}

export function slotsFor(variants: Int32Array, count: number, variant: number): Int32Array {
  const mine: number[] = [];
  for (let index = 0; index < count; index++) {
    if (variants[index] === variant) mine.push(index);
  }
  return Int32Array.from(mine);
}

export interface FieldSurface {
  readonly kind: string;
  readonly source: BufferGeometry | null;
  readonly material: Material;
}

export function fieldMeshesFor(parts: {
  readonly name: string;
  readonly surfaces: readonly FieldSurface[];
  readonly members: Int32Array;
}): FieldMesh[] {
  if (parts.members.length === 0) return [];
  const drawn = parts.surfaces.filter((surface) => surface.source !== null);
  const hang = hangOf(drawn.map((surface) => surface.source!));
  return drawn.map((surface) =>
    buildFieldMesh({
      source: surface.source!,
      hang,
      material: surface.material,
      name: `${parts.name}-${surface.kind}`,
      members: parts.members,
    }),
  );
}

export interface FieldMaterials {
  readonly lit: Material;
  readonly glow: Material;
  dispose(): void;
}

export function fieldMaterials(lightVolume: BakedLightVolume | null): FieldMaterials {
  const lit = litMaterial(lightVolume);
  const glow = new MeshBasicNodeMaterial({ vertexColors: true });
  return {
    lit,
    glow,
    dispose() {
      lit.dispose();
      glow.dispose();
    },
  };
}

export function disposeFieldMeshes(parts: readonly FieldMesh[]): void {
  for (const part of parts) {
    part.mesh.dispose();
    part.geometry.dispose();
  }
}

export const fieldTriangles = (parts: readonly FieldMesh[]): number =>
  parts.reduce((total, part) => total + part.triangles * part.members.length, 0);
