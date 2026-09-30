// Arrays only, as the mesher hands them over: centred on the figure, y from its feet.

export interface FigureMesh {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
}

export interface FigureHeights {
  readonly hip: number;
  readonly shoulder: number;
  readonly hand: number;
  readonly chestHalfWidth: number;
}

// The mesher culls the faces where an arm touches the body, and a swinging arm opens them, so
// these are added: the arm's inner side, and the body behind it.
export interface FigureSeams {
  // Over the mesh's vertices and then the added ones.
  readonly onArm: Uint8Array;
  // Each added vertex takes every attribute but position and normal from its template.
  readonly templates: Int32Array;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  // Into the mesh's vertices followed by the added ones.
  readonly indices: Uint32Array;
}

// Voxel faces land on integers; this only absorbs the float round-trip through the vertex buffer.
const EPSILON = 1e-4;

interface Triangle {
  readonly vertices: readonly [number, number, number];
  readonly x: number;
  readonly y: number;
}

function trianglesOf(mesh: FigureMesh): Triangle[] {
  const triangles: Triangle[] = [];
  for (let first = 0; first + 2 < mesh.indices.length; first += 3) {
    const vertices = [
      mesh.indices[first]!,
      mesh.indices[first + 1]!,
      mesh.indices[first + 2]!,
    ] as const;
    let x = 0;
    let y = 0;
    for (const vertex of vertices) {
      x += mesh.positions[vertex * 3]! / 3;
      y += mesh.positions[vertex * 3 + 1]! / 3;
    }
    triangles.push({ vertices, x, y });
  }
  return triangles;
}

// Per triangle, from its centroid: the chest's edge and the arm's inner edge share an x, so a
// vertex alone cannot tell them apart. The mesher gives every quad its own four vertices.
function isArm(triangle: Triangle, heights: FigureHeights): boolean {
  return (
    Math.abs(triangle.x) > heights.chestHalfWidth + EPSILON &&
    triangle.y >= heights.hand &&
    triangle.y <= heights.shoulder
  );
}

class SeamBuilder {
  readonly templates: number[] = [];
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  readonly onArm: number[] = [];

  constructor(private readonly base: number) {}

  vertex(template: number, position: readonly number[], normalX: number, arm: boolean): number {
    this.templates.push(template);
    this.positions.push(...position);
    this.normals.push(normalX, 0, 0);
    this.onArm.push(arm ? 1 : 0);
    return this.base + this.templates.length - 1;
  }
}

interface ArmBounds {
  readonly inner: number;
  readonly outer: number;
  readonly low: number;
  readonly high: number;
  readonly back: number;
  readonly front: number;
}

function boundsOf(mesh: FigureMesh, vertices: readonly number[]): ArmBounds {
  const at = (vertex: number, axis: number): number => mesh.positions[vertex * 3 + axis]!;
  const xs = vertices.map((vertex) => Math.abs(at(vertex, 0)));
  const ys = vertices.map((vertex) => at(vertex, 1));
  const zs = vertices.map((vertex) => at(vertex, 2));
  return {
    inner: Math.min(...xs),
    outer: Math.max(...xs),
    low: Math.min(...ys),
    high: Math.max(...ys),
    back: Math.min(...zs),
    front: Math.max(...zs),
  };
}

// The arm is a box of one cross-section, so its outer side, moved in and turned round, is its
// inner side down to the colour of each band.
function sealArm(
  mesh: FigureMesh,
  arm: readonly Triangle[],
  side: number,
  bounds: ArmBounds,
  seams: SeamBuilder,
): void {
  const onOuter = (vertex: number): boolean =>
    Math.abs(Math.abs(mesh.positions[vertex * 3]!) - bounds.outer) < EPSILON;
  for (const triangle of arm) {
    if (!triangle.vertices.every(onOuter)) continue;
    const [a, b, c] = triangle.vertices.map((vertex) =>
      seams.vertex(
        vertex,
        [side * bounds.inner, mesh.positions[vertex * 3 + 1]!, mesh.positions[vertex * 3 + 2]!],
        -side,
        true,
      ),
    ) as [number, number, number];
    seams.indices.push(a, c, b);
  }
}

// Split at the hip, where the thigh behind the hand gives way to the chest behind the sleeve.
function bandsOf(bounds: ArmBounds, hip: number): [number, number][] {
  if (bounds.low < hip && hip < bounds.high) {
    return [
      [bounds.low, hip],
      [hip, bounds.high],
    ];
  }
  return [[bounds.low, bounds.high]];
}

// The nearest vertex of the same part on the same side, so the chest behind a sleeve is shirt
// and the thigh behind a hand is trousers.
function templateFor(
  mesh: FigureMesh,
  rest: readonly Triangle[],
  at: { readonly x: number; readonly y: number },
  heights: FigureHeights,
): number {
  const belowHip = at.y < heights.hip;
  const side = Math.sign(at.x);
  let template = -1;
  let nearest = Number.POSITIVE_INFINITY;
  const candidates = rest.filter(
    (triangle) => triangle.y < heights.hip === belowHip && triangle.y <= heights.shoulder,
  );
  for (const vertex of candidates.flatMap((triangle) => triangle.vertices)) {
    const x = mesh.positions[vertex * 3]!;
    const distance = Math.hypot(x - at.x, mesh.positions[vertex * 3 + 1]! - at.y);
    if (Math.sign(x) === side && distance < nearest) [template, nearest] = [vertex, distance];
  }
  return template;
}

function sealBody(
  mesh: FigureMesh,
  rest: readonly Triangle[],
  side: number,
  bounds: ArmBounds,
  heights: FigureHeights,
  seams: SeamBuilder,
): void {
  const x = side * bounds.inner;
  for (const [low, high] of bandsOf(bounds, heights.hip)) {
    const template = templateFor(mesh, rest, { x, y: (low + high) / 2 }, heights);
    if (template < 0) continue;
    // Counter-clockwise seen from +x in (y, z), so the order flips for the other side.
    const corners = [
      [low, bounds.back],
      [high, bounds.back],
      [high, bounds.front],
      [low, bounds.front],
    ].map(([y, z]) => seams.vertex(template, [x, y!, z!], side, false));
    const [a, b, c, d] = side > 0 ? corners : corners.toReversed();
    seams.indices.push(a!, b!, c!, a!, c!, d!);
  }
}

export function sealFigure(mesh: FigureMesh, heights: FigureHeights): FigureSeams {
  const count = mesh.positions.length / 3;
  const triangles = trianglesOf(mesh);
  const armTriangles = triangles.filter((triangle) => isArm(triangle, heights));
  const rest = triangles.filter((triangle) => !isArm(triangle, heights));
  const onArm = new Uint8Array(count);
  const hangs = (vertex: number): boolean => {
    const y = mesh.positions[vertex * 3 + 1]!;
    return y >= heights.hand && y <= heights.shoulder;
  };
  for (const triangle of armTriangles) {
    for (const vertex of triangle.vertices) if (hangs(vertex)) onArm[vertex] = 1;
  }

  const seams = new SeamBuilder(count);
  for (const side of [-1, 1]) {
    const arm = armTriangles.filter((triangle) => Math.sign(triangle.x) === side);
    const vertices = [...new Set(arm.flatMap((triangle) => triangle.vertices))].filter(
      (vertex) => onArm[vertex] === 1,
    );
    if (vertices.length === 0) continue;
    const bounds = boundsOf(mesh, vertices);
    sealArm(mesh, arm, side, bounds, seams);
    sealBody(mesh, rest, side, bounds, heights, seams);
  }

  const all = new Uint8Array(count + seams.templates.length);
  all.set(onArm);
  all.set(seams.onArm, count);
  return {
    onArm: all,
    templates: Int32Array.from(seams.templates),
    positions: Float32Array.from(seams.positions),
    normals: Float32Array.from(seams.normals),
    indices: Uint32Array.from([...Array.from(mesh.indices), ...seams.indices]),
  };
}
