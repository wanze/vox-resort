/**
 * Turns the mesher's output into the flat attribute arrays a buffer geometry is
 * made of — and nothing else.
 *
 * The split matters: everything here is plain typed arrays over plain numbers,
 * with no reference to Three.js or the DOM, which is what lets the whole of it
 * run in a worker and be transferred back rather than blocking the page for a
 * second and a half while the catalogue is meshed. `voxelMeshBuilder.ts` is the
 * thin main-thread half that wraps the result in geometries.
 *
 * Colours are converted with `lightGrid`'s own sRGB curve rather than through a
 * `Color`, for the same reason, and it is the same curve: see the test that
 * pins the two together.
 */

import { srgbToLinear } from "../../lighting/domain/lightGrid";
import type { ScratchRegion } from "../../voxel-world/domain/modelScratch";
import { regionOwning } from "../../voxel-world/domain/modelScratch";
import { greedyMesh, quadCorners, quadNormal } from "./greedyMesh";
import { deinterleaveVertices, needsThirtyTwoBitIndices } from "./vertexBuffer";

/** Magenta is the deliberate "material was never registered" colour. */
export const MISSING_COLOR = 0xff00ff;

/** One geometry's worth of attributes, ready to be handed to a renderer. */
export interface MeshAttributes {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array | Uint16Array;
  readonly triangleCount: number;
}

export interface ModelAttributes {
  readonly id: string;
  /** Shaded geometry: everything that is not declared emissive. */
  readonly lit: MeshAttributes | null;
  /** Unlit geometry: the model's glowing colours. */
  readonly emissive: MeshAttributes | null;
  readonly triangleCount: number;
  /** Triangles the mesher produced, before the greedy pass merged them. */
  readonly unmergedTriangleCount: number;
}

/** The section submesh shape this module needs; `dveEngine` produces it. */
export interface SectionMesh {
  readonly materialId: string;
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly vertices: Float32Array;
  readonly vertexCount: number;
  readonly indices: Uint32Array;
}

export interface ModelAttributeInput {
  readonly sections: readonly SectionMesh[];
  readonly regions: readonly ScratchRegion[];
  /** Flat colour per DVE material id. */
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  /** Colours each model draws unlit, by model id. */
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

/** Splits a packed `0xRRGGBB` into the linear RGB the shader works in. */
function linearColorOf(color: number): [number, number, number] {
  return [
    srgbToLinear(((color >> 16) & 0xff) / 255),
    srgbToLinear(((color >> 8) & 0xff) / 255),
    srgbToLinear((color & 0xff) / 255),
  ];
}

/** Accumulates merged quads into flat attribute arrays. */
class AttributeBatch {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private vertexCount = 0;
  private sourceTriangles = 0;

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  get unmergedTriangleCount(): number {
    return this.sourceTriangles;
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  /**
   * Appends one submesh, rebasing it from section-local onto model-local space.
   *
   * A submesh is one section and one material, so every face in it is the same
   * flat colour — which is exactly the condition under which coplanar faces can
   * be merged without anyone being able to tell.
   */
  add(
    section: SectionMesh,
    positions: Float32Array,
    normals: Float32Array,
    offset: { x: number; y: number; z: number },
    color: readonly [number, number, number],
  ): void {
    const merged = greedyMesh({ positions, normals, indices: section.indices });
    this.sourceTriangles += merged.sourceTriangleCount;

    for (const quad of merged.quads) {
      const [nx, ny, nz] = quadNormal(quad);
      const base = this.vertexCount;
      // The merged corners are already wound counter-clockwise as seen from the
      // side the face points at, which is the winding Three.js treats as front.
      for (const [x, y, z] of quadCorners(quad)) {
        this.positions.push(x + offset.x, y + offset.y, z + offset.z);
        this.normals.push(nx, ny, nz);
        this.colors.push(color[0], color[1], color[2]);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.vertexCount += 4;
    }

    // Anything the merge did not recognise as a voxel face is copied across as
    // it came, with the winding flip DVE's Babylon-wound output needs.
    for (const triangle of merged.passthrough) {
      const base = this.vertexCount;
      for (const vertex of [
        section.indices[triangle]!,
        section.indices[triangle + 2]!,
        section.indices[triangle + 1]!,
      ]) {
        this.positions.push(
          positions[vertex * 3]! + offset.x,
          positions[vertex * 3 + 1]! + offset.y,
          positions[vertex * 3 + 2]! + offset.z,
        );
        this.normals.push(normals[vertex * 3]!, normals[vertex * 3 + 1]!, normals[vertex * 3 + 2]!);
        this.colors.push(color[0], color[1], color[2]);
      }
      this.indices.push(base, base + 1, base + 2);
      this.vertexCount += 3;
    }
  }

  toAttributes(): MeshAttributes {
    const indices = Uint32Array.from(this.indices);
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      colors: Float32Array.from(this.colors),
      // Sixteen bits index 65 536 vertices, and the merge keeps most models well
      // inside that; halving the index buffer is worth the check.
      indices: needsThirtyTwoBitIndices(indices) ? indices : Uint16Array.from(indices),
      triangleCount: this.triangleCount,
    };
  }
}

/**
 * Groups the mesher's output back into one lit and one emissive set of
 * attributes per model, in scratch-region order.
 */
export function buildModelAttributes(input: ModelAttributeInput): ModelAttributes[] {
  const { sections, regions, colorsByMaterialId, emissiveByModelId } = input;

  const colorCache = new Map<string, [number, number, number]>();
  const colorFor = (materialId: string): [number, number, number] => {
    let color = colorCache.get(materialId);
    if (!color) {
      color = linearColorOf(colorsByMaterialId.get(materialId) ?? MISSING_COLOR);
      colorCache.set(materialId, color);
    }
    return color;
  };

  const batches = new Map<string, { lit: AttributeBatch; emissive: AttributeBatch }>();
  for (const region of regions) {
    batches.set(region.id, { lit: new AttributeBatch(), emissive: new AttributeBatch() });
  }

  for (const section of sections) {
    const region = regionOwning(regions, section.origin.x);
    if (!region) throw new Error(`Meshed section at x=${section.origin.x} belongs to no model`);
    const batch = batches.get(region.id)!;
    const raw = colorsByMaterialId.get(section.materialId) ?? MISSING_COLOR;
    const glows = emissiveByModelId.get(region.id)?.has(raw) === true;
    const { positions, normals } = deinterleaveVertices(section.vertices, section.vertexCount);
    const offset = {
      x: section.origin.x - region.x,
      y: section.origin.y,
      z: section.origin.z,
    };
    (glows ? batch.emissive : batch.lit).add(
      section,
      positions,
      normals,
      offset,
      colorFor(section.materialId),
    );
  }

  return regions.map((region) => {
    const { lit, emissive } = batches.get(region.id)!;
    return {
      id: region.id,
      lit: lit.isEmpty ? null : lit.toAttributes(),
      emissive: emissive.isEmpty ? null : emissive.toAttributes(),
      triangleCount: lit.triangleCount + emissive.triangleCount,
      unmergedTriangleCount: lit.unmergedTriangleCount + emissive.unmergedTriangleCount,
    };
  });
}

/** Every typed array in a model's attributes, for a worker to transfer. */
export function transferablesOf(models: readonly ModelAttributes[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const model of models) {
    for (const attributes of [model.lit, model.emissive]) {
      if (!attributes) continue;
      buffers.push(
        attributes.positions.buffer as ArrayBuffer,
        attributes.normals.buffer as ArrayBuffer,
        attributes.colors.buffer as ArrayBuffer,
        attributes.indices.buffer as ArrayBuffer,
      );
    }
  }
  return buffers;
}
