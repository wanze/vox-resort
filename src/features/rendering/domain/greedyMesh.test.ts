import { describe, expect, it } from "vitest";
import {
  facesFromTriangles,
  greedyMesh,
  planeAxes,
  quadCorners,
  quadNormal,
  type FaceAxis,
  type MergedQuad,
  type TriangleSoup,
} from "./greedyMesh";

/**
 * Builds the triangle soup a voxel mesher would emit for a set of unit faces.
 * Winding is deliberately the *wrong* way round for half the faces, because the
 * merge is supposed to read orientation off the normal rather than off the
 * winding it happens to be handed.
 */
function soupOf(
  faces: readonly { axis: FaceAxis; positive: boolean; slice: number; u: number; v: number }[],
): TriangleSoup {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((face, index) => {
    const { u, v } = planeAxes(face.axis);
    const corner = (du: number, dv: number): [number, number, number] => {
      const point: [number, number, number] = [0, 0, 0];
      point[face.axis] = face.slice;
      point[u] = face.u + du;
      point[v] = face.v + dv;
      return point;
    };
    for (const point of [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]) {
      positions.push(...point);
      const normal: [number, number, number] = [0, 0, 0];
      normal[face.axis] = face.positive ? 1 : -1;
      normals.push(...normal);
    }
    const base = index * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
  };
}

/** Every unit cell a set of merged quads covers, as sortable keys. */
function coveredCells(quads: readonly MergedQuad[]): string[] {
  const cells: string[] = [];
  for (const quad of quads) {
    for (let dv = 0; dv < quad.height; dv++) {
      for (let du = 0; du < quad.width; du++) {
        cells.push(
          `${quad.axis}:${quad.positive ? 1 : 0}:${quad.slice}:${quad.u + du}:${quad.v + dv}`,
        );
      }
    }
  }
  return cells.toSorted();
}

const grid = (
  axis: FaceAxis,
  positive: boolean,
  slice: number,
  width: number,
  height: number,
): { axis: FaceAxis; positive: boolean; slice: number; u: number; v: number }[] => {
  const faces = [];
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) faces.push({ axis, positive, slice, u, v });
  }
  return faces;
};

describe("planeAxes", () => {
  it("picks in-plane axes whose cross product is the face's own axis", () => {
    expect(planeAxes(0)).toEqual({ u: 1, v: 2 });
    expect(planeAxes(1)).toEqual({ u: 2, v: 0 });
    expect(planeAxes(2)).toEqual({ u: 0, v: 1 });
  });
});

describe("greedyMesh", () => {
  it("has nothing to merge in an empty submesh", () => {
    const mesh = greedyMesh(soupOf([]));
    expect(mesh.quads).toEqual([]);
    expect(mesh.sourceTriangleCount).toBe(0);
  });

  it("leaves a single face alone", () => {
    const mesh = greedyMesh(soupOf([{ axis: 1, positive: true, slice: 2, u: 0, v: 0 }]));
    expect(mesh.quads).toEqual([
      { axis: 1, positive: true, slice: 2, u: 0, v: 0, width: 1, height: 1 },
    ]);
  });

  it("collapses a flat 16x16 face to one rectangle", () => {
    // This is the path tile's underside, and the whole reason the pass exists.
    const mesh = greedyMesh(soupOf(grid(1, false, 0, 16, 16)));
    expect(mesh.quads).toHaveLength(1);
    expect(mesh.quads[0]).toMatchObject({ width: 16, height: 16 });
    expect(mesh.sourceTriangleCount).toBe(512);
  });

  it("merges a row before it grows a column", () => {
    const mesh = greedyMesh(soupOf(grid(1, true, 0, 4, 1)));
    expect(mesh.quads).toEqual([
      { axis: 1, positive: true, slice: 0, u: 0, v: 0, width: 4, height: 1 },
    ]);
  });

  it("never merges across a hole", () => {
    const faces = grid(1, true, 0, 3, 1).filter((face) => face.u !== 1);
    const mesh = greedyMesh(soupOf(faces));
    expect(mesh.quads).toHaveLength(2);
    expect(coveredCells(mesh.quads)).toHaveLength(2);
  });

  it("keeps opposite faces of the same plane apart", () => {
    const mesh = greedyMesh(soupOf([...grid(1, true, 4, 2, 2), ...grid(1, false, 4, 2, 2)]));
    expect(mesh.quads).toHaveLength(2);
    expect(mesh.quads.map((quad) => quad.positive).toSorted()).toEqual([false, true]);
  });

  it("keeps parallel planes apart", () => {
    const mesh = greedyMesh(soupOf([...grid(1, true, 0, 2, 2), ...grid(1, true, 1, 2, 2)]));
    expect(mesh.quads).toHaveLength(2);
    expect(mesh.quads.map((quad) => quad.slice).toSorted()).toEqual([0, 1]);
  });

  it("covers exactly the cells it was given, on every axis", () => {
    const faces = [
      ...grid(0, true, 3, 4, 5),
      ...grid(1, false, -2, 6, 2),
      ...grid(2, true, 7, 3, 3),
    ];
    const mesh = greedyMesh(soupOf(faces));
    const expected = faces
      .map((face) => `${face.axis}:${face.positive ? 1 : 0}:${face.slice}:${face.u}:${face.v}`)
      .toSorted();
    expect(coveredCells(mesh.quads)).toEqual(expected);
  });

  it("collapses the two triangles of one quad into one cell", () => {
    const mesh = greedyMesh(soupOf([{ axis: 2, positive: true, slice: 0, u: 0, v: 0 }]));
    expect(mesh.sourceTriangleCount).toBe(2);
    expect(mesh.quads).toHaveLength(1);
  });

  it("handles negative coordinates", () => {
    const faces = grid(1, true, 0, 3, 1);
    for (const face of faces) Object.assign(face, { u: face.u - 8, v: -5 });
    const mesh = greedyMesh(soupOf(faces));
    expect(mesh.quads).toEqual([
      { axis: 1, positive: true, slice: 0, u: -8, v: -5, width: 3, height: 1 },
    ]);
  });

  it("passes a triangle that is not an axis-aligned unit face through untouched", () => {
    const soup: TriangleSoup = {
      positions: Float32Array.from([0, 0, 0, 3, 0, 0, 0, 3, 3]),
      normals: Float32Array.from([0.577, 0.577, 0.577, 0.577, 0.577, 0.577, 0.577, 0.577, 0.577]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const mesh = greedyMesh(soup);
    expect(mesh.quads).toEqual([]);
    expect(mesh.passthrough).toEqual([0]);
  });

  it("passes an oversized axis-aligned triangle through rather than mangling it", () => {
    const soup: TriangleSoup = {
      positions: Float32Array.from([0, 0, 0, 4, 0, 0, 4, 0, 4]),
      normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    expect(greedyMesh(soup).passthrough).toEqual([0]);
  });

  it("more than halves a running-bond path tile's top face", () => {
    // The path model's top layer: grout on every even row, and every fourth
    // column of the odd rows, with three-wide pavers between.
    const faces = [];
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const isGrout = z % 2 === 0 || (x + (Math.floor(z / 2) % 2) * 2) % 4 === 0;
        if (isGrout) faces.push({ axis: 1 as FaceAxis, positive: true, slice: 2, u: x, v: z });
      }
    }
    const mesh = greedyMesh(soupOf(faces));
    // The greedy scan is not the minimal cover — a run growing down into the
    // next row fragments it — but it is a large win for a small pass, and the
    // flat undersides it also collapses are where most of the saving is.
    expect(mesh.quads.length).toBeLessThan(faces.length / 2);
    expect(coveredCells(mesh.quads)).toHaveLength(faces.length);
  });
});

describe("facesFromTriangles", () => {
  it("groups faces into one plane per side and slice", () => {
    const { planes } = facesFromTriangles(
      soupOf([...grid(1, true, 0, 2, 2), ...grid(1, false, 0, 1, 1)]),
    );
    expect(planes).toHaveLength(2);
    expect(planes.map((plane) => plane.cells.size).toSorted()).toEqual([1, 4]);
  });
});

const cross = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const subtract = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe("quadCorners", () => {
  it("winds counter-clockwise as seen from the side the face points at", () => {
    for (const axis of [0, 1, 2] as FaceAxis[]) {
      for (const positive of [true, false]) {
        const quad: MergedQuad = { axis, positive, slice: 1, u: 0, v: 0, width: 2, height: 3 };
        const [a, b, c] = quadCorners(quad);
        const geometric = cross(subtract(b!, a!), subtract(c!, a!));
        const declared = quadNormal(quad);
        const alignment =
          geometric[0] * declared[0] + geometric[1] * declared[1] + geometric[2] * declared[2];
        expect(alignment).toBeGreaterThan(0);
      }
    }
  });

  it("spans the rectangle it describes", () => {
    const corners = quadCorners({
      axis: 1,
      positive: true,
      slice: 2,
      u: 3,
      v: 4,
      width: 5,
      height: 6,
    });
    // A y-facing quad spans u along z and v along x — see `planeAxes`.
    const xs = corners.map((corner) => corner[0]);
    const zs = corners.map((corner) => corner[2]);
    expect(corners.every((corner) => corner[1] === 2)).toBe(true);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([3, 8]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([4, 10]);
  });
});
