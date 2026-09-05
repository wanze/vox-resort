import { describe, expect, it } from "vitest";
import {
  deinterleaveVertices,
  flipWinding,
  needsThirtyTwoBitIndices,
  NORMAL_OFFSET,
  POSITION_OFFSET,
  UV_OFFSET,
  VERTEX_FLOAT_STRIDE,
} from "./vertexBuffer";

function packVertices(
  vertices: ReadonlyArray<{
    position: [number, number, number];
    normal: [number, number, number];
    uv: [number, number];
  }>,
): Float32Array {
  const data = new Float32Array(vertices.length * VERTEX_FLOAT_STRIDE);
  vertices.forEach((vertex, index) => {
    const base = index * VERTEX_FLOAT_STRIDE;
    data.set(vertex.position, base + POSITION_OFFSET);
    data.set(vertex.normal, base + NORMAL_OFFSET);
    data.set(vertex.uv, base + UV_OFFSET);
    // Slots DVE uses for texture indices and packed voxel data; ignored here.
    data[base + 8] = 7;
    data[base + 18] = 9;
  });
  return data;
}

const sample = packVertices([
  { position: [1, 2, 3], normal: [0, 1, 0], uv: [0, 1] },
  { position: [-4, 5, 6], normal: [1, 0, 0], uv: [1, 0] },
]);

describe("deinterleaveVertices", () => {
  it("extracts positions, normals and uvs", () => {
    const { positions, normals, uvs } = deinterleaveVertices(sample, 2);
    expect([...positions]).toEqual([1, 2, 3, -4, 5, 6]);
    expect([...normals]).toEqual([0, 1, 0, 1, 0, 0]);
    expect([...uvs]).toEqual([0, 1, 1, 0]);
  });

  it("ignores the texture-index and voxel-data slots", () => {
    const { positions, normals } = deinterleaveVertices(sample, 2);
    expect([...positions, ...normals]).not.toContain(7);
    expect([...positions, ...normals]).not.toContain(9);
  });

  it("reads only the requested vertex count", () => {
    expect(deinterleaveVertices(sample, 1).positions).toHaveLength(3);
  });

  it("handles an empty submesh", () => {
    const { positions } = deinterleaveVertices(new Float32Array(0), 0);
    expect(positions).toHaveLength(0);
  });

  it("rejects a buffer that is too short", () => {
    expect(() => deinterleaveVertices(sample, 3)).toThrow(/need/);
  });

  it("rejects a negative vertex count", () => {
    expect(() => deinterleaveVertices(sample, -1)).toThrow();
  });
});

describe("flipWinding", () => {
  it("reverses every triangle without touching its first corner", () => {
    expect([...flipWinding(Uint32Array.from([0, 1, 2, 3, 4, 5]))]).toEqual([0, 2, 1, 3, 5, 4]);
  });

  it("is its own inverse", () => {
    const indices = Uint32Array.from([7, 8, 9, 1, 2, 3]);
    expect([...flipWinding(flipWinding(indices))]).toEqual([...indices]);
  });

  it("leaves the input untouched", () => {
    const indices = Uint32Array.from([0, 1, 2]);
    flipWinding(indices);
    expect([...indices]).toEqual([0, 1, 2]);
  });

  it("rejects a buffer that is not whole triangles", () => {
    expect(() => flipWinding(Uint32Array.from([0, 1, 2, 3]))).toThrow(/triangles/);
  });
});

describe("needsThirtyTwoBitIndices", () => {
  it("is false while indices fit in 16 bits", () => {
    expect(needsThirtyTwoBitIndices(new Uint32Array([0, 1, 0xffff]))).toBe(false);
  });

  it("is true once an index exceeds 16 bits", () => {
    expect(needsThirtyTwoBitIndices(new Uint32Array([0, 0x10000]))).toBe(true);
  });
});
