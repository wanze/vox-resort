// A few static meshes rather than tiles: the sea has to reach the horizon, and sand tiles
// would stop anything being built on the beach. Everything is emitted per tile, so the sand,
// the water and the boardwalk laid on them follow the same staircase and meet exactly.

import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { levelHeight } from '../../layout/domain/elevation';
import type { Ground, Terrain, TerrainTile } from '../../layout/domain/terrain';

// Land stands most of a path slab's two voxels up, so paving and plates sit nearly flush, but
// half a voxel short of the slab's top: that is the depth gap the camera resolves. Water stays
// low, so every bank is a drop, and the sea runs in under the sand so the shoreline overlaps.
export const SEA_LEVEL = 0.1;
export const SAND_LEVEL = 1.5;
export const GRASS_LEVEL = 1.45;
// Where wet sand meets the water: just clear of the sea it runs down into.
const SAND_FOOT = 0.3;

const SEA_UNDERLAP = 1;

// Six voxels against a level's eight, so a step reads as a slope rather than a wall.
const SLOPE_FRACTION = 3 / 8;

// Measured twice: the foam must hug the drawn staircase, while the depth gradient needs the
// continuous curve or it lays diagonal bands across the bay.
export interface ShoreDistances {
  readonly edge: Float32Array;
  readonly coast: Float32Array;
}

export interface SurfaceGeometry {
  readonly positions: Float32Array;
  // A slope lit as though it were a floor is a slope the sun cannot pick out.
  readonly normals: Float32Array | null;
  readonly shoreDistances: ShoreDistances | null;
  // Per vertex, the height of its quad's highest corner: a grass riser's turf lip is measured down
  // from the crest of its own drop, so a two-level drop gets one lip and not a band at each level.
  readonly crests: Float32Array | null;
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

export type RiserSurface = 'grass' | 'sand';

export type SurfacesBySurface = Readonly<Record<RiserSurface, SurfaceGeometry | null>>;

export type Detail = 'wetSand' | 'kerb';

const DETAILS: readonly Detail[] = ['wetSand', 'kerb'];

export type DetailSurfaces = Readonly<Record<Detail, SurfaceGeometry | null>>;

export interface TileColumns {
  readonly from: number;
  readonly to: number;
}

type StartsBySurface = Readonly<Record<RiserSurface, Uint32Array>>;

type StartsByDetail = Readonly<Record<Detail, Uint32Array>>;

interface Starts {
  readonly water: Uint32Array;
  readonly ground: StartsBySurface;
  readonly risers: StartsBySurface;
  readonly details: StartsByDetail;
}

// Where each column's quads start in each mesh, one entry past the last column, so a
// column can be relaid without the rest. The box is kept to refuse a relay for another one.
interface ColumnStarts extends Starts {
  readonly first: number;
  readonly last: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TerrainSurfaces {
  readonly sea: SurfaceGeometry | null;
  readonly water: SurfaceGeometry | null;
  readonly ground: SurfacesBySurface;
  readonly risers: SurfacesBySurface;
  readonly details: DetailSurfaces;
  readonly columns: ColumnStarts;
}

export function geometriesOf(surfaces: TerrainSurfaces): (SurfaceGeometry | null)[] {
  const { sea, water, ground, risers, details } = surfaces;
  return [sea, water, ground.grass, ground.sand, risers.grass, risers.sand].concat(
    DETAILS.map((detail) => details[detail]),
  );
}

export function startsOf(columns: ColumnStarts): Uint32Array[] {
  const { water, ground, risers, details } = columns;
  return [water, ground.grass, ground.sand, risers.grass, risers.sand].concat(
    DETAILS.map((detail) => details[detail]),
  );
}

// In plot extents either side of the framed middle.
export const TERRAIN_SPREAD = 3;

export interface TerrainRequest {
  readonly terrain: Terrain;
  readonly isClear?: IsClear;
  readonly shore: Shore | null;
  readonly center: { readonly x: number; readonly z: number };
  readonly reach: number;
  readonly tileVoxels: number;
}

type IsClear = (tileX: number, tileZ: number) => boolean;

const ALWAYS_CLEAR: IsClear = () => true;

type CoastAt = (x: number) => number;

class SeaBuilder {
  private readonly positions: number[] = [];
  private readonly edges: number[] = [];
  private readonly coasts: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  constructor(
    private readonly y: number,
    private readonly coastAt: CoastAt,
  ) {}

  // edgeZ is constant per quad because a staircase step is. The coast is asked at each
  // corner's own x, so the quads either side of a column boundary agree there.
  add(x0: number, x1: number, z0: number, z1: number, edgeZ: number) {
    if (x1 <= x0 || z1 <= z0) return;
    // Anticlockwise seen from above, which puts the normal at +y.
    const corners = [x0, z0, x0, z1, x1, z1, x1, z0];
    for (let corner = 0; corner < corners.length; corner += 2) {
      const x = corners[corner]!;
      const z = corners[corner + 1]!;
      this.positions.push(x, this.y, z);
      this.edges.push(z - edgeZ);
      this.coasts.push(z - this.coastAt(x));
    }
    const base = this.quads * 4;
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.quads++;
  }

  build(): SurfaceGeometry | null {
    if (this.quads === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: null,
      shoreDistances: {
        edge: new Float32Array(this.edges),
        coast: new Float32Array(this.coasts),
      },
      crests: null,
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

type Corner = readonly [number, number, number];

type Out = readonly [number, number];

const sub = (a: Corner, b: Corner): Corner => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: Corner, b: Corner): Corner => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const unit = (v: Corner): Corner => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const diagonalNormal = (a: Corner, b: Corner, c: Corner, d: Corner): Corner =>
  cross(sub(c, a), sub(d, b));

// Three cuts a side: the crest and the foot each get a row of their own to lean.
const SOFT_CUTS = 3;
const SOFT_STEP = 1 / (SOFT_CUTS * 4);
// How much of the slope's own normal is left at a crease; the rest points up.
const SOFT_CREST = 0.45;

class GroundBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly crests: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  get count(): number {
    return this.quads;
  }

  // Twelve numbers rather than an array: a rebuild lays tens of thousands of quads while the pointer moves.
  private quad(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    const crest = Math.max(ay, by, cy, dy);
    this.crests.push(crest, crest, crest, crest);
    const base = this.quads * 4;
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.quads++;
  }

  top(x0: number, x1: number, z0: number, z1: number, y: number): void {
    if (x1 <= x0 || z1 <= z0) return;
    this.quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0, 0, 1, 0);
  }

  // The fourth vertex is the midpoint of the cut: a repeated corner would add a degenerate triangle.
  half(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y: number): void {
    const area = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (area === 0) return;
    const px = area > 0 ? bx : cx;
    const pz = area > 0 ? bz : cz;
    const qx = area > 0 ? cx : bx;
    const qz = area > 0 ? cz : bz;
    this.quad(ax, y, az, px, y, pz, (px + qx) / 2, y, (pz + qz) / 2, qx, y, qz, 0, 1, 0);
  }

  // The corners need not be coplanar, so the normal is taken across the two diagonals.
  patch(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
  ): void {
    const ex = cx - ax;
    const ey = cy - ay;
    const ez = cz - az;
    const fx = dx - bx;
    const fy = dy - by;
    const fz = dz - bz;
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return;
    this.quad(
      ax,
      ay,
      az,
      bx,
      by,
      bz,
      cx,
      cy,
      cz,
      dx,
      dy,
      dz,
      nx / length,
      ny / length,
      nz / length,
    );
  }

  // Wound to face `out`, so a caller lists the corners in whatever order is natural.
  facing(
    outX: number,
    outY: number,
    outZ: number,
    corners: readonly (readonly [number, number, number])[],
  ): void {
    const [a, b, c, d] = corners as [Corner, Corner, Corner, Corner];
    const [nx, ny, nz] = diagonalNormal(a, b, c, d);
    const [p, q, r, t] = nx * outX + ny * outY + nz * outZ < 0 ? [a, d, c, b] : [a, b, c, d];
    this.patch(...p, ...q, ...r, ...t);
  }

  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, out: Out): void {
    if (y1 <= y0) return;
    this.facing(out[0], 0, out[1], [
      [ax, y0, az],
      [bx, y0, bz],
      [bx, y1, bz],
      [ax, y1, az],
    ]);
  }

  // Cut into a grid with its normals leant up at the crest and the foot, so a dune's edge
  // rounds off under the sun. The positions stay on the patch, so a neighbour still meets it.
  softPatch(corners: readonly [Corner, Corner, Corner, Corner]): void {
    const [a, b, c, d] = corners;
    const low = Math.min(a[1], b[1], c[1], d[1]);
    const rise = Math.max(a[1], b[1], c[1], d[1]) - low;
    const at = (u: number, v: number): Corner => {
      const mixed = (k: 0 | 1 | 2): number =>
        (1 - u) * ((1 - v) * a[k] + v * b[k]) + u * ((1 - v) * d[k] + v * c[k]);
      return [mixed(0), mixed(1), mixed(2)];
    };
    const normalAt = (u: number, v: number): Corner => {
      const alongU = sub(at(Math.min(1, u + SOFT_STEP), v), at(Math.max(0, u - SOFT_STEP), v));
      const alongV = sub(at(u, Math.min(1, v + SOFT_STEP)), at(u, Math.max(0, v - SOFT_STEP)));
      const [nx, ny, nz] = unit(cross(alongV, alongU));
      const height = rise > 0 ? (at(u, v)[1] - low) / rise : 0.5;
      const lean = SOFT_CREST + (1 - SOFT_CREST) * (1 - Math.abs(2 * height - 1));
      return unit([nx * lean, ny * lean + (1 - lean), nz * lean]);
    };
    for (let i = 0; i < SOFT_CUTS; i++) {
      for (let j = 0; j < SOFT_CUTS; j++) {
        const u0 = i / SOFT_CUTS;
        const u1 = (i + 1) / SOFT_CUTS;
        const v0 = j / SOFT_CUTS;
        const v1 = (j + 1) / SOFT_CUTS;
        const grid: [number, number][] = [
          [u0, v0],
          [u0, v1],
          [u1, v1],
          [u1, v0],
        ];
        for (const [u, v] of grid) {
          this.positions.push(...at(u, v));
          this.normals.push(...normalAt(u, v));
          this.crests.push(low + rise);
        }
        const base = this.quads * 4;
        this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        this.quads++;
      }
    }
  }

  build(): SurfaceGeometry | null {
    if (this.quads === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      shoreDistances: null,
      crests: new Float32Array(this.crests),
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

type Builders = Record<RiserSurface, GroundBuilder>;

type DetailBuilders = Record<Detail, GroundBuilder>;

const newBuilders = (): Builders => ({
  grass: new GroundBuilder(),
  sand: new GroundBuilder(),
});

const builtBy = (builders: Builders): SurfacesBySurface => ({
  grass: builders.grass.build(),
  sand: builders.sand.build(),
});

const newDetailBuilders = (): DetailBuilders => ({
  wetSand: new GroundBuilder(),
  kerb: new GroundBuilder(),
});

const builtDetails = (builders: DetailBuilders): DetailSurfaces => ({
  wetSand: builders.wetSand.build(),
  kerb: builders.kerb.build(),
});

// Numeric codes because a profile is an array per column over tens of thousands of tiles.
// The order is REACH, so comparing codes decides which ground takes a mitred corner.
const GRASS = 0;
const SAND = 1;
const WATER = 2;
type GroundCode = typeof GRASS | typeof SAND | typeof WATER;

const codeOf = (surface: Ground): GroundCode =>
  surface === 'water' ? WATER : surface === 'sand' ? SAND : GRASS;

const LIFTS: readonly number[] = [GRASS_LEVEL, SAND_LEVEL, SEA_LEVEL];

const liftOf = (code: GroundCode): number => LIFTS[code]!;

function topOf(tile: TerrainTile): number {
  return levelHeight(tile.level) + liftOf(codeOf(tile.surface));
}

// Water cannot face a drop: a bank is the earth it was cut into, not a waterfall.
function riserSurfaceOf(code: GroundCode): RiserSurface {
  return code === SAND ? 'sand' : 'grass';
}

// Parallel typed arrays rather than objects, so a rebuild does not allocate per tile.
interface ColumnProfile {
  // Kept apart from tops: slopes follow level steps, and the surface lifts must never grow one.
  readonly benches: Float64Array;
  readonly tops: Float64Array;
  readonly surfaces: Uint8Array;
  // The sea is drawn elsewhere, but still carries a height for its neighbours.
  readonly drawn: Uint8Array;
  readonly sea: Uint8Array;
}

function profileOf(terrain: Terrain, tileX: number, firstRow: number, rows: number): ColumnProfile {
  const benches = new Float64Array(rows);
  const tops = new Float64Array(rows);
  const surfaces = new Uint8Array(rows);
  const drawn = new Uint8Array(rows);
  const sea = new Uint8Array(rows);
  for (let row = 0; row < rows; row++) {
    const tileZ = firstRow + row;
    const tile = terrain.tileAt(tileX, tileZ);
    benches[row] = levelHeight(tile.level);
    tops[row] = topOf(tile);
    surfaces[row] = codeOf(tile.surface);
    const isSea = tile.surface === 'water' && terrain.isSea(tileX, tileZ);
    sea[row] = isSea ? 1 : 0;
    drawn[row] = isSea ? 0 : 1;
  }
  return { benches, tops, surfaces, drawn, sea };
}

interface Neighbourhood {
  readonly west: ColumnProfile;
  readonly here: ColumnProfile;
  readonly east: ColumnProfile;
}

// Infinity because readers look for something lower: a tile at the box edge comes out flat.
const benchAt = (profile: ColumnProfile, row: number): number =>
  row < 0 || row >= profile.benches.length ? Number.POSITIVE_INFINITY : profile.benches[row]!;

function standsFlat(columns: Neighbourhood, row: number): boolean {
  const { west, here, east } = columns;
  const lowest = Math.min(
    benchAt(west, row - 1),
    benchAt(west, row),
    benchAt(west, row + 1),
    benchAt(here, row - 1),
    benchAt(here, row + 1),
    benchAt(east, row - 1),
    benchAt(east, row),
    benchAt(east, row + 1),
  );
  return lowest >= here.benches[row]!;
}

interface Cut {
  readonly other: GroundCode;
  readonly dx: -1 | 1;
  readonly dz: -1 | 1;
}

// A mitre runs one way only: both ways at a staircase step make a spike and a notch. One way
// makes the staircase one diagonal, and a lake keeps every tile it was painted on.
const REACH = (code: GroundCode): number => code;

const isMitrable = (profile: ColumnProfile, row: number): boolean =>
  row >= 0 && row < profile.benches.length && !profile.sea[row];

// Neither may be the sea, which is left to the shader that grades it.
function mitreAt(columns: Neighbourhood, row: number, dx: -1 | 1, dz: -1 | 1): GroundCode | null {
  const { here } = columns;
  const across = dx < 0 ? columns.west : columns.east;
  const along = row + dz;
  if (!isMitrable(across, row) || !isMitrable(here, along)) return null;
  const other = across.surfaces[row]! as GroundCode;
  const own = here.surfaces[row]! as GroundCode;
  if (REACH(other) <= REACH(own) || other !== here.surfaces[along]!) return null;
  const bench = here.benches[row]!;
  return across.benches[row] === bench && here.benches[along] === bench ? other : null;
}

// Exactly one: a tile with two such corners is a headland tip, one with four an island.
function cutOf(columns: Neighbourhood, row: number): Cut | null {
  if (columns.here.sea[row]) return null;
  let found: Cut | null = null;
  let corners = 0;
  for (const dx of [-1, 1] as const) {
    for (const dz of [-1, 1] as const) {
      const other = mitreAt(columns, row, dx, dz);
      // Compared against null rather than tested for truth: grass is code zero.
      if (other === null) continue;
      corners++;
      found = { other, dx, dz };
    }
  }
  return corners === 1 ? found : null;
}

interface RowBounds {
  readonly firstRow: number;
  readonly rows: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly tileVoxels: number;
}

const clampZ = (bounds: RowBounds, z: number): number =>
  Math.min(bounds.maxZ, Math.max(bounds.minZ, z));

const rowStart = (bounds: RowBounds, row: number): number =>
  clampZ(bounds, (bounds.firstRow + row) * bounds.tileVoxels);

const rowEnd = (bounds: RowBounds, row: number): number =>
  clampZ(bounds, (bounds.firstRow + row + 1) * bounds.tileVoxels);

interface Meshes {
  readonly ground: Builders;
  readonly risers: Builders;
  readonly water: GroundBuilder;
  readonly details: DetailBuilders;
}

interface ColumnSpan {
  readonly tileX: number;
  readonly x0: number;
  readonly x1: number;
}

const topBuilder = (meshes: Meshes, code: GroundCode): GroundBuilder =>
  code === WATER ? meshes.water : meshes.ground[riserSurfaceOf(code)];

// Under a plate the plate is the bank: a kerb or a wet band there would share its face.
function layCut(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  cut: Cut,
  span: ColumnSpan,
  bounds: RowBounds,
  isClear: IsClear,
): void {
  const { here } = columns;
  const z0 = rowStart(bounds, row);
  const z1 = rowEnd(bounds, row);
  if (z1 <= z0) return;
  const cutX = cut.dx < 0 ? span.x0 : span.x1;
  const farX = cut.dx < 0 ? span.x1 : span.x0;
  const cutZ = cut.dz < 0 ? z0 : z1;
  const farZ = cut.dz < 0 ? z1 : z0;
  const bench = here.benches[row]!;
  const surface = here.surfaces[row]! as GroundCode;
  if (cut.other === WATER && isClear(span.tileX, bounds.firstRow + row)) {
    layDiagonalBank(meshes, columns, row, { cutX, farX, cutZ, farZ });
  } else if (here.drawn[row]) {
    topBuilder(meshes, surface).half(farX, farZ, farX, cutZ, cutX, farZ, here.tops[row]!);
  }
  const y = bench + liftOf(cut.other);
  topBuilder(meshes, cut.other).half(cutX, cutZ, cutX, farZ, farX, cutZ, y);
}

// Under the land of its own bench but well above the next level down: water lies below its
// banks, so a tile beside it slopes down to it like a tile beside a lower terrace.
const WATER_SINK = 0.5;

const levelAt = (profile: ColumnProfile, row: number): number =>
  benchAt(profile, row) - (profile.surfaces[row] === WATER ? WATER_SINK : 0);

type Cell = readonly [ColumnProfile, number];

// An edge point takes the lower of the two tiles meeting there and a corner the lowest of
// four, so neighbours agree and nothing has to be closed afterwards. A tie keeps the tile's own.
function rimOf(columns: Neighbourhood, row: number): void {
  const { west, here, east } = columns;
  const lowest = (index: number, cells: readonly Cell[]): void => {
    let level = levelAt(here, row);
    let top = here.tops[row]!;
    for (const [profile, at] of cells) {
      const candidate = levelAt(profile, at);
      if (candidate >= level) continue;
      level = candidate;
      top = profile.tops[at]!;
    }
    RIM[index] = level;
    RIM_TOP[index] = top;
  };
  const side = (across: ColumnProfile, i: number): void => {
    lowest(i * 4, [
      [across, row],
      [here, row - 1],
      [across, row - 1],
    ]);
    lowest(i * 4 + 1, [[across, row]]);
    lowest(i * 4 + 2, [[across, row]]);
    lowest(i * 4 + 3, [
      [across, row],
      [here, row + 1],
      [across, row + 1],
    ]);
  };
  side(west, 0);
  side(east, 3);
  for (const i of [1, 2]) {
    lowest(i * 4, [[here, row - 1]]);
    lowest(i * 4 + 1, []);
    lowest(i * 4 + 2, []);
    lowest(i * 4 + 3, [[here, row + 1]]);
  }
}

// Shared module-wide: every reader finishes before the next tile starts. The levels decide
// what is flat, the tops how high each point stands.
const RIM = new Float64Array(16);
const RIM_TOP = new Float64Array(16);

function mergeFlat(
  isFlat: (i: number, j: number) => boolean,
  emit: (i0: number, i1: number, j0: number, j1: number) => void,
): void {
  const taken = new Uint8Array(9);
  const free = (i: number, j: number): boolean => !taken[i * 3 + j] && isFlat(i, j);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (!free(i, j)) continue;
      const { lastX, lastZ } = growFrom(free, i, j);
      claim(taken, i, lastX, j, lastZ);
      emit(i, lastX, j, lastZ);
    }
  }
}

function growFrom(
  free: (i: number, j: number) => boolean,
  i: number,
  j: number,
): { readonly lastX: number; readonly lastZ: number } {
  let lastZ = j;
  while (lastZ + 1 < 3 && free(i, lastZ + 1)) lastZ++;
  let lastX = i;
  while (lastX + 1 < 3 && spanIsFree(free, lastX + 1, j, lastZ)) lastX++;
  return { lastX, lastZ };
}

function claim(taken: Uint8Array, i0: number, i1: number, j0: number, j1: number): void {
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) taken[i * 3 + j] = 1;
  }
}

function spanIsFree(
  free: (i: number, j: number) => boolean,
  i: number,
  from: number,
  to: number,
): boolean {
  for (let j = from; j <= to; j++) if (!free(i, j)) return false;
  return true;
}

interface TileFrame {
  readonly own: number;
  readonly surface: GroundCode;
  readonly top: number;
  readonly xs: readonly number[];
  readonly zs: readonly number[];
}

function frameOf(
  columns: Neighbourhood,
  row: number,
  span: ColumnSpan,
  bounds: RowBounds,
): TileFrame {
  const { here } = columns;
  const surface = here.surfaces[row]! as GroundCode;
  const run = (span.x1 - span.x0) * SLOPE_FRACTION;
  const tileZ0 = (bounds.firstRow + row) * bounds.tileVoxels;
  const tileZ1 = tileZ0 + bounds.tileVoxels;
  return {
    own: levelAt(here, row),
    surface,
    top: here.tops[row]!,
    xs: [span.x0, span.x0 + run, span.x1 - run, span.x1],
    zs: [tileZ0, tileZ0 + run, tileZ1 - run, tileZ1].map((z) => clampZ(bounds, z)),
  };
}

function layTile(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  span: ColumnSpan,
  bounds: RowBounds,
): void {
  const { own, surface, top, xs, zs } = frameOf(columns, row, span, bounds);
  rimOf(columns, row);
  const height = (i: number, j: number): number => RIM_TOP[i * 4 + j]!;
  const isFlat = (i: number, j: number): boolean =>
    RIM[i * 4 + j] === own &&
    RIM[i * 4 + j + 1] === own &&
    RIM[(i + 1) * 4 + j + 1] === own &&
    RIM[(i + 1) * 4 + j] === own;

  const slopes = meshes.risers[riserSurfaceOf(surface)];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (isFlat(i, j)) continue;
      const corners: [Corner, Corner, Corner, Corner] = [
        [xs[i]!, height(i, j), zs[j]!],
        [xs[i]!, height(i, j + 1), zs[j + 1]!],
        [xs[i + 1]!, height(i + 1, j + 1), zs[j + 1]!],
        [xs[i + 1]!, height(i + 1, j), zs[j]!],
      ];
      if (surface === SAND) slopes.softPatch(corners);
      else slopes.patch(...corners[0], ...corners[1], ...corners[2], ...corners[3]);
    }
  }

  const tops = topBuilder(meshes, surface);
  mergeFlat(isFlat, (i0, i1, j0, j1) => {
    tops.top(xs[i0]!, xs[i1 + 1]!, zs[j0]!, zs[j1 + 1]!, top);
  });
}

// Rows not drawn here break a run just as a slope does.
function layDetail(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  span: ColumnSpan,
  bounds: RowBounds,
  isClear: IsClear,
): boolean {
  const { here } = columns;
  if (!standsFlat(columns, row)) {
    if (!here.drawn[row]) return true;
    // Asked only here: it is a lookup in somebody else's index, and only a tile with ground
    // falling away needs the answer.
    if (isClear(span.tileX, bounds.firstRow + row)) layTile(meshes, columns, row, span, bounds);
    else layStandingTile(meshes, columns, row, span, bounds);
    return true;
  }
  if (here.surfaces[row] === WATER) return !here.drawn[row];
  const cut = cutOf(columns, row);
  if (cut) {
    layCut(meshes, columns, row, cut, span, bounds, isClear);
    return true;
  }
  const sides = waterSides(columns, row);
  if (sides === 0) return !here.drawn[row];
  layBank(meshes, { columns, row, sides, span, bounds }, isClear);
  return true;
}

// In voxels. The kerb's top stays under a plate and a path slab, so neither shows it, and a
// hair over the grass, so it reads as the stone edge of the drop.
const WET_BAND = 3;
const KERB_WIDTH = 2;
const KERB_HEIGHT = 1.5;

const WEST = 1;
const EAST = 2;
const NORTH = 4;
const SOUTH = 8;
const NORTH_WEST = 16;
const NORTH_EAST = 32;
const SOUTH_WEST = 64;
const SOUTH_EAST = 128;

// Only water level with the tile: a bank above or below it is a drop, which the slopes draw.
function isWaterAt(profile: ColumnProfile, row: number, bench: number): boolean {
  return (
    row >= 0 &&
    row < profile.benches.length &&
    profile.surfaces[row] === WATER &&
    profile.benches[row] === bench
  );
}

function waterSides(columns: Neighbourhood, row: number): number {
  const { west, here, east } = columns;
  const bench = here.benches[row]!;
  const at = (profile: ColumnProfile, along: number, bit: number): number =>
    isWaterAt(profile, along, bench) ? bit : 0;
  return (
    at(west, row, WEST) |
    at(east, row, EAST) |
    at(here, row - 1, NORTH) |
    at(here, row + 1, SOUTH) |
    at(west, row - 1, NORTH_WEST) |
    at(east, row - 1, NORTH_EAST) |
    at(west, row + 1, SOUTH_WEST) |
    at(east, row + 1, SOUTH_EAST)
  );
}

// Per cell of the three by three, the sides whose water it lies against.
const CELL_SIDES: readonly number[] = [
  WEST | NORTH | NORTH_WEST,
  WEST,
  WEST | SOUTH | SOUTH_WEST,
  NORTH,
  0,
  SOUTH,
  EAST | NORTH | NORTH_EAST,
  EAST,
  EAST | SOUTH | SOUTH_EAST,
];

const bordersWater = (sides: number, i: number, j: number): boolean =>
  (sides & CELL_SIDES[i * 3 + j]!) !== 0;

function bandFrame(span: ColumnSpan, bounds: RowBounds, row: number, width: number) {
  const z0 = (bounds.firstRow + row) * bounds.tileVoxels;
  const z1 = z0 + bounds.tileVoxels;
  return {
    xs: [span.x0, span.x0 + width, span.x1 - width, span.x1],
    zs: [z0, z0 + width, z1 - width, z1].map((z) => clampZ(bounds, z)),
  };
}

interface BankTile {
  readonly columns: Neighbourhood;
  readonly row: number;
  readonly sides: number;
  readonly span: ColumnSpan;
  readonly bounds: RowBounds;
}

type CellTest = (i: number, j: number) => boolean;

function eachCell(test: CellTest, lay: (i: number, j: number) => void): void {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) if (test(i, j)) lay(i, j);
  }
}

// Per point of the four by four frame, the sides whose water it lies on.
const POINT_SIDES: readonly number[] = [
  WEST | NORTH | NORTH_WEST,
  WEST,
  WEST,
  WEST | SOUTH | SOUTH_WEST,
  NORTH,
  0,
  0,
  SOUTH,
  NORTH,
  0,
  0,
  SOUTH,
  EAST | NORTH | NORTH_EAST,
  EAST,
  EAST,
  EAST | SOUTH | SOUTH_EAST,
];

const onWaterEdge = (sides: number, i: number, j: number): boolean =>
  (sides & POINT_SIDES[i * 4 + j]!) !== 0;

const neighbourAt = (columns: Neighbourhood, row: number, dx: number, dz: number): Cell => [
  dx < 0 ? columns.west : dx > 0 ? columns.east : columns.here,
  row + dz,
];

// Sand beside sand slopes the same way and meets it, and water lies below the slope; grass
// stays up, and would show the gap under it.
function needsSandSide(columns: Neighbourhood, row: number, dx: number, dz: number): boolean {
  const [profile, at] = neighbourAt(columns, row, dx, dz);
  return at >= 0 && at < profile.surfaces.length && profile.surfaces[at] === GRASS;
}

function closeSand(meshes: Meshes, a: Corner, b: Corner, top: number, out: Out): void {
  meshes.risers.sand.facing(out[0], 0, out[1], [a, b, [b[0], top, b[2]], [a[0], top, a[2]]]);
}

// The band runs down from the dry sand to the water, so a bather wades in off a beach.
function layWetSand(meshes: Meshes, tile: BankTile): void {
  const { columns, row, sides } = tile;
  const { xs, zs } = bandFrame(tile.span, tile.bounds, row, WET_BAND);
  const top = columns.here.tops[row]!;
  const foot = columns.here.benches[row]! + SAND_FOOT;
  const wet: CellTest = (i, j) => bordersWater(sides, i, j);
  const point = (i: number, j: number): Corner => [
    xs[i]!,
    onWaterEdge(sides, i, j) ? foot : top,
    zs[j]!,
  ];
  mergeFlat(
    (i, j) => !wet(i, j),
    (i0, i1, j0, j1) => meshes.ground.sand.top(xs[i0]!, xs[i1 + 1]!, zs[j0]!, zs[j1 + 1]!, top),
  );
  eachCell(wet, (i, j) => {
    meshes.details.wetSand.facing(0, 1, 0, [
      point(i, j),
      point(i, j + 1),
      point(i + 1, j + 1),
      point(i + 1, j),
    ]);
  });
  closeWetSides(meshes, tile, wet, point);
}

type FramePoint = readonly [number, number];

// Each tile edge in turn: the cells along it, where they meet that edge, and which way it faces.
const TILE_EDGES = [
  {
    cell: (k: number): FramePoint => [0, k],
    from: (k: number): FramePoint => [0, k],
    to: (k: number): FramePoint => [0, k + 1],
    out: [-1, 0],
  },
  {
    cell: (k: number): FramePoint => [2, k],
    from: (k: number): FramePoint => [3, k],
    to: (k: number): FramePoint => [3, k + 1],
    out: [1, 0],
  },
  {
    cell: (k: number): FramePoint => [k, 0],
    from: (k: number): FramePoint => [k, 0],
    to: (k: number): FramePoint => [k + 1, 0],
    out: [0, -1],
  },
  {
    cell: (k: number): FramePoint => [k, 2],
    from: (k: number): FramePoint => [k, 3],
    to: (k: number): FramePoint => [k + 1, 3],
    out: [0, 1],
  },
] as const;

function closeWetSides(
  meshes: Meshes,
  tile: BankTile,
  wet: CellTest,
  point: (i: number, j: number) => Corner,
): void {
  const top = tile.columns.here.tops[tile.row]!;
  for (const edge of TILE_EDGES) {
    if (!needsSandSide(tile.columns, tile.row, edge.out[0], edge.out[1])) continue;
    for (let k = 0; k < 3; k++) {
      const [ci, cj] = edge.cell(k);
      if (!wet(ci, cj)) continue;
      const [fi, fj] = edge.from(k);
      const [ti, tj] = edge.to(k);
      closeSand(meshes, point(fi, fj), point(ti, tj), top, edge.out);
    }
  }
}

// Walls only where the next cell is not kerb too; at the tile's edge always, since a kerb
// beside it hides a wall it does not need.
function layKerb(meshes: Meshes, tile: BankTile, kerbed: CellTest): void {
  const { xs, zs } = bandFrame(tile.span, tile.bounds, tile.row, KERB_WIDTH);
  const here = tile.columns.here;
  if (here.drawn[tile.row]) {
    const top = here.tops[tile.row]!;
    mergeFlat(
      (i, j) => !kerbed(i, j),
      (i0, i1, j0, j1) => meshes.ground.grass.top(xs[i0]!, xs[i1 + 1]!, zs[j0]!, zs[j1 + 1]!, top),
    );
  }
  const kerb = meshes.details.kerb;
  const bench = here.benches[tile.row]!;
  const height = bench + KERB_HEIGHT;
  const open = (i: number, j: number): boolean =>
    !(i >= 0 && i <= 2 && j >= 0 && j <= 2 && kerbed(i, j));
  eachCell(kerbed, (i, j) => {
    const [x0, x1, z0, z1] = [xs[i]!, xs[i + 1]!, zs[j]!, zs[j + 1]!];
    kerb.top(x0, x1, z0, z1, height);
    if (open(i - 1, j)) kerb.wall(x0, z0, x0, z1, bench, height, [-1, 0]);
    if (open(i + 1, j)) kerb.wall(x1, z0, x1, z1, bench, height, [1, 0]);
    if (open(i, j - 1)) kerb.wall(x0, z0, x1, z0, bench, height, [0, -1]);
    if (open(i, j + 1)) kerb.wall(x0, z1, x1, z1, bench, height, [0, 1]);
  });
}

// Sand darkens and runs down where the water reaches it; grass ends in a stone kerb. Under a
// plate the plate's own side is the drop, and a band there would flicker against it.
function layBank(meshes: Meshes, tile: BankTile, isClear: IsClear): void {
  const here = tile.columns.here;
  if (!isClear(tile.span.tileX, tile.bounds.firstRow + tile.row)) {
    const { span, bounds, row } = tile;
    if (here.drawn[row]) {
      topBuilder(meshes, here.surfaces[row]! as GroundCode).top(
        span.x0,
        span.x1,
        rowStart(bounds, row),
        rowEnd(bounds, row),
        here.tops[row]!,
      );
    }
    return;
  }
  if (here.surfaces[tile.row] === SAND) {
    layWetSand(meshes, tile);
    return;
  }
  layKerb(meshes, tile, (i, j) => bordersWater(tile.sides, i, j));
}

interface Diagonal {
  readonly cutX: number;
  readonly farX: number;
  readonly cutZ: number;
  readonly farZ: number;
}

// The own half of a tile mitred into water: the band runs along the diagonal, and the kerb is
// closed at both tile edges, where the straight kerb beside it takes over.
// A sand band is inset by its straight width along each edge, so it meets the straight band beside it.
function layDiagonalBank(meshes: Meshes, columns: Neighbourhood, row: number, at: Diagonal): void {
  const { here } = columns;
  const { cutX, farX, cutZ, farZ } = at;
  const surface = here.surfaces[row]! as GroundCode;
  const sx = Math.sign(cutX - farX);
  const sz = Math.sign(cutZ - farZ);
  const inset = surface === SAND ? WET_BAND : KERB_WIDTH * Math.SQRT2;
  const innerZ = cutZ - sz * inset;
  const innerX = cutX - sx * inset;
  const top = here.tops[row]!;
  if (here.drawn[row]) {
    topBuilder(meshes, surface).half(farX, farZ, farX, innerZ, innerX, farZ, top);
  }
  const bench = here.benches[row]!;
  if (surface === SAND) {
    const foot = bench + SAND_FOOT;
    const outer: [Corner, Corner] = [
      [farX, foot, cutZ],
      [cutX, foot, farZ],
    ];
    meshes.details.wetSand.facing(0, 1, 0, [...outer, [innerX, top, farZ], [farX, top, innerZ]]);
    if (needsSandSide(columns, row, -sx, 0)) {
      closeSand(meshes, outer[0], [farX, top, innerZ], top, [-sx, 0]);
    }
    if (needsSandSide(columns, row, 0, -sz)) {
      closeSand(meshes, outer[1], [innerX, top, farZ], top, [0, -sz]);
    }
    return;
  }
  const band = meshes.details.kerb;
  const y = bench + KERB_HEIGHT;
  band.facing(0, 1, 0, [
    [farX, y, cutZ],
    [cutX, y, farZ],
    [innerX, y, farZ],
    [farX, y, innerZ],
  ]);
  band.wall(farX, cutZ, cutX, farZ, bench, y, [sx, sz]);
  band.wall(farX, innerZ, innerX, farZ, bench, y, [-sx, -sz]);
  band.wall(farX, cutZ, farX, innerZ, bench, y, [-sx, 0]);
  band.wall(cutX, farZ, innerX, farZ, bench, y, [0, -sz]);
}

// Walked so every segment's outward side is on its left, so all uprights wind the same way.
const RIM_RING: readonly (readonly [number, number])[] = [
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 2],
  [3, 1],
  [3, 0],
  [2, 0],
  [1, 0],
  [0, 0],
  [0, 1],
  [0, 2],
];

// A model has a flat underside covering its tile, so a slope under it would leave it
// overhanging. The wall's foot is the same rim sloped tiles use, so the two meet without a seam,
// and its top the bench the model stands on: above that the model's own side is in its plane.
function layStandingTile(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  span: ColumnSpan,
  bounds: RowBounds,
): void {
  const { surface, top, xs, zs } = frameOf(columns, row, span, bounds);
  const bench = columns.here.benches[row]!;

  topBuilder(meshes, surface).top(xs[0]!, xs[3]!, zs[0]!, zs[3]!, top);

  rimOf(columns, row);
  const wall = meshes.risers[riserSurfaceOf(surface)];
  for (let step = 0; step < RIM_RING.length; step++) {
    const [fi, fj] = RIM_RING[step]!;
    const [ti, tj] = RIM_RING[(step + 1) % RIM_RING.length]!;
    const fromY = Math.min(RIM_TOP[fi * 4 + fj]!, bench);
    const toY = Math.min(RIM_TOP[ti * 4 + tj]!, bench);
    if (fromY >= bench && toY >= bench) continue;
    wall.patch(
      xs[fi]!,
      fromY,
      zs[fj]!,
      xs[ti]!,
      toY,
      zs[tj]!,
      xs[ti]!,
      bench,
      zs[tj]!,
      xs[fi]!,
      bench,
      zs[fj]!,
    );
  }
}

// Rows merge only at the same height, the same material, and both ordinary ground, so the merge is exact.
function layColumn(
  meshes: Meshes,
  columns: Neighbourhood,
  span: ColumnSpan,
  bounds: RowBounds,
  isClear: IsClear,
): void {
  const { here } = columns;
  let open = -1;

  const flush = (to: number): void => {
    if (open < 0) return;
    topBuilder(meshes, here.surfaces[open]! as GroundCode).top(
      span.x0,
      span.x1,
      rowStart(bounds, open),
      rowEnd(bounds, to),
      here.tops[open]!,
    );
    open = -1;
  };

  for (let row = 0; row < bounds.rows; row++) {
    if (layDetail(meshes, columns, row, span, bounds, isClear)) {
      flush(row - 1);
      continue;
    }
    const carries =
      open >= 0 && here.tops[row] === here.tops[open] && here.surfaces[row] === here.surfaces[open];
    if (!carries) flush(row - 1);
    if (open < 0) open = row;
  }
  flush(bounds.rows - 1);
}

// Over the whole box, not the plot: a bay that stopped at the plot edge would read as a swimming pool.
function laySea(
  shore: Shore,
  bounds: RowBounds,
  columns: { readonly first: number; readonly last: number },
): SurfaceGeometry | null {
  const { tileVoxels } = bounds;
  const coastAt: CoastAt = (x) => waterEdgeZ(shore, x / tileVoxels) * tileVoxels;
  const sea = new SeaBuilder(SEA_LEVEL, coastAt);
  for (let tileX = columns.first; tileX <= columns.last; tileX++) {
    const water = waterStartZ(shore, tileX) * tileVoxels;
    sea.add(
      tileX * tileVoxels,
      (tileX + 1) * tileVoxels,
      clampZ(bounds, water - SEA_UNDERLAP * tileVoxels),
      bounds.maxZ,
      water,
    );
  }
  return sea.build();
}

interface Box {
  readonly columns: { readonly first: number; readonly last: number };
  readonly bounds: RowBounds;
}

function boxOf(request: TerrainRequest): Box {
  const { center, reach, tileVoxels } = request;
  const minZ = center.z - reach;
  const maxZ = center.z + reach;
  const firstRow = Math.floor(minZ / tileVoxels);
  return {
    columns: {
      first: Math.floor((center.x - reach) / tileVoxels),
      last: Math.ceil((center.x + reach) / tileVoxels),
    },
    bounds: { firstRow, rows: Math.ceil(maxZ / tileVoxels) - firstRow, minZ, maxZ, tileVoxels },
  };
}

interface LaidColumns {
  readonly water: SurfaceGeometry | null;
  readonly ground: SurfacesBySurface;
  readonly risers: SurfacesBySurface;
  readonly details: DetailSurfaces;
  readonly starts: Starts;
}

const newStarts = (entries: number): Starts => ({
  water: new Uint32Array(entries),
  ground: { grass: new Uint32Array(entries), sand: new Uint32Array(entries) },
  risers: { grass: new Uint32Array(entries), sand: new Uint32Array(entries) },
  details: {
    wetSand: new Uint32Array(entries),
    kerb: new Uint32Array(entries),
  },
});

function markStarts(starts: Starts, meshes: Meshes, entry: number): void {
  starts.water[entry] = meshes.water.count;
  for (const surface of ['grass', 'sand'] as const) {
    starts.ground[surface][entry] = meshes.ground[surface].count;
    starts.risers[surface][entry] = meshes.risers[surface].count;
  }
  for (const detail of DETAILS) starts.details[detail][entry] = meshes.details[detail].count;
}

function layColumns(request: TerrainRequest, box: Box, from: number, to: number): LaidColumns {
  const { terrain, tileVoxels } = request;
  const { bounds } = box;
  const meshes: Meshes = {
    ground: newBuilders(),
    risers: newBuilders(),
    water: new GroundBuilder(),
    details: newDetailBuilders(),
  };
  const starts = newStarts(to - from + 2);

  const isClear = request.isClear ?? ALWAYS_CLEAR;
  const profiles = (tileX: number): ColumnProfile =>
    profileOf(terrain, tileX, bounds.firstRow, bounds.rows);
  let west = profiles(from - 1);
  let here = profiles(from);
  for (let tileX = from; tileX <= to; tileX++) {
    markStarts(starts, meshes, tileX - from);
    const east = profiles(tileX + 1);
    const x0 = tileX * tileVoxels;
    layColumn(meshes, { west, here, east }, { tileX, x0, x1: x0 + tileVoxels }, bounds, isClear);
    west = here;
    here = east;
  }
  markStarts(starts, meshes, to - from + 1);

  return {
    water: meshes.water.build(),
    ground: builtBy(meshes.ground),
    risers: builtBy(meshes.risers),
    details: builtDetails(meshes.details),
    starts,
  };
}

const columnStartsOf = (box: Box, starts: Starts): ColumnStarts => ({
  first: box.columns.first,
  last: box.columns.last,
  minZ: box.bounds.minZ,
  maxZ: box.bounds.maxZ,
  ...starts,
});

export function terrainSurfacesFor(request: TerrainRequest): TerrainSurfaces {
  const box = boxOf(request);
  const { starts, ...laid } = layColumns(request, box, box.columns.first, box.columns.last);
  return {
    sea: request.shore ? laySea(request.shore, box.bounds, box.columns) : null,
    ...laid,
    columns: columnStartsOf(box, starts),
  };
}

// A column's ground reads its neighbours' profiles one column either side.
const NEIGHBOUR_COLUMNS = 1;

interface PlacedMesh {
  readonly geometry: SurfaceGeometry | null;
  readonly starts: Uint32Array;
}

const NO_NUMBERS = new Float32Array(0);

const lastOf = (starts: Uint32Array): number => starts[starts.length - 1]!;

function quadIndices(quads: number): Uint32Array {
  const indices = new Uint32Array(quads * 6);
  for (let quad = 0, at = 0; quad < quads; quad++, at += 6) {
    const base = quad * 4;
    indices[at] = base;
    indices[at + 1] = base + 1;
    indices[at + 2] = base + 2;
    indices[at + 3] = base;
    indices[at + 4] = base + 2;
    indices[at + 5] = base + 3;
  }
  return indices;
}

// Copies, never writes into old: the scene still draws from its arrays until it disposes them.
function spliceNumbers(
  old: Float32Array,
  fresh: Float32Array,
  keep: number,
  resume: number,
  end: number,
  perQuad: number,
): Float32Array {
  const added = fresh.length / perQuad;
  const out = new Float32Array((keep + added + end - resume) * perQuad);
  out.set(old.subarray(0, keep * perQuad), 0);
  out.set(fresh, keep * perQuad);
  out.set(old.subarray(resume * perQuad, end * perQuad), (keep + added) * perQuad);
  return out;
}

function spliceStarts(old: Uint32Array, fresh: Uint32Array, at: number): Uint32Array {
  const keep = old[at]!;
  const resume = old[at + fresh.length - 1]!;
  const shift = keep + lastOf(fresh) - resume;
  const out = new Uint32Array(old.length);
  out.set(old.subarray(0, at), 0);
  for (let i = 0; i < fresh.length; i++) out[at + i] = fresh[i]! + keep;
  for (let i = at + fresh.length; i < old.length; i++) out[i] = old[i]! + shift;
  return out;
}

function spliceMesh(old: PlacedMesh, fresh: PlacedMesh, at: number): PlacedMesh {
  const keep = old.starts[at]!;
  const resume = old.starts[at + fresh.starts.length - 1]!;
  const end = lastOf(old.starts);
  const starts = spliceStarts(old.starts, fresh.starts, at);
  const quadCount = lastOf(starts);
  if (quadCount === 0) return { geometry: null, starts };
  const numbers = (
    of: (geometry: SurfaceGeometry) => Float32Array | null,
    perQuad = 12,
  ): Float32Array =>
    spliceNumbers(
      (old.geometry && of(old.geometry)) ?? NO_NUMBERS,
      (fresh.geometry && of(fresh.geometry)) ?? NO_NUMBERS,
      keep,
      resume,
      end,
      perQuad,
    );
  return {
    geometry: {
      positions: numbers((geometry) => geometry.positions),
      normals: numbers((geometry) => geometry.normals),
      shoreDistances: null,
      crests: numbers((geometry) => geometry.crests, 4),
      indices: quadIndices(quadCount),
      quadCount,
    },
    starts,
  };
}

function spliceEach<Key extends string>(
  keys: readonly Key[],
  old: Readonly<Record<Key, SurfaceGeometry | null>>,
  oldStarts: Readonly<Record<Key, Uint32Array>>,
  fresh: Readonly<Record<Key, SurfaceGeometry | null>>,
  freshStarts: Readonly<Record<Key, Uint32Array>>,
  at: number,
): {
  readonly geometries: Record<Key, SurfaceGeometry | null>;
  readonly starts: Record<Key, Uint32Array>;
} {
  const geometries = {} as Record<Key, SurfaceGeometry | null>;
  const starts = {} as Record<Key, Uint32Array>;
  for (const key of keys) {
    const spliced = spliceMesh(
      { geometry: old[key], starts: oldStarts[key] },
      { geometry: fresh[key], starts: freshStarts[key] },
      at,
    );
    geometries[key] = spliced.geometry;
    starts[key] = spliced.starts;
  }
  return { geometries, starts };
}

const SURFACES: readonly RiserSurface[] = ['grass', 'sand'];

const fitsBox = (columns: ColumnStarts, box: Box): boolean =>
  columns.first === box.columns.first &&
  columns.last === box.columns.last &&
  columns.minZ === box.bounds.minZ &&
  columns.maxZ === box.bounds.maxZ;

export function retileColumns(
  previous: TerrainSurfaces,
  request: TerrainRequest,
  changed: TileColumns,
): TerrainSurfaces {
  const box = boxOf(request);
  if (!fitsBox(previous.columns, box)) return terrainSurfacesFor(request);
  const { first, last } = box.columns;
  const from = Math.max(first, changed.from - NEIGHBOUR_COLUMNS);
  const to = Math.min(last, changed.to + NEIGHBOUR_COLUMNS);
  if (from > to) return previous;

  const fresh = layColumns(request, box, from, to);
  const at = from - first;
  const kept = previous.columns;
  const water = spliceMesh(
    { geometry: previous.water, starts: kept.water },
    { geometry: fresh.water, starts: fresh.starts.water },
    at,
  );
  const ground = spliceEach(
    SURFACES,
    previous.ground,
    kept.ground,
    fresh.ground,
    fresh.starts.ground,
    at,
  );
  const risers = spliceEach(
    SURFACES,
    previous.risers,
    kept.risers,
    fresh.risers,
    fresh.starts.risers,
    at,
  );
  const details = spliceEach(
    DETAILS,
    previous.details,
    kept.details,
    fresh.details,
    fresh.starts.details,
    at,
  );
  return {
    sea: previous.sea,
    water: water.geometry,
    ground: ground.geometries,
    risers: risers.geometries,
    details: details.geometries,
    columns: columnStartsOf(box, {
      water: water.starts,
      ground: ground.starts,
      risers: risers.starts,
      details: details.starts,
    }),
  };
}

export function joinColumns(joined: TileColumns | null, next: TileColumns): TileColumns {
  if (!joined) return next;
  return { from: Math.min(joined.from, next.from), to: Math.max(joined.to, next.to) };
}
