/**
 * What a field of always-moving instances is made of.
 *
 * Two features draw one — the balloons over the beach and the craft on the bay —
 * and a third nearly does, which is the crowd. All three invert
 * `domain/spatialChunks.ts` on purpose and for one reason: chunking exists to
 * give a static mesh a bounding sphere the renderer can reject, and a sphere
 * over instances that all moved this frame is a sphere that would have to be
 * recomputed this frame. So a moving field is one `InstancedMesh` per model per
 * surface, never culled, its whole matrix buffer rewritten every frame.
 *
 * The moves that are the same wherever that is done are here: hanging a model's
 * geometry on the point its matrix carries, allocating one mesh per surface the
 * model actually has, and working out which members of the field are drawn in
 * which model. Nothing about *what moves* is here, and nothing here knows what a
 * balloon or a boat is — the shape of the per-frame write differs between the
 * two (a scale for one, a full attitude for the other), and that is exactly the
 * part each field keeps.
 *
 * The crowd does not use this and should not: its meshes carry two instanced
 * attributes of their own that the walk shader reads, and its geometry is hung
 * on a figure's feet rather than being centred. See `crowd/adapters/crowdField.ts`.
 */

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

/** One model's geometry of one kind, and which members are drawn in each slot. */
export interface FieldMesh {
  readonly mesh: InstancedMesh;
  /** The field's own copy of the geometry; see {@link hungGeometry}. */
  readonly geometry: BufferGeometry;
  /** Member index drawn in each instance slot, in slot order. */
  readonly members: Int32Array;
  /** Triangles in a single instance of this geometry. */
  readonly triangles: number;
}

/**
 * Where a model has to be moved to hang on its own middle and on the foot of its
 * box: centred across and along, and with its lowest layer at zero.
 *
 * So the matrix carries where the thing *is* rather than where the corner of its
 * bounding box is, which is what lets a scale in that matrix grow a balloon
 * about itself instead of dragging it sideways, and a roll in it heel a boat
 * about its own keel instead of swinging it round a corner.
 *
 * **Taken over every surface the model has, not over each one on its own.** A
 * model arrives split by how its colours are shaded (see
 * `domain/modelAttributes.ts`), and those pieces are parts of one object: the
 * buoy's lamp is six metres above the drum it is a lamp for, and a balloon's
 * envelope hangs over the basket rather than around it. Hung one box at a time,
 * every piece would be dragged down onto the model's foot and in onto its
 * middle, which puts the lamp inside the drum and the envelope around the
 * basket: geometry sharing a plane with geometry, which is the stippled fight
 * the depth buffer makes of two faces it cannot choose between.
 */
function hangOf(sources: readonly BufferGeometry[]): Vector3 {
  const box = new Box3();
  for (const source of sources) {
    source.computeBoundingBox();
    box.union(source.boundingBox!);
  }
  return new Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
}

/**
 * One surface's geometry, moved onto the hang its whole model shares.
 *
 * Cloned rather than used as it stands: the geometries belong to the meshed
 * catalogue, which is built once at load and outlives every resort, and this
 * translation must not be applied to them twice.
 */
function hungGeometry(source: BufferGeometry, hang: Vector3): BufferGeometry {
  const geometry = source.clone();
  geometry.translate(hang.x, hang.y, hang.z);
  return geometry;
}

/** Allocates one never-culled instanced mesh for one model's geometry of one kind. */
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
  // Every instance moves every frame; see the note at the top of the file.
  mesh.frustumCulled = false;
  return {
    mesh,
    geometry,
    members: parts.members,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
  };
}

/**
 * Which members of a field are drawn in one model, as the slots of its meshes.
 *
 * Handed the field's `variant` column rather than the field itself, which is
 * what keeps this from having to know what kind of field it is: a balloon and a
 * boat both carry one, and it means the same thing in both.
 */
export function slotsFor(variants: Int32Array, count: number, variant: number): Int32Array {
  const mine: number[] = [];
  for (let index = 0; index < count; index++) {
    if (variants[index] === variant) mine.push(index);
  }
  return Int32Array.from(mine);
}

/** One kind of surface a model is drawn with, and the material it is drawn in. */
export interface FieldSurface {
  /** Names the mesh, which is all the field ever calls it. */
  readonly kind: string;
  /** The meshed geometry, or null for a surface this model does not have. */
  readonly source: BufferGeometry | null;
  readonly material: Material;
}

/**
 * The meshes one model needs, one per surface it actually has.
 *
 * Nothing at all for a model nobody is drawn in, and nothing for a surface the
 * model does not paint — a balloon with no basket is simply a glow, and only one
 * thing on the water has a lamp on it.
 */
export function fieldMeshesFor(parts: {
  /** Names the meshes, alongside each surface's kind. */
  readonly name: string;
  readonly surfaces: readonly FieldSurface[];
  readonly members: Int32Array;
}): FieldMesh[] {
  if (parts.members.length === 0) return [];
  const drawn = parts.surfaces.filter((surface) => surface.source !== null);
  // One hang for all of them, taken before any is moved; see `hangOf`.
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

/** The two materials a moving field draws its models with. */
export interface FieldMaterials {
  /** The resort's own lit material: what a hull, a basket or a body is drawn in. */
  readonly lit: Material;
  /** Unlit: what a lamp, a lantern or any other glowing colour is drawn in. */
  readonly glow: Material;
  dispose(): void;
}

/**
 * The materials a moving field needs, both of them.
 *
 * The lit one samples the bake wherever the instance matrix put it, which is
 * what gets a moving thing the resort's lamplight for free — the fetch was
 * already happening. The glow one is the resort's own unlit material: the vertex
 * colour goes straight to the screen, which is what a lamp burning after dark
 * wants and the reason a model declares `emissive` at all.
 *
 * A field with nothing glowing in it allocates one material it never binds,
 * which is a great deal cheaper than each field deciding for itself.
 */
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

/** Throws away a field's meshes and the geometry clones it made for them. */
export function disposeFieldMeshes(parts: readonly FieldMesh[]): void {
  for (const part of parts) {
    part.mesh.dispose();
    // The field's own clone, unlike the geometry it was taken from: that one
    // belongs to the meshed catalogue and outlives every resort.
    part.geometry.dispose();
  }
}

/** Triangles a field of these meshes submits per frame. */
export const fieldTriangles = (parts: readonly FieldMesh[]): number =>
  parts.reduce((total, part) => total + part.triangles * part.members.length, 0);
