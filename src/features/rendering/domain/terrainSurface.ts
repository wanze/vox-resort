/**
 * The surfaces the ground plane cannot draw: the sea, the sand in front of it,
 * the water inland, and every bench of ground that stands above sea level.
 *
 * The resort stands on one flat green plane that runs past the horizon — see
 * `threeScene.ts` — and a coast is the one thing that plane cannot express,
 * because a coastline is a boundary and a plane has none. So the water and the
 * sand are laid *over* the grass as more surfaces, each covering only the part
 * of the world it belongs on, and the grass goes on being the thing underneath
 * everything.
 *
 * **Why not tiles.** Every other piece of ground in the resort is an object on
 * the tile grid: a path is a slab, and paving a plot means a few thousand
 * instances of it. The sea cannot be, because it does not end at the plot — it
 * has to reach the horizon, and the horizon is fifty times the plot's own area.
 * The sand could be, and is not, for a different reason: a tile the sand
 * occupied would be a tile nothing could be built on, and the whole point of
 * putting a beach on the plot is to stand bungalows on it. Terrain is not an
 * object. So all of it is a handful of static meshes, of a few hundred quads
 * between them, rebuilt when the ground changes and not per frame.
 *
 * **It is a field now, not a set of lines.** This used to walk each tile column
 * asking the coast and the terrace specs where their lines fell, which was the
 * right shape while the ground was grown and the wrong one the moment it could
 * be dug: there is no inset that means "this tile is a lake". So the one thing
 * it reads is `layout/domain/terrain.ts` — what every tile is and how high it
 * stands — and the coast and the terraces reach it through that. An unedited
 * plot comes out exactly as it always did, because the field answers exactly
 * what the lines answered.
 *
 * The sea is the one exception, and stays a line: it is asked for the *columns*
 * it covers rather than the tiles, because it reaches the horizon and its shader
 * grades by how far out each fragment lies. A column of sea is one quad from the
 * coast to the far edge of the box, which is also why an island needs nothing
 * done about it — the island's own geometry stands over the water and hides the
 * quad running on underneath.
 *
 * **Why it lines up with the tile grid.** The layout classifies *tiles* — this
 * tile is sand, so a path over it is a boardwalk — and a surface drawn to the
 * true wandering coast would cut across those tiles at every step. Everything
 * here is emitted per tile and merged into runs afterwards, so the staircase the
 * tile grid makes of the coast is the same staircase in the geometry. The sand
 * and the water meet exactly, and both meet the boardwalk laid on them.
 *
 * **Why there is so little geometry.** Neither surface carries its own colour.
 * The sand is one flat tone, like the grass, and the sea is shaded entirely in
 * `adapters/seaMaterial.ts` — its depth, its swell, its foam and its glint are
 * all fragment work. What the geometry owes that shader is how far out to sea
 * each corner lies, and that is linear in z, so a single quad reaching from the
 * shore to the far edge of the box carries a correct distance at every fragment
 * across it. Everything else is merged along z per column, so the beach comes
 * out as about one quad per column however many tiles deep it is.
 *
 * **Why the sea measures itself twice.** Off the tile staircase *and* off the
 * curve it was rounded from, because two different things read the distance and
 * they want different answers. The foam has to hug the drawn edge of the sand,
 * staircase and all, or it detaches from the beach it is breaking on. The depth
 * gradient must not: it fades over tens of voxels, so a distance that jumped a
 * whole tile from one column to the next laid broad diagonal bands across the
 * whole bay — the seams this pair exists to remove. Off the curve the same
 * gradient is continuous, because neighbouring columns evaluate the coast at the
 * one x they share.
 *
 * **The heights are the last piece, and they are one rule.** A tile's surface is
 * drawn at its own bench, plus a fixed lift that depends only on what it is made
 * of: water a hair above the bench, sand a hair above that, grass exactly on it.
 * That ordering is upside down as hydrology and exactly right as rendering — the
 * grass plane is infinite and would otherwise poke through the water, and the sea
 * runs a tile in under the sand so the shoreline is a seam between two surfaces
 * that overlap rather than a gap between two that abut. Water inland comes out
 * flush with its own banks, which is what `terrain.ts` says it must be so a
 * bridge over it lands level with the path either side of it.
 *
 * Ground at sea level is left to the infinite grass plane, which is why only
 * benches above it are emitted for grass: every terrace stands over that plane
 * rather than replacing it, exactly as the sand does.
 *
 * ## The two places the tile grid is allowed to stop being square
 *
 * Ground made of whole square tiles at whole levels reads as a stack of boxes:
 * every step is a wall, and every boundary that is not axis-aligned comes out as
 * a flight of right angles. Both are softened here, and neither is softened by
 * moving a tile — the layout still classifies whole tiles, and paving, placement
 * and picking all still work in them. What changes is only what is *drawn*.
 *
 * **A step is a slope, not a wall.** Where a tile stands a level above the
 * ground beside it, the drop is drawn as a ramp cut into the edge of the *upper*
 * tile rather than as an upright face at the boundary between them. The tile
 * keeps a flat plateau in the middle and gives up {@link SLOPE_FRACTION} of its
 * edge on whichever sides fall away, which makes it nine quads instead of one —
 * so a tile is only drawn that way when something around it *is* lower, and the
 * flat interior of a bench merges into runs exactly as it always did.
 *
 * The height of every point on the tile's rim is the **lowest** of the tiles
 * that meet there, which is what makes it watertight without a single seam quad:
 * two tiles sharing an edge compute that edge's heights from the same set of
 * tiles and so agree along it, and a tile that is the lowest of its neighbours
 * comes out perfectly flat. Corners fall out of the same rule — an outside
 * corner becomes a hip and an inside corner a valley — which is what the old
 * per-column and per-seam risers had to close by hand.
 *
 * It is cut into the upper tile and not the lower one on purpose. The ground
 * *below* a step is where the paths, the beach and the water are, and a ramp
 * that overlapped it would bury the foot of a promenade or drown a river bank;
 * the ground above it is the ground being cut away.
 *
 * **Except under what stands on it.** A model is a box with a flat underside
 * covering its whole tile, so a tile that gave three eighths of its edge to a
 * ramp would leave whatever stands there overhanging the cut. So a tile the
 * caller says is taken keeps its whole square top and puts the drop back as an
 * upright wall — down to the same rim every sloped tile is drawn against, so the
 * two meet along their shared edge with nothing to close between them. It costs
 * the mesher the one thing here that is not a fact about the ground, and buys
 * the rule the rest of the resort already lives by: `elevation.ts` refuses to
 * stand an object across a step, `terrainBrush.ts` refuses to dig under one, and
 * this refuses to slope away beneath one. What it looks like is a retaining wall
 * under the promenade and a grass slope either side of it, which is what a path
 * along a hillside has under it anyway.
 *
 * **A corner is a diagonal, not a right angle.** Where a tile has two
 * *perpendicular* neighbours made of the same thing it is not — the outside
 * corner of a river's staircase, or the inside of the bend it turns — the tile
 * is split corner to corner and the far half is drawn in the neighbours'
 * material. A staircase whose every step is mitred that way reads as a diagonal
 * bank rather than as a flight of right angles, and a river running diagonally
 * across the grid comes out as one continuous channel instead of a chain of
 * squares touching at their corners.
 *
 * It runs one way only: water takes a corner off sand and sand off grass, never
 * the reverse. See {@link REACH} for what goes wrong when both ways fire at the
 * same step, and why a lake therefore keeps every tile it was painted on.
 *
 * Only tiles at the same level are cut, and only where neither side is the sea.
 * The first keeps the cut a question about colour alone, so it never has to
 * agree with a slope about anything; the second leaves the coast to the shader
 * that grades it, whose foam is measured off the staircase the sand actually
 * makes — see {@link ShoreDistances}. A tile with two such corners or four is
 * left square, because a tile that is a headland or an island has no one corner
 * to cut.
 *
 * **A slope is made of something.** Whatever the tile being cut away is, because
 * that is the ground the step goes through: the face of a dune is sand because
 * the dune is, and the face of the lawn above the dune is earth because a cut
 * through turf is. Water is the one surface that cannot face a drop — a sheet of
 * river running down a hillside would be a waterfall nobody asked for — so the
 * bank of a lake is drawn as the earth it was cut into. See `threeScene.ts` for
 * the tones.
 */

import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { levelHeight } from '../../layout/domain/elevation';
import type { Ground, Terrain, TerrainTile } from '../../layout/domain/terrain';

/**
 * How far above its own bench each kind of ground is drawn, in voxels.
 *
 * The ground plane is at -0.05 and a path slab stands from 0 to 2, so all three
 * fit in the gap between the grass and the paving: the boardwalk still stands
 * proud of the sand it is laid on, exactly as a path stands proud of the grass.
 * `SAND_LEVEL` is exported because the beach is where the balloons are let go
 * from — see `features/balloons/` — and `SEA_LEVEL` because the bay floats its
 * boats on it.
 */
export const SEA_LEVEL = 0.1;
export const SAND_LEVEL = 0.3;
const GRASS_LEVEL = 0;

/** How far the water runs in under the sand, in tiles, so the seam never gaps. */
const SEA_UNDERLAP = 1;

/**
 * How much of a tile's edge the slope down to a lower neighbour eats into.
 *
 * Three eighths of a tile is six voxels against a level's eight, so a step comes
 * out at a little over fifty degrees: plainly a slope rather than a wall, and
 * still short enough that what stands on the tile overhangs by well under half
 * its width. It is the one number to turn to make the ground gentler or
 * sharper — see the note on slopes at the top of the file for what is being
 * traded away when it grows.
 */
const SLOPE_FRACTION = 3 / 8;

/**
 * How far out to sea each vertex lies, in voxels, measured two ways.
 *
 * Both are distances along z and neither is a distance to the nearest water,
 * which is all a coast made of column spans can mean. Both go negative landward
 * of the edge they are measured off.
 */
export interface ShoreDistances {
  /** Off the drawn edge of the sand: the coast rounded to whole tiles. */
  readonly edge: Float32Array;
  /** Off the coastline as a curve, and so continuous from column to column. */
  readonly coast: Float32Array;
}

export interface SurfaceGeometry {
  readonly positions: Float32Array;
  /**
   * One normal per vertex, or null for a surface that lies flat.
   *
   * Only the sea goes without: every other surface here may be a slope, and a
   * slope lit as though it were a floor is a slope the sun cannot pick out.
   */
  readonly normals: Float32Array | null;
  /** Null for a surface whose shader has no use for the numbers — the sand. */
  readonly shoreDistances: ShoreDistances | null;
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

/** What a slope can be cut through: the two grounds that hold a face. */
export type RiserSurface = 'grass' | 'sand';

/**
 * One geometry per material a surface can be made of.
 *
 * Split rather than merged because they are drawn in different colours and a
 * colour is a material, not a vertex attribute here: everything in this file is
 * one flat tone over one mesh. A plot with no sand emits nothing under `sand`,
 * which costs it nothing.
 */
export type SurfacesBySurface = Readonly<Record<RiserSurface, SurfaceGeometry | null>>;

export interface TerrainSurfaces {
  /** The water, out to the horizon. Null when the plot has no shore. */
  readonly sea: SurfaceGeometry | null;
  /** The rivers and the lakes: water that is not the sea. */
  readonly water: SurfaceGeometry | null;
  /** Every patch of ground the infinite grass plane cannot draw, by material. */
  readonly ground: SurfacesBySurface;
  /** The sloped faces between one patch of ground and the next. */
  readonly risers: SurfacesBySurface;
}

/**
 * How far past the framed plot the ground, the sea and the beach run, in plot
 * extents either side of the middle the camera is framed on.
 */
export const TERRAIN_SPREAD = 3;

export interface TerrainRequest {
  /** What every tile of the world is, coast, terraces and edits together. */
  readonly terrain: Terrain;
  /**
   * Whether nothing at all stands on a tile. Everything is clear when nothing is
   * passed, which is the ground as the generator grew it.
   *
   * The one thing here that is not a fact about the ground, and it earns its
   * place: a model has a flat underside covering its whole tile, so a slope cut
   * into a tile that something is standing on leaves that something overhanging
   * the cut. The ground under what stands is drawn square instead, and the drop
   * beside it stands upright — which is what a path along a terrace edge has
   * under it in the first place. The same question the terrain brush asks before
   * it will dig a tile; see `build/domain/terrainBrush.ts`.
   */
  readonly isClear?: IsClear;
  /**
   * The coast, for the sea alone: it is the one surface asked for the columns it
   * covers rather than for the tiles, because it reaches the horizon.
   */
  readonly shore: Shore | null;
  /** Middle of the ground the surfaces have to cover, in voxels. */
  readonly center: { readonly x: number; readonly z: number };
  /** How far either side of the centre they have to reach, in voxels. */
  readonly reach: number;
  readonly tileVoxels: number;
}

/** Whether nothing at all stands on a tile; see {@link TerrainRequest.isClear}. */
type IsClear = (tileX: number, tileZ: number) => boolean;

/** A plot nothing has been built on yet, which is every tile clear. */
const ALWAYS_CLEAR: IsClear = () => true;

/** Where the coastline runs at one x, unrounded, in voxels. */
type CoastAt = (x: number) => number;

/** Collects quads lying flat at one height, and hands back typed arrays. */
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

  /**
   * Adds one quad spanning `[x0, x1]` by `[z0, z1]`, wound so it faces up, with
   * the water's edge for this column at `edgeZ`.
   *
   * The two distances are taken differently on purpose. `edgeZ` is one number
   * for the whole quad, because a staircase step *is* constant across its
   * column. The coast is asked at each corner's own x, which is the trick that
   * removes the seam: the quads either side of a column boundary both ask about
   * the x they share, and so agree on the answer there.
   *
   * Nothing is added for a span that has been clipped away to nothing, which is
   * what every column off the end of the coast reduces to.
   */
  add(x0: number, x1: number, z0: number, z1: number, edgeZ: number) {
    if (x1 <= x0 || z1 <= z0) return;
    // Anticlockwise seen from above, which is what puts the normal at +y.
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

/**
 * Collects the ground: flat tops at any height, half tiles cut corner to corner,
 * and the sloped patches that carry a tile's edge down to the ground beside it.
 *
 * Apart from {@link SeaBuilder} because the two want different things. That one
 * lays a single surface at a single height and measures every corner against the
 * coast; this one lays quads at whatever height the ground is and has to work
 * out which way each of them faces. The bookkeeping they share is four pushes
 * and six indices.
 */
class GroundBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  /**
   * One quad from four corners already in winding order, plus its normal.
   *
   * Twelve numbers rather than an array of them, and the same for every caller:
   * a rebuild lays tens of thousands of these, and an array per quad is an
   * array per quad for the collector to take back while the pointer is moving.
   */
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

  /** The flat top of a patch of ground, wound anticlockwise from above. */
  top(x0: number, x1: number, z0: number, z1: number, y: number): void {
    if (x1 <= x0 || z1 <= z0) return;
    this.quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0, 0, 1, 0);
  }

  /**
   * Half a tile, cut corner to corner and lying flat: what a mitred corner
   * leaves of the tile it was cut out of, and what the ground beside it fills
   * that corner with.
   *
   * Given three corners in any order — the orientation is worked out here, so
   * neither caller has to reason about which way round its half of a cut runs.
   * The fourth vertex is the midpoint of the cut itself, which splits the
   * triangle into two of its own: the buffer holds four vertices and two
   * triangles per quad, and a repeated corner would put a degenerate triangle
   * with no facing at all into a mesh that is otherwise all real faces.
   */
  half(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y: number): void {
    // Twice the signed area, seen from above: positive is already anticlockwise.
    const area = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (area === 0) return;
    const px = area > 0 ? bx : cx;
    const pz = area > 0 ? bz : cz;
    const qx = area > 0 ? cx : bx;
    const qz = area > 0 ? cz : bz;
    this.quad(ax, y, az, px, y, pz, (px + qx) / 2, y, (pz + qz) / 2, qx, y, qz, 0, 1, 0);
  }

  /**
   * One patch of a tile's own surface, from four corners in winding order, with
   * the way it faces worked out from the corners themselves.
   *
   * The corners need not be coplanar — the hip of an outside corner is not —
   * so the normal is taken across the quad's two diagonals, which is the facing
   * both of its triangles average to.
   */
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

/** One builder per material, so a patch lands in the mesh its colour is drawn on. */
type Builders = Record<RiserSurface, GroundBuilder>;

const newBuilders = (): Builders => ({
  grass: new GroundBuilder(),
  sand: new GroundBuilder(),
});

const builtBy = (builders: Builders): SurfacesBySurface => ({
  grass: builders.grass.build(),
  sand: builders.sand.build(),
});

/**
 * What a ground is, as the one small number a column profile holds.
 *
 * A code rather than the string, because a profile is one array per column over
 * a box of tens of thousands of tiles and an array of strings is an array of
 * pointers the collector has to walk. The order is not arbitrary either: it is
 * exactly {@link REACH}, so which of two grounds takes a mitred corner is the
 * comparison the codes already make.
 */
const GRASS = 0;
const SAND = 1;
const WATER = 2;
type GroundCode = typeof GRASS | typeof SAND | typeof WATER;

const codeOf = (surface: Ground): GroundCode =>
  surface === 'water' ? WATER : surface === 'sand' ? SAND : GRASS;

/** How far above its own bench each kind of ground is drawn, in voxels. */
const LIFTS: readonly number[] = [GRASS_LEVEL, SAND_LEVEL, SEA_LEVEL];

const liftOf = (code: GroundCode): number => LIFTS[code]!;

/** How high the top of a tile's ground is drawn, in voxels. */
function topOf(tile: TerrainTile): number {
  return levelHeight(tile.level) + liftOf(codeOf(tile.surface));
}

/**
 * What a face through this ground is cut through.
 *
 * Water is the one surface with no answer of its own: a bank is the earth the
 * channel was cut into, and a sheet of river running down a hillside would read
 * as a waterfall.
 */
function riserSurfaceOf(code: GroundCode): RiserSurface {
  return code === SAND ? 'sand' : 'grass';
}

/**
 * One tile column, resolved row by row: how high each row stands, what it is
 * made of, and whether this file draws it at all.
 *
 * Indexed off `firstRow`, so `tops[0]` is the row at the back of the box. The
 * arrays are parallel rather than an array of objects because a rebuild walks a
 * few hundred columns of a few hundred rows and every object here would be an
 * allocation the collector has to take back while the pointer is moving.
 */
interface ColumnProfile {
  /**
   * The bench each row stands on, in voxels: its level and nothing else.
   *
   * Kept apart from {@link ColumnProfile.tops} because the two answer different
   * questions. A slope exists where the *ground* steps, which is a question
   * about levels; the fractions of a voxel that hold the sand over the water and
   * the water over the grass are not steps and must never grow one.
   */
  readonly benches: Float64Array;
  /** Where each row is actually drawn: its bench plus its surface's own lift. */
  readonly tops: Float64Array;
  /** What each row is made of, as a {@link GroundCode}. */
  readonly surfaces: Uint8Array;
  /**
   * Whether the row is this file's to draw.
   *
   * Two rows are not: the sea, which is drawn as one quad per column by the
   * shader that grades it, and grass at sea level, which is the infinite ground
   * plane the whole resort stands on. Both still carry a height, because the
   * ground beside them has to know what it is standing over.
   */
  readonly drawn: Uint8Array;
  /** Whether the row is the bay rather than water somebody dug. */
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

/** The three columns a tile is resolved against: itself and the ones either side. */
interface Neighbourhood {
  readonly west: ColumnProfile;
  readonly here: ColumnProfile;
  readonly east: ColumnProfile;
}

/**
 * The bench of one row of one column, or `Infinity` for a row outside the box.
 *
 * Infinity rather than the ground's own height, because everything that reads
 * this is looking for something *lower*: a tile at the very edge of the box has
 * nothing beyond it to step down to, and comes out flat.
 */
const benchAt = (profile: ColumnProfile, row: number): number =>
  row < 0 || row >= profile.benches.length ? Number.POSITIVE_INFINITY : profile.benches[row]!;

/** Whether anything at all around a tile stands lower than it does. */
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

/** Which corner of a tile is drawn as the ground beside it, and as what. */
interface Cut {
  readonly other: GroundCode;
  /** -1 for the corner towards the west column, +1 towards the east one. */
  readonly dx: -1 | 1;
  /** -1 for the corner towards the back of the box, +1 towards the front. */
  readonly dz: -1 | 1;
}

/**
 * How readily a ground grows into the corner of the ground beside it — which is
 * its {@link GroundCode}, grass reaching least and water most.
 *
 * A mitre only ever runs one way — the stronger ground takes the corner off the
 * weaker one, never the other way round — and that is not a nicety. Both ways at
 * once is what a staircase gets: the water tile at a step would give up its
 * outer corner while the grass tile beyond it took a corner of water, and the
 * two halves, being on opposite sides of the point they share, come out as a
 * spike and a notch with a wedge of grass between them. One direction makes the
 * whole staircase one diagonal, and makes the tool honest as well — the lake
 * keeps every tile it was painted on and only gains the corners between them.
 */
const REACH = (code: GroundCode): number => code;

/** Whether a row of a column is ground a mitre may be cut against at all. */
const isMitrable = (profile: ColumnProfile, row: number): boolean =>
  row >= 0 && row < profile.benches.length && !profile.sea[row];

/**
 * What the two tiles perpendicular to one corner of a tile are both made of, or
 * null when they are not both made of the same something else.
 *
 * The whole of the mitre rule for one corner: the two have to agree with each
 * other, disagree with this tile, and stand on the same bench as it — which is
 * exactly the shape a staircase makes at every step, and the shape a diagonal
 * channel makes of the grass between two of its tiles. Neither may be the sea,
 * which is left to the shader that grades it.
 */
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

/**
 * The one corner of a tile worth mitring, or null.
 *
 * Exactly one, because a tile with two such corners is the tip of a headland and
 * a tile with four is an island: neither has a corner that is the corner.
 */
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

/** The rows of the box, and the z each one spans once clipped to it. */
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

/** Whether a ground of this kind, on this bench, is drawn here at all. */
const isDrawn = (code: GroundCode, bench: number): boolean => !(code === GRASS && bench === 0);

/** Every mesh a column is laid into: the flat ground, the slopes, and the water. */
interface Meshes {
  readonly ground: Builders;
  readonly risers: Builders;
  readonly water: GroundBuilder;
}

/** One tile column: which it is, and the x it spans in voxels. */
interface ColumnSpan {
  readonly tileX: number;
  readonly x0: number;
  readonly x1: number;
}

/** Where a tile's own flat top belongs: the water mesh, or the mesh for its material. */
const topBuilder = (meshes: Meshes, code: GroundCode): GroundBuilder =>
  code === WATER ? meshes.water : meshes.ground[riserSurfaceOf(code)];

/**
 * A tile split corner to corner: its own half, and the ground beside it filling
 * the other.
 *
 * Either half may be nothing to draw — a cut against the grass at sea level
 * leaves the infinite ground plane showing through, which is exactly what the
 * grass beside it does — so each is asked for separately.
 */
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

/**
 * A tile's sixteen lattice heights, x outermost and z innermost.
 *
 * The whole of the rule, and the reason nothing has to be closed afterwards: a
 * point on an edge takes the lower of the two tiles meeting there, and a point
 * on a corner the lowest of the four. Two tiles sharing an edge work its heights
 * out from the same pair and so land on the same line, and the four tiles round
 * a corner all land on the same point.
 *
 * The four middle points are the tile's own bench: that is the plateau, and it
 * is why a side with nothing lower beyond it comes out flat.
 */
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

/**
 * The lattice the tile being drawn is resolved on, reused from tile to tile.
 *
 * One buffer rather than sixteen numbers handed about, and one for the whole
 * module rather than one per tile: every reader of it runs to completion before
 * the next tile is started, and a rebuild resolves a few thousand tiles.
 */
const RIM = new Float64Array(16);

/**
 * The flat cells of a tile's own grid, as few rectangles as its shape allows.
 *
 * Without this a tile that steps down on one side alone would come out as nine
 * quads where four say the same thing: the plateau and the two flat bands behind
 * it are one rectangle of ground. Greedy and rectangular rather than optimal —
 * over a grid of nine cells the difference is nothing, and the merge inside a
 * tile is the same trick as the run merge along a column.
 */
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

/** How far a rectangle rooted at one free cell can be grown: along z, then along x. */
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

/** Marks every cell of a merged rectangle as spoken for. */
function claim(taken: Uint8Array, i0: number, i1: number, j0: number, j1: number): void {
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) taken[i * 3 + j] = 1;
  }
}

/** Whether a whole z span of one column of a tile's grid is free to merge into. */
function spanIsFree(
  free: (i: number, j: number) => boolean,
  i: number,
  from: number,
  to: number,
): boolean {
  for (let j = from; j <= to; j++) if (!free(i, j)) return false;
  return true;
}

/**
 * Where one tile is drawn and what of: the lattice it is cut on, the bench it
 * stands at and what it is made of.
 *
 * Shared by the two ways a tile is drawn — sloped, and square under what stands
 * on it — because they differ only in what they do with it. The four x and four
 * z are the tile's own edges and the two cuts the slope's run makes inside them,
 * clipped to the box.
 */
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

/**
 * One tile that has ground falling away from it, as a flat plateau in a ring of
 * eight patches carrying its rim down to whatever is beside it — see
 * {@link rimOf} for where the rim's heights come from.
 *
 * A patch whose four corners all stand at the tile's own bench is flat ground
 * rather than a slope, and goes on the mesh its material is drawn on rather than
 * the one the cut faces are.
 */
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

/**
 * One row the run merge cannot take, drawn on its own — and whether it was such
 * a row at all.
 *
 * Three kinds, and the third is the reason this answers a question rather than
 * just drawing: a row that is not this file's to draw is not merged either, so
 * the sea and the grass at sea level break a run exactly as a slope does.
 */
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
    // Asked here rather than resolved with the rest of the column, because it is
    // the one question in this file the caller has to answer: it is a map lookup
    // in somebody else's index, and only a tile with ground falling away from it
    // has any use for the answer. A bench's flat interior never asks.
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

/**
 * The tile's rim as a ring of twelve lattice points, in the order the uprights
 * walk it.
 *
 * One loop round the tile rather than four edges, so every upright face comes
 * out wound the same way and none of them has to reason about which side of the
 * tile it is on. The ring runs the south edge west to east, the east edge front
 * to back, the north edge east to west and the west edge back to front, which
 * puts every segment's outward side on its left.
 */
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

/**
 * One tile with something standing on it, drawn square: a full flat top, and an
 * upright face wherever the ground beside it falls away.
 *
 * A model is a box with a flat underside covering its whole tile, so a tile that
 * gave three eighths of its edge to a ramp would leave whatever stands on it
 * overhanging the cut. The ground under it is left whole instead and the drop
 * put back as a wall — which is what is under a promenade along a terrace edge
 * anyway, and what makes the grass either side of it read as a slope rather than
 * as an accident.
 *
 * The wall's foot is the same rim every other tile is drawn against — see
 * {@link rimOf} — so a square tile and a sloped one meet along their shared edge
 * exactly as two sloped ones do, and nothing has to be closed between them.
 */
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

/**
 * One column of ground: runs of plain tiles merged into a quad apiece, and the
 * tiles that are neither flat nor square drawn one at a time.
 *
 * The run merge is what keeps a twenty-row beach to a single quad per column,
 * and it is exact rather than approximate: two rows merge only when they are the
 * same height, the same material, and both of them ordinary ground.
 */
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

/**
 * The sea, out to the far edge of the box: one quad per tile column.
 *
 * Over the whole box rather than over the plot, so the coast carries on past the
 * resort in both directions — a bay that stopped at the plot's edge would read as
 * a swimming pool.
 */
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

/**
 * Builds every terrain surface the box covers.
 *
 * One pass per column, reading the column either side of it: a tile is flat or
 * sloped by what the eight tiles around it stand on, and mitred or square by
 * what the four beside it are made of. The profiles are carried forward rather
 * than recomputed, so each column is resolved once even though three columns
 * read it.
 */
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
