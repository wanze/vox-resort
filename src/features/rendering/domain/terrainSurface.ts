/**
 * The two surfaces the ground plane cannot draw: the sea, and the sand in front
 * of it.
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
 */

import { waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';

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
  /** Null for a surface whose shader has no use for the numbers — the sand. */
  readonly shoreDistances: ShoreDistances | null;
  readonly indices: Uint32Array;
  readonly quadCount: number;
}

export interface TerrainSurfaces {
  /** The beach. Null when the plot has no shore. */
  readonly sand: SurfaceGeometry | null;
  /** The water, out to the horizon. Null when the plot has no shore. */
  readonly sea: SurfaceGeometry | null;
}

export interface TerrainRequest {
  readonly shore: Shore | null;
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
      shoreDistances: this.coastAt
        ? { edge: new Float32Array(this.edges), coast: new Float32Array(this.coasts) }
        : null,
      indices: new Uint32Array(this.indices),
      quadCount: this.quads,
    };
  }
}

/**
 * Builds the sea and the sand for a plot.
 *
 * Both run over the whole box rather than over the plot, so the coast carries on
 * past the resort in both directions: a beach that stopped at the plot's edge
 * would read as a swimming pool.
 */
export function terrainSurfacesFor(request: TerrainRequest): TerrainSurfaces {
  const { shore, center, reach, tileVoxels } = request;
  if (!shore) return { sand: null, sea: null };

  const minZ = center.z - reach;
  const maxZ = center.z + reach;
  const firstColumn = Math.floor((center.x - reach) / tileVoxels);
  const lastColumn = Math.ceil((center.x + reach) / tileVoxels);

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

  return { sand: sand.build(), sea: sea.build() };
}
