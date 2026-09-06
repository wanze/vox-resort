/**
 * Wraps meshed attribute arrays in Three.js buffer geometries.
 *
 * The work of turning DVE's output into attributes — decoding its interleaved
 * vertex stream, merging coplanar faces, splitting emissive colours out — is all
 * in `domain/modelAttributes.ts`, which knows nothing about Three.js and can
 * therefore run in a worker. What is left here is the part that cannot: the
 * geometries themselves, which only exist on the thread that owns the renderer.
 *
 * Two things happen upstream that the first milestone did differently:
 *
 * - **Colour moves into the vertices.** DVE emits a submesh per (section,
 *   material), and the first pass gave each colour its own Three.js material and
 *   its own mesh — 217 draw calls for 217 colours, and every one of them spanned
 *   the whole world, so frustum culling never had anything to cull. Writing the
 *   colour into a vertex attribute collapses all of that onto a single shared
 *   material, which is what makes instancing possible at all.
 * - **Geometry is per model, not per world.** Each model is meshed once in its
 *   own scratch region, so the sections coming back are grouped by the region
 *   that owns them and rebased onto the model's own origin.
 */

import { BufferAttribute, BufferGeometry } from "three/webgpu";
import type { MeshAttributes, ModelAttributes } from "./domain/modelAttributes";

export interface ModelGeometry {
  readonly id: string;
  /** Shaded geometry: everything that is not declared emissive. */
  readonly lit: BufferGeometry | null;
  /** Unlit geometry: the model's glowing colours. */
  readonly emissive: BufferGeometry | null;
  readonly triangleCount: number;
  /** Triangles the mesher produced, before the greedy pass merged them. */
  readonly unmergedTriangleCount: number;
}

function toGeometry(attributes: MeshAttributes): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(attributes.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(attributes.normals, 3));
  // Three.js reads a packed hex as sRGB and stores it in the linear working
  // space; the attributes arrive already converted, in exactly that space.
  geometry.setAttribute("color", new BufferAttribute(attributes.colors, 3));
  geometry.setIndex(new BufferAttribute(attributes.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Builds one geometry pair per model from attributes the mesher produced. */
export function buildModelGeometries(models: readonly ModelAttributes[]): ModelGeometry[] {
  return models.map((model) => ({
    id: model.id,
    lit: model.lit ? toGeometry(model.lit) : null,
    emissive: model.emissive ? toGeometry(model.emissive) : null,
    triangleCount: model.triangleCount,
    unmergedTriangleCount: model.unmergedTriangleCount,
  }));
}
