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

import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { fullIdOf } from '../../voxel-world/domain/coarseVoxels';
import { worthCoarsening } from '../domain/levelOfDetail';
import type { MeshAttributes, ModelAttributes } from '../domain/modelAttributes';

export interface ModelGeometry {
  readonly id: string;
  /** Shaded geometry: everything that is neither emissive nor water. */
  readonly lit: BufferGeometry | null;
  /** Unlit geometry: the model's glowing colours. */
  readonly emissive: BufferGeometry | null;
  /** The model's water, drawn with the sea's shader. */
  readonly water: BufferGeometry | null;
  /**
   * The model's window glass, carrying a `pane` attribute alongside the usual
   * three: the seed that decides whether a light is burning behind it. See
   * `domain/modelAttributes.ts` and `instancedWorld.ts`.
   */
  readonly window: BufferGeometry | null;
  readonly triangleCount: number;
  /** Triangles the mesher produced, before the greedy pass merged them. */
  readonly unmergedTriangleCount: number;
  /**
   * The model re-voxelised at a coarser grid, in the same space, drawn once the
   * full one is too small on screen to show its detail. Absent when the model
   * has none, or when it would not have saved enough to be worth a draw — see
   * `domain/levelOfDetail.ts`.
   */
  readonly coarse?: ModelGeometry | null;
}

function toGeometry(attributes: MeshAttributes): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(attributes.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(attributes.normals, 3));
  // Three.js reads a packed hex as sRGB and stores it in the linear working
  // space; the attributes arrive already converted, in exactly that space.
  geometry.setAttribute('color', new BufferAttribute(attributes.colors, 3));
  if (attributes.panes) {
    geometry.setAttribute('pane', new BufferAttribute(attributes.panes, 1));
  }
  geometry.setIndex(new BufferAttribute(attributes.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryOf(model: ModelAttributes, coarse: ModelGeometry | null): ModelGeometry {
  return {
    id: model.id,
    lit: model.lit ? toGeometry(model.lit) : null,
    emissive: model.emissive ? toGeometry(model.emissive) : null,
    water: model.water ? toGeometry(model.water) : null,
    window: model.window ? toGeometry(model.window) : null,
    triangleCount: model.triangleCount,
    unmergedTriangleCount: model.unmergedTriangleCount,
    coarse,
  };
}

/**
 * Builds one geometry set per model from attributes the mesher produced.
 *
 * A coarse copy comes back from the mesher as a model of its own, and is hung
 * off the model it was made from rather than listed: nothing but the level of
 * detail should ever be able to ask for it by id. One that does not save enough
 * triangles is dropped here, before it is ever uploaded.
 */
export function buildModelGeometries(models: readonly ModelAttributes[]): ModelGeometry[] {
  const coarseByFullId = new Map<string, ModelAttributes>();
  for (const model of models) {
    const full = fullIdOf(model.id);
    if (full !== null) coarseByFullId.set(full, model);
  }
  return models
    .filter((model) => fullIdOf(model.id) === null)
    .map((model) => {
      const coarse = coarseByFullId.get(model.id);
      const kept =
        coarse && worthCoarsening(model.triangleCount, coarse.triangleCount)
          ? geometryOf(coarse, null)
          : null;
      return geometryOf(model, kept);
    });
}
