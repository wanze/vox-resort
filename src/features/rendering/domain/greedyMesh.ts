export type FaceAxis = 0 | 1 | 2;

// Chosen so u x v points along the face's axis, which lets the winding be written once.
export function planeAxes(axis: FaceAxis): { u: FaceAxis; v: FaceAxis } {
  return { u: ((axis + 1) % 3) as FaceAxis, v: ((axis + 2) % 3) as FaceAxis };
}

export interface MergedQuad {
  readonly axis: FaceAxis;
  readonly positive: boolean;
  readonly slice: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
}

export interface Plane {
  readonly axis: FaceAxis;
  readonly positive: boolean;
  readonly slice: number;
  readonly cells: Set<number>;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

// Voxel faces land on integers; this only absorbs the float round-trip through the vertex buffer.
const EPSILON = 1e-4;

const CELL_STRIDE = 4096;
const CELL_BIAS = 1024;
const cellKey = (u: number, v: number): number => (u + CELL_BIAS) * CELL_STRIDE + (v + CELL_BIAS);

export interface TriangleSoup {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: ArrayLike<number>;
}

// From triangles rather than the mesher's quad layout, so corner order does not
// matter: a unit face's cell is simply its triangle's bounding box.
export function facesFromTriangles(soup: TriangleSoup): {
  planes: Plane[];
  passthrough: number[];
} {
  const { positions, normals, indices } = soup;
  const planes = new Map<string, Plane>();
  const passthrough: number[] = [];

  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle]!;
    const b = indices[triangle + 1]!;
    const c = indices[triangle + 2]!;

    const nx = normals[a * 3]!;
    const ny = normals[a * 3 + 1]!;
    const nz = normals[a * 3 + 2]!;
    const absX = Math.abs(nx);
    const absY = Math.abs(ny);
    const absZ = Math.abs(nz);
    let axis: FaceAxis;
    let along: number;
    if (absX >= absY && absX >= absZ) {
      axis = 0;
      along = nx;
    } else if (absY >= absZ) {
      axis = 1;
      along = ny;
    } else {
      axis = 2;
      along = nz;
    }
    if (Math.abs(Math.abs(along) - 1) > EPSILON) {
      passthrough.push(triangle);
      continue;
    }

    const { u, v } = planeAxes(axis);
    const slice = positions[a * 3 + axis]!;
    let uMin = Number.POSITIVE_INFINITY;
    let uMax = Number.NEGATIVE_INFINITY;
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    let flat = true;
    for (const vertex of [a, b, c]) {
      if (Math.abs(positions[vertex * 3 + axis]! - slice) > EPSILON) flat = false;
      const uValue = positions[vertex * 3 + u]!;
      const vValue = positions[vertex * 3 + v]!;
      uMin = Math.min(uMin, uValue);
      uMax = Math.max(uMax, uValue);
      vMin = Math.min(vMin, vValue);
      vMax = Math.max(vMax, vValue);
    }
    if (!flat || Math.abs(uMax - uMin - 1) > EPSILON || Math.abs(vMax - vMin - 1) > EPSILON) {
      passthrough.push(triangle);
      continue;
    }

    const positive = along > 0;
    const key = `${axis}:${positive ? 1 : 0}:${slice}`;
    let plane = planes.get(key);
    if (!plane) {
      plane = {
        axis,
        positive,
        slice,
        cells: new Set<number>(),
        uMin: Number.POSITIVE_INFINITY,
        uMax: Number.NEGATIVE_INFINITY,
        vMin: Number.POSITIVE_INFINITY,
        vMax: Number.NEGATIVE_INFINITY,
      };
      planes.set(key, plane);
    }
    const cellU = Math.round(uMin);
    const cellV = Math.round(vMin);
    plane.cells.add(cellKey(cellU, cellV));
    plane.uMin = Math.min(plane.uMin, cellU);
    plane.uMax = Math.max(plane.uMax, cellU);
    plane.vMin = Math.min(plane.vMin, cellV);
    plane.vMax = Math.max(plane.vMax, cellV);
  }

  return { planes: [...planes.values()], passthrough };
}

function mergePlane(plane: Plane, into: MergedQuad[]): void {
  const { cells, uMin, uMax, vMin, vMax } = plane;
  const remaining = new Set(cells);

  for (let v = vMin; v <= vMax; v++) {
    for (let u = uMin; u <= uMax; u++) {
      if (!remaining.has(cellKey(u, v))) continue;

      let width = 1;
      while (u + width <= uMax && remaining.has(cellKey(u + width, v))) width++;

      let height = 1;
      grow: while (v + height <= vMax) {
        for (let offset = 0; offset < width; offset++) {
          if (!remaining.has(cellKey(u + offset, v + height))) break grow;
        }
        height++;
      }

      for (let dv = 0; dv < height; dv++) {
        for (let du = 0; du < width; du++) remaining.delete(cellKey(u + du, v + dv));
      }
      into.push({
        axis: plane.axis,
        positive: plane.positive,
        slice: plane.slice,
        u,
        v,
        width,
        height,
      });
    }
  }
}

export interface GreedyMesh {
  readonly quads: readonly MergedQuad[];
  readonly passthrough: readonly number[];
  readonly sourceTriangleCount: number;
}

// Greedy rather than minimal: it collapses a flat 16x16 face to one quad, which is
// the case that actually occurs.
export function greedyMesh(soup: TriangleSoup): GreedyMesh {
  const { planes, passthrough } = facesFromTriangles(soup);
  const quads: MergedQuad[] = [];
  for (const plane of planes) mergePlane(plane, quads);
  return { quads, passthrough, sourceTriangleCount: soup.indices.length / 3 };
}

// Counter-clockwise as seen from the side the face points at: Three.js front.
export function quadCorners(quad: MergedQuad): [number, number, number][] {
  const { axis, positive, slice, u, v, width, height } = quad;
  const axes = planeAxes(axis);
  const corner = (uOffset: number, vOffset: number): [number, number, number] => {
    const point: [number, number, number] = [0, 0, 0];
    point[axis] = slice;
    point[axes.u] = u + uOffset;
    point[axes.v] = v + vOffset;
    return point;
  };
  const wound: [number, number, number][] = [
    corner(0, 0),
    corner(width, 0),
    corner(width, height),
    corner(0, height),
  ];
  return positive ? wound : [wound[0]!, wound[3]!, wound[2]!, wound[1]!];
}

export function quadNormal(quad: MergedQuad): [number, number, number] {
  const normal: [number, number, number] = [0, 0, 0];
  normal[quad.axis] = quad.positive ? 1 : -1;
  return normal;
}
