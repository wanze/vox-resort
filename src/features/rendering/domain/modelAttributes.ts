// Plain typed arrays only, so this runs in a worker. Colours use lightGrid's sRGB curve
// rather than Color for the same reason; a test pins the two together.

import { srgbToLinear } from '../../lighting/domain/lightGrid';
import type { ScratchRegion } from '../../voxel-world/domain/modelScratch';
import { regionOwning } from '../../voxel-world/domain/modelScratch';
import { greedyMesh, quadCorners, quadNormal } from './greedyMesh';
import { deinterleaveVertices, needsThirtyTwoBitIndices } from './vertexBuffer';

export const MISSING_COLOR = 0xff00ff;

export interface MeshAttributes {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array | Uint16Array;
  readonly triangleCount: number;
  readonly panes: Float32Array | null;
}

// Hashed from the pane position, not counted, so an edit does not renumber every window
// behind it and move whose light is on.
export function paneSeed(x: number, y: number, z: number): number {
  let hash = Math.imul(Math.round(x) | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (Math.round(y) | 0), 0x165667b1);
  hash = Math.imul(hash ^ (Math.round(z) | 0), 0x9e3779b1);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

// Split by colour here, where it is free, so the whole scene shares four materials.
type SurfaceKind = 'lit' | 'emissive' | 'water' | 'window';

export interface ModelAttributes {
  readonly id: string;
  readonly lit: MeshAttributes | null;
  readonly emissive: MeshAttributes | null;
  readonly water: MeshAttributes | null;
  readonly window: MeshAttributes | null;
  readonly triangleCount: number;
  readonly unmergedTriangleCount: number;
}

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
  readonly colorsByMaterialId: ReadonlyMap<string, number>;
  readonly emissiveByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly waterByModelId: ReadonlyMap<string, ReadonlySet<number>>;
  readonly windowsByModelId: ReadonlyMap<string, ReadonlySet<number>>;
}

function linearColorOf(color: number): [number, number, number] {
  return [
    srgbToLinear(((color >> 16) & 0xff) / 255),
    srgbToLinear(((color >> 8) & 0xff) / 255),
    srgbToLinear((color & 0xff) / 255),
  ];
}

class AttributeBatch {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly panes: number[] | null;
  private vertexCount = 0;
  private sourceTriangles = 0;

  constructor(tracksPanes: boolean) {
    this.panes = tracksPanes ? [] : null;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  get unmergedTriangleCount(): number {
    return this.sourceTriangles;
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  add(
    section: SectionMesh,
    positions: Float32Array,
    normals: Float32Array,
    offset: { x: number; y: number; z: number },
    color: readonly [number, number, number],
    scale: number,
  ): void {
    const merged = greedyMesh({ positions, normals, indices: section.indices });
    this.sourceTriangles += merged.sourceTriangleCount;

    for (const quad of merged.quads) {
      const [nx, ny, nz] = quadNormal(quad);
      const base = this.vertexCount;
      // Already counter-clockwise from the side the face points at, which Three.js treats as front.
      const corners = quadCorners(quad);
      // Equal across the four vertices so the seed survives interpolation unchanged.
      const [sx, sy, sz] = corners[0]!;
      const seed = paneSeed(sx + offset.x, sy + offset.y, sz + offset.z);
      for (const [x, y, z] of corners) {
        this.positions.push((x + offset.x) * scale, (y + offset.y) * scale, (z + offset.z) * scale);
        this.normals.push(nx, ny, nz);
        this.colors.push(color[0], color[1], color[2]);
        this.panes?.push(seed);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.vertexCount += 4;
    }

    // Non-voxel triangles need a winding flip: DVE output is wound for Babylon.
    for (const triangle of merged.passthrough) {
      const base = this.vertexCount;
      for (const vertex of [
        section.indices[triangle]!,
        section.indices[triangle + 2]!,
        section.indices[triangle + 1]!,
      ]) {
        this.positions.push(
          (positions[vertex * 3]! + offset.x) * scale,
          (positions[vertex * 3 + 1]! + offset.y) * scale,
          (positions[vertex * 3 + 2]! + offset.z) * scale,
        );
        this.normals.push(normals[vertex * 3]!, normals[vertex * 3 + 1]!, normals[vertex * 3 + 2]!);
        this.colors.push(color[0], color[1], color[2]);
        this.panes?.push(
          paneSeed(
            positions[vertex * 3]! + offset.x,
            positions[vertex * 3 + 1]! + offset.y,
            positions[vertex * 3 + 2]! + offset.z,
          ),
        );
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
      // Halving the index buffer is worth the check; most models stay under 65 536 vertices.
      indices: needsThirtyTwoBitIndices(indices) ? indices : Uint16Array.from(indices),
      triangleCount: this.triangleCount,
      panes: this.panes ? Float32Array.from(this.panes) : null,
    };
  }
}

export function buildModelAttributes(input: ModelAttributeInput): ModelAttributes[] {
  const {
    sections,
    regions,
    colorsByMaterialId,
    emissiveByModelId,
    waterByModelId,
    windowsByModelId,
  } = input;

  const colorCache = new Map<string, [number, number, number]>();
  const colorFor = (materialId: string): [number, number, number] => {
    let color = colorCache.get(materialId);
    if (!color) {
      color = linearColorOf(colorsByMaterialId.get(materialId) ?? MISSING_COLOR);
      colorCache.set(materialId, color);
    }
    return color;
  };

  const batches = new Map<string, Record<SurfaceKind, AttributeBatch>>();
  for (const region of regions) {
    batches.set(region.id, {
      lit: new AttributeBatch(false),
      emissive: new AttributeBatch(false),
      water: new AttributeBatch(false),
      window: new AttributeBatch(true),
    });
  }

  const kindOf = (modelId: string, color: number): SurfaceKind => {
    if (emissiveByModelId.get(modelId)?.has(color) === true) return 'emissive';
    if (waterByModelId.get(modelId)?.has(color) === true) return 'water';
    if (windowsByModelId.get(modelId)?.has(color) === true) return 'window';
    return 'lit';
  };

  for (const section of sections) {
    const region = regionOwning(regions, section.origin.x);
    if (!region) throw new Error(`Meshed section at x=${section.origin.x} belongs to no model`);
    const batch = batches.get(region.id)!;
    const raw = colorsByMaterialId.get(section.materialId) ?? MISSING_COLOR;
    const { positions, normals } = deinterleaveVertices(section.vertices, section.vertexCount);
    const offset = {
      x: section.origin.x - region.x,
      y: section.origin.y,
      z: section.origin.z,
    };
    // A coarse copy is painted small and grown back here, so it fills the full model's space.
    batch[kindOf(region.source ?? region.id, raw)].add(
      section,
      positions,
      normals,
      offset,
      colorFor(section.materialId),
      region.scale ?? 1,
    );
  }

  return regions.map((region) => {
    const { lit, emissive, water, window } = batches.get(region.id)!;
    const all = [lit, emissive, water, window];
    return {
      id: region.id,
      lit: lit.isEmpty ? null : lit.toAttributes(),
      emissive: emissive.isEmpty ? null : emissive.toAttributes(),
      water: water.isEmpty ? null : water.toAttributes(),
      window: window.isEmpty ? null : window.toAttributes(),
      triangleCount: all.reduce((total, batch) => total + batch.triangleCount, 0),
      unmergedTriangleCount: all.reduce((total, batch) => total + batch.unmergedTriangleCount, 0),
    };
  });
}

export function transferablesOf(models: readonly ModelAttributes[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const model of models) {
    for (const attributes of [model.lit, model.emissive, model.water, model.window]) {
      if (!attributes) continue;
      buffers.push(
        attributes.positions.buffer as ArrayBuffer,
        attributes.normals.buffer as ArrayBuffer,
        attributes.colors.buffer as ArrayBuffer,
        attributes.indices.buffer as ArrayBuffer,
      );
      if (attributes.panes) buffers.push(attributes.panes.buffer as ArrayBuffer);
    }
  }
  return buffers;
}
