/**
 * The surfaces the ground plane cannot draw: the sea, the sand in front of it,
 * and the terraces behind it.
 *
 * The resort stands on one flat green plane that runs past the horizon — see
 * `threeScene.ts` — and a coast is the one thing that plane cannot express,
 * because a coastline is a boundary and a plane has none. So the water and the
 * sand are laid *over* the grass as two more surfaces, each covering only the
 * part of the world it belongs on, and the grass goes on being the thing
 * underneath everything.
 *
 * **Why not tiles.** Every other piece of ground in the resort is an object on
 * the tile grid: a path is a slab, and paving a plot means a few thousand
 * instances of it. The sea cannot be, because it does not end at the plot — it
 * has to reach the horizon, and the horizon is fifty times the plot's own area.
 * The sand could be, and is not, for a different reason: a tile the sand
 * occupied would be a tile nothing could be built on, and the whole point of
 * putting a beach on the plot is to stand bungalows on it. Terrain is not an
 * object. So both are one static mesh apiece, of a few hundred quads between
 * them, built once per resort.
 *
 * **Why it still lines up with the tile grid.** The layout classifies *tiles* —
 * this tile is sand, so a path over it is a boardwalk — and a surface drawn to
 * the true wandering coast would cut across those tiles at every step. Both
 * surfaces are therefore emitted as one span per tile column, from the same
 * `waterStartZ` the layout asks, so the staircase the tile grid makes of the
 * coast is the same staircase in the geometry. The sand and the water meet
 * exactly, and both meet the boardwalk laid on them.
 *
 * **Why there is so little geometry.** Neither surface carries its own colour
 * any more. The sand is one flat colour, like the grass, and the sea is shaded
 * entirely in `adapters/seaMaterial.ts` — its depth, its swell, its foam and its
 * glint are all fragment work. What the geometry owes the shader is how far out
 * to sea each corner lies, and that is linear in z, so a single quad reaching
 * from the shore to the far edge of the box carries a correct distance at every
 * fragment across it. A column of sea is one quad; a column of sand is one quad.
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
 * The heights are the last piece. The sea sits a hair above the grass rather
 * than below it, which is upside down as hydrology and invisible as rendering:
 * the grass plane is infinite and would otherwise poke through the water. The
 * sand sits above the sea, and the sea runs a tile in under the sand, so the
 * shoreline is a seam between two surfaces that overlap rather than a gap
 * between two that abut.
 *
 * **The terraces.** Land above sea level is the same problem a third time, and
 * it gets the same answer: one span per tile column, at the height of whichever
 * bench that column is on. What it adds is the **risers** — the vertical faces
 * between one bench and the next — and they are the only geometry here that does
 * not lie flat, so they are the only geometry that carries its own normals. A
 * riser lit as though it were a floor is a riser the sun cannot pick out, and a
 * step you cannot see is not a step.
 *
 * Ground at sea level is left to the infinite grass plane, which is why only
 * benches above it are emitted: every terrace stands over that plane rather than
 * replacing it, exactly as the sand does.
 *
 * **A terrace is made of something.** The dune behind the beach is sand four
 * metres up, and drawing it green put a lawn where the beach should have carried
 * on. So each bench and each riser goes into the mesh for the material it is
 * made of — see `layout/domain/ground.ts`, which is where the question of what a
 * tile is made of is actually answered — and a plot whose terraces are all grass
 * emits an empty sand mesh, which is to say none at all.
 *
 * **Why the risers need closing along x too.** A step line wanders, so two
 * neighbouring columns round it to different tiles, and between those two rows
 * one column stands a level above the other. That leaves a vertical slot at the
 * boundary they share — the staircase the tile grid makes of the step, seen
 * end-on. {@link terraceGeometry} walks each pair of neighbouring columns and
 * closes exactly the z ranges where their heights disagree. It is the same
 * staircase the layout reads when it decides where a flight of stairs goes, so
 * the ground and the stairs on it step together.
 */

import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import {
  levelHeight,
  maxLevelOf,
  stepStartZ,
  type Elevation,
  type TerraceSurface,
} from '../../layout/domain/elevation';

/**
 * Where each surface lies, in voxels.
 *
 * The ground plane is at -0.05 and a path slab stands from 0 to 2, so both of
 * these fit in the gap between the grass and the paving: the boardwalk still
 * stands proud of the sand it is laid on, exactly as a path stands proud of the
 * grass.
 */
export const SEA_LEVEL = 0.1;
export const SAND_LEVEL = 0.3;

/** How far the water runs in under the sand, in tiles, so the seam never gaps. */
const SEA_UNDERLAP = 1;

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
   * Only the risers carry them: everything else here is a floor, and the caller
   * points a floor's normals straight up without being told to. A riser is the
   * one face in the resort's terrain that stands upright, and it has to be lit
   * as one.
   */
  readonly normals: Float32Array | null;
  /** Null for a surface whose shader has no use for the numbers — the sand. */
  readonly shoreDistances: ShoreDistances | null;
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

/**
 * One geometry per material a terrace can be made of.
 *
 * Split rather than merged because the two are drawn in different colours and a
 * colour is a material, not a vertex attribute here: everything else in this
 * file is one flat tone over one mesh. A plot whose terraces are all grass emits
 * nothing under `sand`, which costs it nothing.
 */
export type SurfacesBySurface = Readonly<Record<TerraceSurface, SurfaceGeometry | null>>;

export interface TerrainSurfaces {
  /** The beach. Null when the plot has no shore. */
  readonly sand: SurfaceGeometry | null;
  /** The water, out to the horizon. Null when the plot has no shore. */
  readonly sea: SurfaceGeometry | null;
  /** The flat top of every bench above sea level, by what the bench is made of. */
  readonly terraces: SurfacesBySurface;
  /** The vertical faces between one bench and the next, by the bench they rise to. */
  readonly risers: SurfacesBySurface;
}

export interface TerrainRequest {
  readonly shore: Shore | null;
  /** How the land rises behind the beach. Null lays it all at sea level. */
  readonly elevation: Elevation | null;
  /** Middle of the ground the surfaces have to cover, in voxels. */
  readonly center: { readonly x: number; readonly z: number };
  /** How far either side of the centre they have to reach, in voxels. */
  readonly reach: number;
  readonly tileVoxels: number;
}

/** Where the coastline runs at one x, unrounded, in voxels. */
type CoastAt = (x: number) => number;

/** Collects quads lying flat at one height, and hands back typed arrays. */
class SurfaceBuilder {
  private readonly positions: number[] = [];
  private readonly edges: number[] = [];
  private readonly coasts: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  /**
   * `coastAt` is what makes a surface measure itself; the sand passes null and
   * carries nothing but its corners.
   */
  constructor(
    private readonly y: number,
    private readonly coastAt: CoastAt | null,
  ) {}

  /**
   * Adds one quad spanning `[x0, x1]` by `[z0, z1]`, wound so it faces up, with
   * the water's edge for this column at `edgeZ` — read only by a surface that
   * was given a coast to measure against.
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
  add(x0: number, x1: number, z0: number, z1: number, edgeZ = 0) {
    if (x1 <= x0 || z1 <= z0) return;
    // Anticlockwise seen from above, which is what puts the normal at +y.
    const corners = [x0, z0, x0, z1, x1, z1, x1, z0];
    for (let corner = 0; corner < corners.length; corner += 2) {
      const x = corners[corner]!;
      const z = corners[corner + 1]!;
      this.positions.push(x, this.y, z);
      if (this.coastAt) {
        this.edges.push(z - edgeZ);
        this.coasts.push(z - this.coastAt(x));
      }
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
      shoreDistances: this.coastAt
        ? { edge: new Float32Array(this.edges), coast: new Float32Array(this.coasts) }
        : null,
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

/**
 * Collects the terraces: flat tops at any height, and upright risers that carry
 * their own normals.
 *
 * Apart, rather than folded into {@link SurfaceBuilder}, because the two want
 * different things. That one lays a single surface at a single height and
 * measures every corner against the coast; this one lays quads at whatever
 * height the bench is and has to wind an upright face the right way round. The
 * bookkeeping they share is four pushes and six indices.
 */
class TerraceBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  /** One quad from four corners already in winding order, plus its normal. */
  private quad(corners: readonly number[], nx: number, ny: number, nz: number): void {
    for (let corner = 0; corner < corners.length; corner += 3) {
      this.positions.push(corners[corner]!, corners[corner + 1]!, corners[corner + 2]!);
      this.normals.push(nx, ny, nz);
    }
    const base = this.quads * 4;
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.quads++;
  }

  /** The flat top of a bench, wound anticlockwise from above so it faces up. */
  top(x0: number, x1: number, z0: number, z1: number, y: number): void {
    if (x1 <= x0 || z1 <= z0) return;
    this.quad([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 0, 1, 0);
  }

  /**
   * The riser across a step, at one z, facing the lower ground beside it.
   *
   * `landward` and `seaward` are the two bench heights either side of the line;
   * which is higher decides both the winding and the way the normal points, so
   * a step down inland is drawn as readily as a step up.
   */
  riserAlongX(x0: number, x1: number, z: number, landward: number, seaward: number): void {
    const low = Math.min(landward, seaward);
    const high = Math.max(landward, seaward);
    if (x1 <= x0 || high <= low) return;
    if (landward > seaward) {
      // The face is exposed towards the sea, which is +z.
      this.quad([x0, low, z, x1, low, z, x1, high, z, x0, high, z], 0, 0, 1);
      return;
    }
    this.quad([x0, low, z, x0, high, z, x1, high, z, x1, low, z], 0, 0, -1);
  }

  /**
   * The riser along a column boundary, at one x: what closes the slot left where
   * two neighbouring columns round a wandering step line to different tiles.
   */
  riserAlongZ(x: number, z0: number, z1: number, west: number, east: number): void {
    const low = Math.min(west, east);
    const high = Math.max(west, east);
    if (z1 <= z0 || high <= low) return;
    if (west > east) {
      // The face is exposed towards the east, which is +x.
      this.quad([x, low, z0, x, high, z0, x, high, z1, x, low, z1], 1, 0, 0);
      return;
    }
    this.quad([x, low, z0, x, low, z1, x, high, z1, x, high, z0], -1, 0, 0);
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

/**
 * One tile column's height profile: where its steps fall and how high the land
 * stands between them.
 *
 * Ordered by ascending z, which runs landward to seaward: `heights[0]` is the
 * bench at the back of the plot, `heights[edges.length]` is sea level at the
 * front, and `edges[j]` is the line between benches `j` and `j + 1`. Everything
 * is in voxels.
 */
interface ColumnProfile {
  readonly edges: readonly number[];
  readonly heights: readonly number[];
  /**
   * What each band is made of, parallel to `heights`.
   *
   * The band in front of the first step is the plot's own ground, which is grass
   * where it is not the sand band — and the sand band is drawn by the surface
   * that draws the beach, not by this one, so grass is the right answer for it
   * here.
   */
  readonly surfaces: readonly TerraceSurface[];
}

/** The height profile of one tile column, walked from the back of the plot forward. */
function profileOf(elevation: Elevation, tileX: number, tileVoxels: number): ColumnProfile {
  const { terraces } = elevation.spec;
  const last = terraces[terraces.length - 1]!;
  const edges: number[] = [];
  const heights: number[] = [levelHeight(last.level)];
  const surfaces: TerraceSurface[] = [last.surface ?? 'grass'];
  for (let index = terraces.length - 1; index >= 0; index--) {
    const below = index > 0 ? terraces[index - 1] : undefined;
    edges.push(stepStartZ(elevation, index, tileX) * tileVoxels);
    heights.push(levelHeight(below?.level ?? 0));
    surfaces.push(below?.surface ?? 'grass');
  }
  return { edges, heights, surfaces };
}

/** Which band of a column a z falls in. */
function bandAt(profile: ColumnProfile, z: number): number {
  let band = 0;
  while (band < profile.edges.length && z >= profile.edges[band]!) band++;
  return band;
}

/** How high one column stands at a given z. */
function heightAt(profile: ColumnProfile, z: number): number {
  return profile.heights[bandAt(profile, z)]!;
}

/** What one column is made of at a given z. */
function surfaceAt(profile: ColumnProfile, z: number): TerraceSurface {
  return profile.surfaces[bandAt(profile, z)]!;
}

/** The z range the box covers, so a bench running past it is cropped to it. */
interface ZBounds {
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * One column's benches: a flat quad per band that stands above sea level.
 *
 * Sea level is left to the infinite grass plane under everything, so a band at
 * level 0 contributes nothing — a quad laid over that plane would be a second
 * surface at the same height, fighting for the same fragments.
 */
function layBenches(
  tops: TerraceBuilders,
  profile: ColumnProfile,
  x0: number,
  x1: number,
  { minZ, maxZ }: ZBounds,
): void {
  const clamp = (value: number): number => Math.min(maxZ, Math.max(minZ, value));
  for (const [band, height] of profile.heights.entries()) {
    if (height <= 0) continue;
    const from = band === 0 ? minZ : profile.edges[band - 1]!;
    const to = band === profile.edges.length ? maxZ : profile.edges[band]!;
    tops[profile.surfaces[band]!].top(x0, x1, clamp(from), clamp(to), height);
  }
}

/**
 * One column's own steps, each drawn as an upright face across the column.
 *
 * A riser is made of whatever the bench *above* it is: the face of a dune is
 * sand because the dune is, and the face of the lawn above the dune is earth
 * because a cut through turf is. Which of the two bands is the higher one
 * depends on which way the hill is going at that step, so it is asked rather
 * than assumed.
 */
function layStepRisers(
  risers: TerraceBuilders,
  profile: ColumnProfile,
  x0: number,
  x1: number,
  { minZ, maxZ }: ZBounds,
): void {
  for (const [band, edge] of profile.edges.entries()) {
    if (edge <= minZ || edge >= maxZ) continue;
    const landward = profile.heights[band]!;
    const seaward = profile.heights[band + 1]!;
    const upper = landward >= seaward ? band : band + 1;
    risers[profile.surfaces[upper]!].riserAlongX(x0, x1, edge, landward, seaward);
  }
}

/**
 * The slot along the boundary two neighbouring columns share.
 *
 * A wandering step rounds to a different tile in each of them, and between those
 * two rows one column stands a level above the other. This closes exactly the z
 * ranges where they disagree — the staircase the tile grid makes of the step,
 * seen end-on.
 */
function laySeam(
  risers: TerraceBuilders,
  west: ColumnProfile,
  east: ColumnProfile,
  x: number,
  bounds: ZBounds,
): void {
  for (const [from, to] of spansBetween(west, east, bounds.minZ, bounds.maxZ)) {
    const middle = (from + to) / 2;
    const westHeight = heightAt(west, middle);
    const eastHeight = heightAt(east, middle);
    // Made of whatever the higher of the two columns is, exactly as a step's own
    // riser is: this face is that step, seen end-on.
    const upper = westHeight >= eastHeight ? west : east;
    risers[surfaceAt(upper, middle)].riserAlongZ(x, from, to, westHeight, eastHeight);
  }
}

/**
 * The terraces and their risers, one span per tile column.
 *
 * Three passes over each column: its benches, the risers across its own steps,
 * and the seam against the column east of it. The profile is carried forward
 * rather than recomputed, so each column's steps are solved once even though two
 * columns read them.
 */
function terraceGeometry(
  elevation: Elevation,
  bounds: ZBounds & { firstColumn: number; lastColumn: number },
  tileVoxels: number,
): { tops: SurfacesBySurface; risers: SurfacesBySurface } {
  const tops = newBuilders();
  const risers = newBuilders();

  let profile = profileOf(elevation, bounds.firstColumn, tileVoxels);
  for (let tileX = bounds.firstColumn; tileX <= bounds.lastColumn; tileX++) {
    const x0 = tileX * tileVoxels;
    const x1 = x0 + tileVoxels;
    const next = profileOf(elevation, tileX + 1, tileVoxels);

    layBenches(tops, profile, x0, x1, bounds);
    layStepRisers(risers, profile, x0, x1, bounds);
    laySeam(risers, profile, next, x1, bounds);

    profile = next;
  }

  return { tops: builtBy(tops), risers: builtBy(risers) };
}

/** One builder per material, so a bench lands in the mesh its colour is drawn on. */
type TerraceBuilders = Record<TerraceSurface, TerraceBuilder>;

const newBuilders = (): TerraceBuilders => ({
  grass: new TerraceBuilder(),
  sand: new TerraceBuilder(),
});

const builtBy = (builders: TerraceBuilders): SurfacesBySurface => ({
  grass: builders.grass.build(),
  sand: builders.sand.build(),
});

/** What a plot with no terraces on it contributes: nothing, on either material. */
const NO_TERRACES: SurfacesBySurface = { grass: null, sand: null };

/**
 * The z ranges over which two neighbouring columns stand at different heights.
 *
 * Both profiles are piecewise constant in z with one breakpoint per terrace, so
 * the answer is a walk over the merged breakpoints — at most a couple of spans
 * per boundary, and none at all along the stretches where the step line happens
 * to round to the same tile in both columns.
 */
function spansBetween(
  west: ColumnProfile,
  east: ColumnProfile,
  minZ: number,
  maxZ: number,
): [number, number][] {
  const cuts = [
    minZ,
    ...[...west.edges, ...east.edges].filter((edge) => edge > minZ && edge < maxZ),
    maxZ,
  ].toSorted((a, b) => a - b);
  const spans: [number, number][] = [];
  for (let cut = 1; cut < cuts.length; cut++) {
    const from = cuts[cut - 1]!;
    const to = cuts[cut]!;
    if (to <= from) continue;
    const middle = (from + to) / 2;
    if (heightAt(west, middle) === heightAt(east, middle)) continue;
    // Merged with the last span when they meet, so a long slot is one quad.
    const last = spans[spans.length - 1];
    if (last && last[1] === from) last[1] = to;
    else spans.push([from, to]);
  }
  return spans;
}

/**
 * Builds the sea and the sand for a plot.
 *
 * Both run over the whole box rather than over the plot, so the coast carries on
 * past the resort in both directions: a beach that stopped at the plot's edge
 * would read as a swimming pool.
 */
export function terrainSurfacesFor(request: TerrainRequest): TerrainSurfaces {
  const { shore, elevation, center, reach, tileVoxels } = request;

  const minZ = center.z - reach;
  const maxZ = center.z + reach;
  const firstColumn = Math.floor((center.x - reach) / tileVoxels);
  const lastColumn = Math.ceil((center.x + reach) / tileVoxels);

  // The terraces are independent of the coast: a plot can be terraced without a
  // sea, and a plot can have a sea and be flat.
  const terraced =
    elevation && maxLevelOf(elevation) > 0
      ? terraceGeometry(elevation, { minZ, maxZ, firstColumn, lastColumn }, tileVoxels)
      : { tops: NO_TERRACES, risers: NO_TERRACES };

  if (!shore) {
    return { sand: null, sea: null, terraces: terraced.tops, risers: terraced.risers };
  }

  const coastAt: CoastAt = (x) => waterEdgeZ(shore, x / tileVoxels) * tileVoxels;
  const sand = new SurfaceBuilder(SAND_LEVEL, null);
  const sea = new SurfaceBuilder(SEA_LEVEL, coastAt);
  const clamp = (value: number): number => Math.min(maxZ, Math.max(minZ, value));

  for (let tileX = firstColumn; tileX <= lastColumn; tileX++) {
    const x0 = tileX * tileVoxels;
    const x1 = x0 + tileVoxels;
    const water = waterStartZ(shore, tileX) * tileVoxels;

    // The sea, from a tile inside the sand out to the far edge of the box.
    sea.add(x0, x1, clamp(water - SEA_UNDERLAP * tileVoxels), maxZ, water);

    // The sand, from the grass behind it up to the water's edge.
    sand.add(x0, x1, clamp(water - shore.spec.beach * tileVoxels), clamp(water));
  }

  return {
    sand: sand.build(),
    sea: sea.build(),
    terraces: terraced.tops,
    risers: terraced.risers,
  };
}
