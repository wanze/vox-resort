/**
 * Pure conversion of DVE's interleaved voxel vertex format into the flat,
 * per-attribute arrays Three.js buffer geometries expect.
 *
 * DVE packs one vertex into 24 floats:
 *   0..2  position    4..6  normal    8..10 texture indices (u32)
 *   12,13 uv          14..16 colour   18..21 voxel data (u32)
 * Only position and normal are needed here — placeholder colour comes from the
 * submesh's material, not from the vertex stream.
 */

export const VERTEX_FLOAT_STRIDE = 24;
export const POSITION_OFFSET = 0;
export const NORMAL_OFFSET = 4;
export const UV_OFFSET = 12;

export interface VertexAttributes {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
}

/** Splits the interleaved stream into position, normal and uv arrays. */
export function deinterleaveVertices(
  vertices: Float32Array,
  vertexCount: number,
): VertexAttributes {
  if (vertexCount < 0) throw new Error("Vertex count cannot be negative");
  if (vertices.length < vertexCount * VERTEX_FLOAT_STRIDE) {
    throw new Error(
      `Vertex buffer holds ${vertices.length} floats, need ${vertexCount * VERTEX_FLOAT_STRIDE}`,
    );
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const base = vertex * VERTEX_FLOAT_STRIDE;
    positions[vertex * 3] = vertices[base + POSITION_OFFSET]!;
    positions[vertex * 3 + 1] = vertices[base + POSITION_OFFSET + 1]!;
    positions[vertex * 3 + 2] = vertices[base + POSITION_OFFSET + 2]!;
    normals[vertex * 3] = vertices[base + NORMAL_OFFSET]!;
    normals[vertex * 3 + 1] = vertices[base + NORMAL_OFFSET + 1]!;
    normals[vertex * 3 + 2] = vertices[base + NORMAL_OFFSET + 2]!;
    uvs[vertex * 2] = vertices[base + UV_OFFSET]!;
    uvs[vertex * 2 + 1] = vertices[base + UV_OFFSET + 1]!;
  }
  return { positions, normals, uvs };
}

/**
 * Reverses every triangle's winding.
 *
 * DVE winds its faces for Babylon.js, which treats clockwise triangles as
 * front-facing; Three.js treats counter-clockwise as front-facing. Left as-is,
 * the renderer culls exactly the faces that should be visible and keeps the
 * ones pointing away, so a model is seen through from the near side.
 */
export function flipWinding(indices: Uint32Array): Uint32Array {
  if (indices.length % 3 !== 0) {
    throw new Error(`Index buffer holds ${indices.length} indices, not whole triangles`);
  }
  const flipped = indices.slice();
  for (let triangle = 0; triangle < flipped.length; triangle += 3) {
    const second = flipped[triangle + 1]!;
    flipped[triangle + 1] = flipped[triangle + 2]!;
    flipped[triangle + 2] = second;
  }
  return flipped;
}

/** Widest index in the buffer, used to pick a 16- or 32-bit index attribute. */
export function needsThirtyTwoBitIndices(indices: Uint32Array): boolean {
  for (const index of indices) {
    if (index > 0xffff) return true;
  }
  return false;
}
