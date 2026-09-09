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
 * object. So both are one static mesh apiece, of a few thousand quads between
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
 * The heights are the last piece. The sea sits a hair above the grass rather
 * than below it, which is upside down as hydrology and invisible as rendering:
 * the grass plane is infinite and would otherwise poke through the water. The
 * sand sits above the sea, and the sea runs a tile in under the sand, so the
 * shoreline is a seam between two surfaces that overlap rather than a gap
 * between two that abut.
 */

import { linearRgbOf } from '../../lighting/domain/lightGrid';
import { waterStartZ, type Shore } from '../../layout/domain/shoreline';

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

/** Tiles of water drawn in the shallow colour before the sea goes deep. */
const SHALLOW_TILES = 3;

/** Tiles of sand drawn wet, where the water has just been. */
const WET_TILES = 2;

/** The palette, as packed sRGB — the same form the models paint in. */
const COLORS = {
  shallow: 0x3fa9b8,
  deep: 0x1c5f7d,
  wet: 0xb9a582,
  dry: 0xdcc9a0,
} as const;

/** How far a column's sand and water drift off the palette, 0..1 of the channel. */
const STRIPE_JITTER = 0.05;

export interface SurfaceGeometry {
  readonly positions: Float32Array;
  /** Linear RGB per vertex, the space the model geometry's colours are in. */
  readonly colors: Float32Array;
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

/** A stable 0..1 wobble per tile column, so no two are exactly one colour. */
function stripeNoise(tileX: number, salt: number): number {
  const mixed = Math.sin(tileX * 12.9898 + salt * 78.233) * 43758.5453;
  return mixed - Math.floor(mixed);
}

/** One colour, nudged by a column's own wobble and taken into linear space. */
function stripeColor(color: number, tileX: number, salt: number): [number, number, number] {
  const [r, g, b] = linearRgbOf(color);
  const shift = (stripeNoise(tileX, salt) - 0.5) * 2 * STRIPE_JITTER;
  return [r + shift, g + shift, b + shift];
}

/** Collects quads lying flat at one height, and hands back typed arrays. */
class SurfaceBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private quads = 0;

  constructor(private readonly y: number) {}

  /**
   * Adds one quad spanning `[x0, x1]` by `[z0, z1]`, wound so it faces up.
   *
   * Nothing is added for a span that has been clipped away to nothing, which is
   * what every row off the end of the coast reduces to.
   */
  add(x0: number, x1: number, z0: number, z1: number, color: readonly [number, number, number]) {
    if (x1 <= x0 || z1 <= z0) return;
    // Anticlockwise seen from above, which is what puts the normal at +y.
    const corners = [x0, z0, x0, z1, x1, z1, x1, z0];
    for (let corner = 0; corner < corners.length; corner += 2) {
      this.positions.push(corners[corner]!, this.y, corners[corner + 1]!);
      this.colors.push(...color);
    }
    const base = this.quads * 4;
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.quads++;
  }

  build(): SurfaceGeometry | null {
    if (this.quads === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      colors: new Float32Array(this.colors),
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

  const sand = new SurfaceBuilder(SAND_LEVEL);
  const sea = new SurfaceBuilder(SEA_LEVEL);
  const clamp = (value: number): number => Math.min(maxZ, Math.max(minZ, value));

  for (let tileX = firstColumn; tileX <= lastColumn; tileX++) {
    const x0 = tileX * tileVoxels;
    const x1 = x0 + tileVoxels;
    const water = waterStartZ(shore, tileX) * tileVoxels;

    // The sea, from a tile inside the sand out to the far edge of the box.
    const seaFrom = clamp(water - SEA_UNDERLAP * tileVoxels);
    const shallowTo = clamp(water + SHALLOW_TILES * tileVoxels);
    sea.add(x0, x1, seaFrom, shallowTo, stripeColor(COLORS.shallow, tileX, 1));
    sea.add(x0, x1, shallowTo, maxZ, stripeColor(COLORS.deep, tileX, 2));

    // The sand, from the grass behind it up to the water's edge.
    const sandFrom = clamp(water - shore.spec.beach * tileVoxels);
    const wetFrom = clamp(water - WET_TILES * tileVoxels);
    sand.add(x0, x1, sandFrom, wetFrom, stripeColor(COLORS.dry, tileX, 3));
    sand.add(x0, x1, wetFrom, clamp(water), stripeColor(COLORS.wet, tileX, 4));
  }

  return { sand: sand.build(), sea: sea.build() };
}
