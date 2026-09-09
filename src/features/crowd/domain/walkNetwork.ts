/**
 * Where a person may walk, worked out once per resort.
 *
 * The whole point of this module is what it takes *off* the frame. A crowd that
 * asked the ground where it was standing would call `groundAt`, `levelAt` and
 * `terraceAt` once per person per frame, and every one of those walks a list of
 * terraces and evaluates a meander — for a plot that is not changing. So the
 * questions are all asked here, at build time, and what comes out is a graph:
 * nodes at the centre of every paved tile, and edges between the pairs a person
 * can actually get between.
 *
 * A person is then never "somewhere on the plot". A person is **on an edge, at a
 * parameter between 0 and 1**, and a frame is one multiply-add and one lerp. See
 * `crowd.ts`, and `docs/crowd.md` for why that is the shape of the whole feature.
 *
 * Height comes along for free, which is the part worth pointing at: each node
 * carries the height of its own paving, so lerping across the edge between a
 * flight of stairs and the paving above it *is* the climb. Nothing walks up a
 * step by knowing that it is a step.
 *
 * ## What makes an edge
 *
 * Two paved tiles, 4-neighbours, and one of:
 *
 * - **the same level**, which is every ordinary pair; or
 * - **one level apart**, and the lower tile is a flight of stairs *facing the
 *   higher one*.
 *
 * The second clause is the whole of the terrain handling, and it is deliberately
 * asked of `stairs.ts` rather than re-derived here. It is nearly true that any
 * paved pair a level apart is a flight — that is exactly what `climbAt` says —
 * but not quite: where a path turns *on* a step, the corner tile has higher
 * paved ground on two perpendicular sides and can only climb one of them. The
 * other pair looks walkable and is a wall. One rule, in one place, or the crowd
 * would walk up the side of a staircase.
 *
 * ## The beach is not in the graph
 *
 * Sand is the one place people should move freely, and a 112 x 14 field of tile
 * centres is a chessboard rather than a beach. So the sand band is kept as a
 * *region* — the two numbers per column that bound it — and a person on it picks
 * a point and walks to it. See {@link beachPointAt}.
 *
 * The two are joined by **gates**: paved nodes with open sand next to them, which
 * is exactly where a boardwalk runs out onto the beach. A person leaves the graph
 * at a gate and comes back through one.
 */

import { LEVEL_VOXELS, PAVING_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import type { Tile } from '../../layout/domain/resortLayout';
import { CLIMBS, stairTilesFor } from '../../layout/domain/stairs';
import { terrainAt, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL } from '../../rendering/domain/terrainSurface';

/**
 * A paved tile, as the layout describes one.
 *
 * Deliberately narrower than `Placement`: what a person needs of a path is where
 * it is and how high it stands, and taking only that is what lets a test build a
 * network out of four tiles instead of out of four placements.
 */
export interface PavedTile {
  readonly tileX: number;
  readonly tileZ: number;
  /** Height of the ground under the slab, in voxels. */
  readonly y: number;
}

/** One walkable spot: the centre of a paved tile, on its walking surface. */
export interface WalkNode {
  /** World position of the tile's centre, in voxels. */
  readonly x: number;
  readonly z: number;
  /** Top of the paving, which is what a person's feet are on. */
  readonly y: number;
  readonly tileX: number;
  readonly tileZ: number;
  /** Indices into {@link WalkNetwork.edges} of every edge leaving here. */
  readonly exits: readonly number[];
  /** Whether open sand adjoins this tile, so a person may step off onto it. */
  readonly gate: boolean;
}

/**
 * One direction of one adjacency.
 *
 * Directed, and stored in both directions, because a person walking an edge has
 * a direction and giving them one saves a flag and a branch. `length` is the
 * true 3-D distance, so a flight of stairs takes longer to climb than a slab
 * takes to cross — which it should, and which costs nothing to be right about.
 */
export interface WalkEdge {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

/** The sand a person may roam over: level ground, bounded per column. */
export interface BeachBand {
  readonly shore: Shore;
  /** Columns the plot actually has, so a roamer cannot walk off the west end. */
  readonly tilesX: number;
}

export interface WalkNetwork {
  readonly nodes: readonly WalkNode[];
  readonly edges: readonly WalkEdge[];
  /** Node indices with open sand beside them; empty on a plot with no coast. */
  readonly gates: readonly number[];
  /** Null when the plan has no beach, which is every flat authored plan. */
  readonly beach: BeachBand | null;
}

const tileKey = (x: number, z: number): string => `${x},${z}`;

/** The 4-neighbours, in the order `stairs.ts` resolves an ambiguous corner in. */
const NEIGHBOURS = CLIMBS.map(({ dx, dz }) => [dx, dz] as const);

/** Where a person's feet are on a paved tile standing on ground at `y`. */
export const walkingSurface = (y: number): number => y + PAVING_VOXELS;

export interface WalkNetworkInput {
  /** Every paved tile of the plot: `layout.paths` satisfies this as it stands. */
  readonly paved: readonly PavedTile[];
  /** How high the ground under a tile is; only the stair rule reads it. */
  readonly levelOf: LevelProvider;
  /** Where the plot meets the sea. Null is a plot with no beach to roam. */
  readonly shore: Shore | null;
  /** Columns the plot has, which bounds the beach. */
  readonly tilesX: number;
}

/**
 * The graph a crowd walks, from the resort as laid out.
 *
 * Built once when the resort is, and thrown away when it is regenerated: it is
 * derived from the paving, and the paving is what a regenerate changes.
 */
export function walkNetworkFor(input: WalkNetworkInput): WalkNetwork {
  const { paved, levelOf, shore, tilesX } = input;

  const indexOf = new Map<string, number>();
  for (const [index, tile] of paved.entries()) indexOf.set(tileKey(tile.tileX, tile.tileZ), index);

  const climbs = climbsAmong(paved, levelOf);
  const exits: number[][] = paved.map(() => []);
  const edges: WalkEdge[] = [];

  for (const [from, tile] of paved.entries()) {
    for (const [dx, dz] of NEIGHBOURS) {
      const to = indexOf.get(tileKey(tile.tileX + dx, tile.tileZ + dz));
      if (to === undefined) continue;
      const rise = paved[to]!.y - tile.y;
      if (!walkable(tile, { dx, dz }, rise, climbs)) continue;
      exits[from]!.push(edges.length);
      edges.push({ from, to, length: Math.hypot(TILE_VOXELS, rise) });
    }
  }

  const gates: number[] = [];
  const nodes = paved.map((tile, index) => {
    const gate = adjoinsOpenSand(tile, shore, indexOf);
    if (gate) gates.push(index);
    return {
      x: (tile.tileX + 0.5) * TILE_VOXELS,
      z: (tile.tileZ + 0.5) * TILE_VOXELS,
      y: walkingSurface(tile.y),
      tileX: tile.tileX,
      tileZ: tile.tileZ,
      exits: exits[index]!,
      gate,
    };
  });

  return { nodes, edges, gates, beach: shore ? { shore, tilesX } : null };
}

/**
 * Which paved tiles are flights, and which way each one climbs.
 *
 * Asked of `stairs.ts` rather than re-derived; see the note at the top of the
 * file for the corner case that makes the difference.
 */
function climbsAmong(
  paved: readonly PavedTile[],
  levelOf: LevelProvider,
): ReadonlyMap<string, { dx: number; dz: number }> {
  const climbs = new Map<string, { dx: number; dz: number }>();
  const asTiles: Tile[] = paved.map((tile) => ({ x: tile.tileX, z: tile.tileZ }));
  for (const stair of stairTilesFor(asTiles, levelOf)) {
    const climb = CLIMBS.find((candidate) => candidate.rotation === stair.rotation);
    if (climb) climbs.set(tileKey(stair.tile.x, stair.tile.z), { dx: climb.dx, dz: climb.dz });
  }
  return climbs;
}

/**
 * Whether a person can get from a paved tile to the paved neighbour `rise`
 * voxels above it.
 *
 * Flat is always yes. A climb is yes only if this tile is the flight and the
 * flight faces that way — see the note at the top of the file on why the second
 * half of that matters. A *drop* is the same question asked from the other side,
 * and it is answered by the edge in the other direction: every adjacency is
 * visited from both ends, so the pair either both exist or neither does.
 */
function walkable(
  tile: PavedTile,
  step: { readonly dx: number; readonly dz: number },
  rise: number,
  climbs: ReadonlyMap<string, { dx: number; dz: number }>,
): boolean {
  if (rise === 0) return true;
  if (Math.abs(rise) !== LEVEL_VOXELS) return false;

  // The flight is always on the lower tile, and it has to face the higher one:
  // this step for a climb, and the way we came for a drop.
  const climbing = rise > 0;
  const lowerX = climbing ? tile.tileX : tile.tileX + step.dx;
  const lowerZ = climbing ? tile.tileZ : tile.tileZ + step.dz;
  const climb = climbs.get(tileKey(lowerX, lowerZ));
  if (!climb) return false;
  const towardsX = climbing ? step.dx : -step.dx;
  const towardsZ = climbing ? step.dz : -step.dz;
  return climb.dx === towardsX && climb.dz === towardsZ;
}

/** Whether unpaved sand adjoins a tile, which is what makes its node a gate. */
function adjoinsOpenSand(
  tile: PavedTile,
  shore: Shore | null,
  paved: ReadonlyMap<string, number>,
): boolean {
  if (!shore) return false;
  return NEIGHBOURS.some(([dx, dz]) => {
    const x = tile.tileX + dx;
    const z = tile.tileZ + dz;
    if (paved.has(tileKey(x, z))) return false;
    return terrainAt(shore, x, z) === 'beach';
  });
}

/** Where a person roaming the sand stands: the top of the beach surface. */
export const BEACH_SURFACE = SAND_LEVEL;

/**
 * How far along the beach a roamer will pick their next spot, in tile columns.
 *
 * A roamer walks a **straight line** to whatever they pick, and the coast
 * wanders — so two points that are both on sand can have sea between them, and a
 * target picked anywhere on the beach sent people wading. Keeping the chord to a
 * few columns keeps it on the sand, because the coast's own meander moves well
 * under a tile over that distance.
 *
 * It is the better behaviour anyway: somebody on a beach mills about where they
 * are, rather than setting off on a four-hundred-metre walk to the far end of it.
 */
const ROAM_COLUMNS = 3;

/**
 * How far back from the water's edge a roamer will go, in tiles.
 *
 * The other half of keeping the chord dry, and it is also just what a beach
 * looks like: the last row of sand is where the sea washes over it.
 */
const WATER_MARGIN = 1;

/**
 * A point on the open sand, drawn from `random`.
 *
 * No query and no search: a column is picked, `waterStartZ` says where its water
 * begins, and the band of sand is the fixed depth in front of that. The beach is
 * level 0 by an invariant `elevation.ts` enforces, so the height is a constant
 * rather than a lookup — which is the reason the beach can be a region at all.
 *
 * The point is continuous rather than a tile centre, because a beach walked on
 * tile centres is a chessboard.
 *
 * `fromX` is where the person picking it is standing, in voxels, and the point
 * comes back within {@link ROAM_COLUMNS} of it — see the note there for why that
 * is a correctness rule and not only a nicer walk. Omit it to draw from the
 * whole beach, which is what spawning somebody onto it does.
 */
export function beachPointAt(
  beach: BeachBand,
  random: () => number,
  fromX?: number,
): { readonly x: number; readonly z: number } {
  const column = nearbyColumn(beach, random, fromX);
  const water = waterStartZ(beach.shore, column);
  // The sand runs from the row against the grass down to the row at the water's
  // edge; `beach` is that depth, and it is at least one by construction.
  const back = water - beach.shore.spec.beach;
  const front = Math.max(back, water - 1 - WATER_MARGIN);
  return {
    x: (column + random()) * TILE_VOXELS,
    z: (back + random() * (front - back)) * TILE_VOXELS,
  };
}

/** A column of the plot, near `fromX` when there is one to be near. */
function nearbyColumn(beach: BeachBand, random: () => number, fromX?: number): number {
  const last = beach.tilesX - 1;
  if (fromX === undefined) return Math.min(last, Math.floor(random() * beach.tilesX));
  const here = Math.floor(fromX / TILE_VOXELS);
  const drift = Math.round((random() * 2 - 1) * ROAM_COLUMNS);
  return Math.min(last, Math.max(0, here + drift));
}
