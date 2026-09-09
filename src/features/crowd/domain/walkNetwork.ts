/**
 * Where a person may walk, worked out once per resort.
 *
 * The whole point of this module is what it takes *off* the frame. A crowd that
 * asked the ground where it was standing would call `groundAt`, `levelAt` and
 * `terraceAt` once per person per frame, and every one of those walks a list of
 * terraces and evaluates a meander — for a plot that is not changing. So the
 * questions are all asked here, at build time, and what comes out is a graph:
 * nodes on every paved tile, and edges between the pairs a person can actually
 * get between.
 *
 * A person is then never "somewhere on the plot". A person is **on an edge, at a
 * parameter between 0 and 1**, and a frame is one multiply-add and one lerp. See
 * `crowd.ts`, and `docs/crowd.md` for why that is the shape of the whole feature.
 *
 * Height comes along for free, which is the part worth pointing at: each node
 * carries the height of the paving it stands on, so lerping along the edge that
 * *is* a flight of stairs is the climb up it. Nothing walks up a step by knowing
 * that it is a step.
 *
 * Which is why a flight is the one tile that holds **two** nodes, at its foot and
 * at its head, rather than one at its centre. A flight's ramp runs from the
 * paving it continues to the paving above across the width of its own tile, so a
 * node in the middle of it is half a level under the treads — and a crowd walked
 * to it wades through the staircase up to the shoulders. See {@link standFor},
 * which is where that is put right and where the two rules it drags along —
 * nothing steps onto a flight sideways, and a flight is never a beach gate — are
 * written down.
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

/**
 * One walkable spot: the centre of a paved tile, or one end of a flight.
 *
 * Nodes are **not** one per paved tile. Most tiles have exactly one, at their
 * centre; a flight has one at each end of its climb, and where two flights meet
 * they share the landing between them. See {@link standFor}.
 */
export interface WalkNode {
  /** Where a person stands, in world voxels. */
  readonly x: number;
  readonly z: number;
  /** Top of the paving here, which is what a person's feet are on. */
  readonly y: number;
  /** The tile this spot belongs to; a shared landing names one of the two. */
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

  const nodes: WalkNode[] = [];
  const exits: number[][] = [];
  const edges: WalkEdge[] = [];
  const gates: number[] = [];
  /** Nodes by the point they stand on, which is what lets two flights share one. */
  const standing = new Map<string, number>();

  /**
   * The node standing at a point, made on first use.
   *
   * Shared by position rather than owned by a tile, because two flights that
   * meet meet *at a point*: the top of one and the foot of the next are the same
   * landing, and two nodes there would be a zero-length edge between two places
   * that are one place.
   */
  const standAt = (x: number, y: number, z: number, tile: PavedTile, gate = false): number => {
    const key = `${x},${y},${z}`;
    const existing = standing.get(key);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    // The node's own list, held on to here so a link can push to it: what a node
    // can be walked to is only known once every node exists.
    const own: number[] = [];
    nodes.push({ x, y, z, tileX: tile.tileX, tileZ: tile.tileZ, exits: own, gate });
    exits.push(own);
    standing.set(key, index);
    if (gate) gates.push(index);
    return index;
  };

  /** Joins two nodes, one way. Their own positions are what say how far it is. */
  const link = (from: number, to: number): void => {
    if (from === to) return;
    const a = nodes[from]!;
    const b = nodes[to]!;
    exits[from]!.push(edges.length);
    edges.push({ from, to, length: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
  };

  const stands = paved.map((tile) => standFor(tile, climbs, shore, indexOf, standAt));
  // The climb itself, walked in both directions like every other adjacency.
  for (const stand of stands) {
    if (stand.kind !== 'flight') continue;
    link(stand.low, stand.high);
    link(stand.high, stand.low);
  }

  for (const [index, tile] of paved.entries()) {
    for (const [dx, dz] of NEIGHBOURS) {
      const other = indexOf.get(tileKey(tile.tileX + dx, tile.tileZ + dz));
      if (other === undefined) continue;
      const rise = paved[other]!.y - tile.y;
      if (!walkable(tile, { dx, dz }, rise, climbs)) continue;
      link(facing(stands[index]!, dx, dz), facing(stands[other]!, -dx, -dz));
    }
  }

  return { nodes, edges, gates, beach: shore ? { shore, tilesX } : null };
}

/**
 * Where a person may stand on one paved tile.
 *
 * An ordinary tile is one place — its centre. A flight is **two**: the foot and
 * the head of the climb, at the tile's own two edges. See {@link standFor}.
 */
type TileStand =
  | { readonly kind: 'centre'; readonly node: number }
  | {
      readonly kind: 'flight';
      readonly climb: { readonly dx: number; readonly dz: number };
      readonly low: number;
      readonly high: number;
    };

/** How far a tile's edge is from its centre. */
const HALF_TILE = TILE_VOXELS / 2;

/**
 * The places one paved tile offers to stand on.
 *
 * A flight gets one at each end of the climb rather than one in the middle, and
 * that is the whole of why this function exists. A flight's ramp runs from the
 * paving it continues at one tile edge to the paving above at the other, so a
 * node at the tile *centre* — carrying, as every node does, the height of the
 * ground under its own tile — sits half a level under the treads. Walking to it
 * buried a person to the shoulders for the length of the flight, which is what
 * looking at the resort said before anything here changed.
 *
 * Two nodes at the tile's edges make the polyline the true surface: flat from
 * the neighbour's centre to the foot of the flight, the climb across the tile,
 * flat on to the next centre. Nothing is approximated and nothing per frame
 * changes — a person still lerps between two node heights.
 *
 * A flight is entered at its foot and left at its head, and {@link facing} is
 * where that is decided. A neighbour *beside* a flight reaches its foot too, and
 * that one is not tidiness but necessity: `stairs.ts` turns a tile into a flight
 * wherever paved ground stands a level above it, corridor tiles included, so on
 * a real plot a path sometimes runs straight through a flight at right angles to
 * the climb. Refusing that pair strands the whole corridor behind it — 46 nodes
 * of one generated plot. Sending it through the foot instead is a dogleg round
 * the bottom of the staircase, at the height the path is already at, which is
 * what a person would do with the same obstacle.
 *
 * A flight is never a beach gate: you step onto the sand off the paving, not off
 * a staircase.
 */
function standFor(
  tile: PavedTile,
  climbs: ReadonlyMap<string, { dx: number; dz: number }>,
  shore: Shore | null,
  paved: ReadonlyMap<string, number>,
  standAt: (x: number, y: number, z: number, tile: PavedTile, gate?: boolean) => number,
): TileStand {
  const x = (tile.tileX + 0.5) * TILE_VOXELS;
  const z = (tile.tileZ + 0.5) * TILE_VOXELS;
  const foot = walkingSurface(tile.y);
  const climb = climbs.get(tileKey(tile.tileX, tile.tileZ));
  if (!climb) {
    const gate = adjoinsOpenSand(tile, shore, paved);
    return { kind: 'centre', node: standAt(x, foot, z, tile, gate) };
  }
  return {
    kind: 'flight',
    climb,
    low: standAt(x - climb.dx * HALF_TILE, foot, z - climb.dz * HALF_TILE, tile),
    // The head of the flight is flush with the paving on the terrace above,
    // which is what `stairs.ts` authors the topmost tread to be.
    high: standAt(x + climb.dx * HALF_TILE, foot + LEVEL_VOXELS, z + climb.dz * HALF_TILE, tile),
  };
}

/**
 * The node a tile offers to a neighbour that way.
 *
 * The head of a flight faces the ground it climbs to and nothing else; every
 * other way in — from below, and from either side — arrives at its foot. See
 * {@link standFor} for why the sideways case has to be allowed at all.
 */
function facing(stand: TileStand, dx: number, dz: number): number {
  if (stand.kind === 'centre') return stand.node;
  return stand.climb.dx === dx && stand.climb.dz === dz ? stand.high : stand.low;
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
