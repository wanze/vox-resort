// A few static meshes rather than tiles: the sea has to reach the horizon, and sand tiles
// would stop anything being built on the beach. Everything is emitted per tile, so the sand,
// the water and the boardwalk laid on them follow the same staircase and meet exactly.

import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { levelHeight } from '../../layout/domain/elevation';
import type { Ground, Terrain, TerrainTile } from '../../layout/domain/terrain';

// Water, then sand, a hair above the bench and grass exactly on it: upside down as hydrology,
// but the infinite grass plane would otherwise poke through the water, and the sea runs in under
// the sand so the shoreline overlaps. All three stay below a path slab, which stands 0 to 2.
export const SEA_LEVEL = 0.1;
export const SAND_LEVEL = 0.3;
const GRASS_LEVEL = 0;

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
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

export type RiserSurface = 'grass' | 'sand';

export type SurfacesBySurface = Readonly<Record<RiserSurface, SurfaceGeometry | null>>;

export interface TerrainSurfaces {
  readonly sea: SurfaceGeometry | null;
  readonly water: SurfaceGeometry | null;
  readonly ground: SurfacesBySurface;
  readonly risers: SurfacesBySurface;
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
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

class GroundBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

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

  build(): SurfaceGeometry | null {
    if (this.quads === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      shoreDistances: null,
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

type Builders = Record<RiserSurface, GroundBuilder>;

const newBuilders = (): Builders => ({
  grass: new GroundBuilder(),
  sand: new GroundBuilder(),
});

const builtBy = (builders: Builders): SurfacesBySurface => ({
  grass: builders.grass.build(),
  sand: builders.sand.build(),
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
  // The sea and grass at sea level are drawn elsewhere, but still carry a height for their neighbours.
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
    const isPlane = tile.surface === 'grass' && tile.level === 0;
    sea[row] = isSea ? 1 : 0;
    drawn[row] = isSea || isPlane ? 0 : 1;
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

const isDrawn = (code: GroundCode, bench: number): boolean => !(code === GRASS && bench === 0);

interface Meshes {
  readonly ground: Builders;
  readonly risers: Builders;
  readonly water: GroundBuilder;
}

interface ColumnSpan {
  readonly tileX: number;
  readonly x0: number;
  readonly x1: number;
}

const topBuilder = (meshes: Meshes, code: GroundCode): GroundBuilder =>
  code === WATER ? meshes.water : meshes.ground[riserSurfaceOf(code)];

function layCut(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  cut: Cut,
  span: ColumnSpan,
  bounds: RowBounds,
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
  if (here.drawn[row]) {
    topBuilder(meshes, surface).half(farX, farZ, farX, cutZ, cutX, farZ, here.tops[row]!);
  }
  if (isDrawn(cut.other, bench)) {
    const y = bench + liftOf(cut.other);
    topBuilder(meshes, cut.other).half(cutX, cutZ, cutX, farZ, farX, cutZ, y);
  }
}

// An edge point takes the lower of the two tiles meeting there and a corner the lowest of
// four, so neighbours agree and nothing has to be closed afterwards.
function rimOf(columns: Neighbourhood, row: number, into: Float64Array): void {
  const { west, here, east } = columns;
  const own = here.benches[row]!;
  const back = benchAt(here, row - 1);
  const front = benchAt(here, row + 1);
  const side = (across: ColumnProfile, i: number): void => {
    const beside = benchAt(across, row);
    into[i * 4] = Math.min(own, beside, back, benchAt(across, row - 1));
    into[i * 4 + 1] = Math.min(own, beside);
    into[i * 4 + 2] = Math.min(own, beside);
    into[i * 4 + 3] = Math.min(own, beside, front, benchAt(across, row + 1));
  };
  side(west, 0);
  side(east, 3);
  for (const i of [1, 2]) {
    into[i * 4] = Math.min(own, back);
    into[i * 4 + 1] = own;
    into[i * 4 + 2] = own;
    into[i * 4 + 3] = Math.min(own, front);
  }
}

// Shared module-wide: every reader finishes before the next tile starts.
const RIM = new Float64Array(16);

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
  readonly lift: number;
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
    own: here.benches[row]!,
    surface,
    lift: liftOf(surface),
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
  const { own, surface, lift, xs, zs } = frameOf(columns, row, span, bounds);
  rimOf(columns, row, RIM);
  const height = (i: number, j: number): number => RIM[i * 4 + j]! + lift;
  const isFlat = (i: number, j: number): boolean =>
    RIM[i * 4 + j] === own &&
    RIM[i * 4 + j + 1] === own &&
    RIM[(i + 1) * 4 + j + 1] === own &&
    RIM[(i + 1) * 4 + j] === own;

  const slopes = meshes.risers[riserSurfaceOf(surface)];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (isFlat(i, j)) continue;
      slopes.patch(
        xs[i]!,
        height(i, j),
        zs[j]!,
        xs[i]!,
        height(i, j + 1),
        zs[j + 1]!,
        xs[i + 1]!,
        height(i + 1, j + 1),
        zs[j + 1]!,
        xs[i + 1]!,
        height(i + 1, j),
        zs[j]!,
      );
    }
  }

  const tops = topBuilder(meshes, surface);
  mergeFlat(isFlat, (i0, i1, j0, j1) => {
    tops.top(xs[i0]!, xs[i1 + 1]!, zs[j0]!, zs[j1 + 1]!, own + lift);
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
  const cut = cutOf(columns, row);
  if (cut) {
    layCut(meshes, columns, row, cut, span, bounds);
    return true;
  }
  return !here.drawn[row];
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
// overhanging. The wall's foot is the same rim sloped tiles use, so the two meet without a seam.
function layStandingTile(
  meshes: Meshes,
  columns: Neighbourhood,
  row: number,
  span: ColumnSpan,
  bounds: RowBounds,
): void {
  const { own, surface, lift, xs, zs } = frameOf(columns, row, span, bounds);
  const top = own + lift;

  topBuilder(meshes, surface).top(xs[0]!, xs[3]!, zs[0]!, zs[3]!, top);

  rimOf(columns, row, RIM);
  const wall = meshes.risers[riserSurfaceOf(surface)];
  for (let step = 0; step < RIM_RING.length; step++) {
    const [fi, fj] = RIM_RING[step]!;
    const [ti, tj] = RIM_RING[(step + 1) % RIM_RING.length]!;
    const fromY = RIM[fi * 4 + fj]! + lift;
    const toY = RIM[ti * 4 + tj]! + lift;
    if (fromY >= top && toY >= top) continue;
    wall.patch(
      xs[fi]!,
      fromY,
      zs[fj]!,
      xs[ti]!,
      toY,
      zs[tj]!,
      xs[ti]!,
      top,
      zs[tj]!,
      xs[fi]!,
      top,
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

export function terrainSurfacesFor(request: TerrainRequest): TerrainSurfaces {
  const { terrain, shore, center, reach, tileVoxels } = request;

  const minZ = center.z - reach;
  const maxZ = center.z + reach;
  const columns = {
    first: Math.floor((center.x - reach) / tileVoxels),
    last: Math.ceil((center.x + reach) / tileVoxels),
  };
  const firstRow = Math.floor(minZ / tileVoxels);
  const bounds: RowBounds = {
    firstRow,
    rows: Math.ceil(maxZ / tileVoxels) - firstRow,
    minZ,
    maxZ,
    tileVoxels,
  };

  const meshes: Meshes = {
    ground: newBuilders(),
    risers: newBuilders(),
    water: new GroundBuilder(),
  };

  const isClear = request.isClear ?? ALWAYS_CLEAR;
  const profiles = (tileX: number): ColumnProfile =>
    profileOf(terrain, tileX, bounds.firstRow, bounds.rows);
  let west = profiles(columns.first - 1);
  let here = profiles(columns.first);
  for (let tileX = columns.first; tileX <= columns.last; tileX++) {
    const east = profiles(tileX + 1);
    const x0 = tileX * tileVoxels;
    layColumn(meshes, { west, here, east }, { tileX, x0, x1: x0 + tileVoxels }, bounds, isClear);
    west = here;
    here = east;
  }

  return {
    sea: shore ? laySea(shore, bounds, columns) : null,
    water: meshes.water.build(),
    ground: builtBy(meshes.ground),
    risers: builtBy(meshes.risers),
  };
}
