/**
 * Turns DVE's compacted section meshes into one reusable geometry per model.
 *
 * Two things happen here that the first milestone did differently:
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
 *
 * Colours a model declares as emissive are split into a second geometry, drawn
 * unlit so a lamp head or a flame still reads as lit after dark.
 */

import { BufferAttribute, BufferGeometry, Color } from "three/webgpu";
import type { ScratchRegion } from "../voxel-world/domain/modelScratch";
import { regionOwning } from "../voxel-world/domain/modelScratch";
import type { RawSectionMesh } from "../voxel-world/dveEngine";
import { deinterleaveVertices, flipWinding, needsThirtyTwoBitIndices } from "./domain/vertexBuffer";

/** Magenta is the deliberate "material was never registered" colour. */
const MISSING_COLOR = 0xff00ff;

export interface ModelGeometry {
  readonly id: string;
  /** Shaded geometry: everything that is not declared emissive. */
  readonly lit: BufferGeometry | null;
  /** Unlit geometry: the model's glowing colours. */
  readonly emissive: BufferGeometry | null;
  readonly triangleCount: number;
}

/** Accumulates section submeshes into flat attribute arrays. */
class GeometryBatch {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private vertexCount = 0;

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  /** Appends one submesh, rebasing it from section-local onto model-local space. */
  add(section: RawSectionMesh, offset: { x: number; y: number; z: number }, color: Color): void {
    const { positions, normals } = deinterleaveVertices(section.vertices, section.vertexCount);
    for (let vertex = 0; vertex < section.vertexCount; vertex++) {
      this.positions.push(
        positions[vertex * 3]! + offset.x,
        positions[vertex * 3 + 1]! + offset.y,
        positions[vertex * 3 + 2]! + offset.z,
      );
      this.normals.push(normals[vertex * 3]!, normals[vertex * 3 + 1]!, normals[vertex * 3 + 2]!);
      this.colors.push(color.r, color.g, color.b);
    }
    // DVE hands back Babylon-wound triangles; Three.js culls those as backfaces.
    for (const index of flipWinding(section.indices)) this.indices.push(index + this.vertexCount);
    this.vertexCount += section.vertexCount;
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(this.normals), 3));
    geometry.setAttribute("color", new BufferAttribute(Float32Array.from(this.colors), 3));
    const indices = Uint32Array.from(this.indices);
    geometry.setIndex(
      needsThirtyTwoBitIndices(indices)
        ? new BufferAttribute(indices, 1)
        : new BufferAttribute(Uint16Array.from(indices), 1),
    );
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface ModelGeometryInput {
  readonly sections: readonly RawSectionMesh[];
  readonly regions: readonly ScratchRegion[];
  /** Flat colour per DVE material id. */
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  /** Colours each model draws unlit, by model id. */
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * Groups the mesher's output back into one lit and one emissive geometry per
 * model, in scratch-region order.
 */
export function buildModelGeometries(input: ModelGeometryInput): ModelGeometry[] {
  const { sections, regions, colorsByMaterialId, emissiveByModelId } = input;

  // Three.js reads a packed hex as sRGB and stores it in the linear working
  // space, so the vertex colours land in exactly the space the shader wants.
  const colorCache = new Map<string, Color>();
  const colorFor = (materialId: string): Color => {
    let color = colorCache.get(materialId);
    if (!color) {
      color = new Color(colorsByMaterialId.get(materialId) ?? MISSING_COLOR);
      colorCache.set(materialId, color);
    }
    return color;
  };

  const batches = new Map<string, { lit: GeometryBatch; emissive: GeometryBatch }>();
  for (const region of regions) {
    batches.set(region.id, { lit: new GeometryBatch(), emissive: new GeometryBatch() });
  }

  for (const section of sections) {
    const region = regionOwning(regions, section.origin.x);
    if (!region) throw new Error(`Meshed section at x=${section.origin.x} belongs to no model`);
    const batch = batches.get(region.id)!;
    const raw = colorsByMaterialId.get(section.materialId) ?? MISSING_COLOR;
    const glows = emissiveByModelId.get(region.id)?.has(raw) === true;
    const offset = {
      x: section.origin.x - region.x,
      y: section.origin.y,
      z: section.origin.z,
    };
    (glows ? batch.emissive : batch.lit).add(section, offset, colorFor(section.materialId));
  }

  return regions.map((region) => {
    const { lit, emissive } = batches.get(region.id)!;
    return {
      id: region.id,
      lit: lit.isEmpty ? null : lit.toGeometry(),
      emissive: emissive.isEmpty ? null : emissive.toGeometry(),
      triangleCount: lit.triangleCount + emissive.triangleCount,
    };
  });
}
