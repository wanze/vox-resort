import {
  BRIDGE_VOXELS,
  LEVEL_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
} from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import type { Tile } from '../../layout/domain/resortLayout';
import { CLIMBS, stairTilesFor } from '../../layout/domain/stairs';
import { spanTilesFor, type SpanKind, type SpanProvider } from '../../layout/domain/spans';
import { terrainAt, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL } from '../../rendering/domain/terrainSurface';
import type { SeatPose } from '../../../../voxel-gen/voxelgen.ts';
import type { SeatSpot } from './seating';
import { sandGridFor, type ObstacleBox, type SandGrid } from './sandGrid';

export interface PavedTile {
  readonly tileX: number;
  readonly tileZ: number;
  readonly y: number;
}

export interface WalkNode {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly tileX: number;
  readonly tileZ: number;
  readonly exits: readonly number[];
  readonly gate: boolean;
  readonly seats: readonly number[];
}

export interface WalkEdge {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

export interface BeachBand {
  readonly shore: Shore;
  readonly tilesX: number;
}

// The heading comes from the art, not the last step walked, or half the sitters would face
// the back rail.
export interface WalkSeat {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly heading: number;
  readonly pose: SeatPose;
  readonly node: number;
}

export const OFF_THE_GRAPH = -1;

export interface WalkNetwork {
  readonly nodes: readonly WalkNode[];
  readonly edges: readonly WalkEdge[];
  readonly gates: readonly number[];
  readonly beach: BeachBand | null;
  readonly seats: readonly WalkSeat[];
  readonly beachSeats: readonly number[];
  readonly sand: SandGrid | null;
}

const tileKey = (x: number, z: number): string => `${x},${z}`;

const NEIGHBOURS = CLIMBS.map(({ dx, dz }) => [dx, dz] as const);

export const walkingSurface = (y: number): number => y + PAVING_VOXELS;

export interface WalkNetworkInput {
  readonly paved: readonly PavedTile[];
  readonly levelOf: LevelProvider;
  readonly shore: Shore | null;
  readonly tilesX: number;
  readonly seats?: readonly SeatSpot[];
  readonly bridged?: SpanProvider;
  readonly obstacles?: readonly ObstacleBox[];
}

export function walkNetworkFor(input: WalkNetworkInput): WalkNetwork {
  const { paved, levelOf, shore, tilesX } = input;

  const indexOf = new Map<string, number>();
  for (const [index, tile] of paved.entries()) indexOf.set(tileKey(tile.tileX, tile.tileZ), index);

  const climbs = climbsAmong(paved, levelOf);
  const spans = spansAmong(paved, input.bridged);

  const nodes: WalkNode[] = [];
  const exits: number[][] = [];
  const seatsOf: number[][] = [];
  const edges: WalkEdge[] = [];
  const gates: number[] = [];
  const standing = new Map<string, number>();

  // Shared by position: the top of one flight and the foot of the next are one landing.
  const standAt = (x: number, y: number, z: number, tile: PavedTile, gate = false): number => {
    const key = `${x},${y},${z}`;
    const existing = standing.get(key);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    // Exits and seats are only known once every node exists, so they are pushed later.
    const own: number[] = [];
    const sittable: number[] = [];
    nodes.push({
      x,
      y,
      z,
      tileX: tile.tileX,
      tileZ: tile.tileZ,
      exits: own,
      gate,
      seats: sittable,
    });
    exits.push(own);
    seatsOf.push(sittable);
    standing.set(key, index);
    if (gate) gates.push(index);
    return index;
  };

  const link = (from: number, to: number): void => {
    if (from === to) return;
    const a = nodes[from]!;
    const b = nodes[to]!;
    exits[from]!.push(edges.length);
    edges.push({ from, to, length: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
  };

  const stands = paved.map((tile) => standFor(tile, climbs, spans, shore, indexOf, standAt));
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

  const { seats, beachSeats } = seatsAmong(input.seats ?? [], nodes, seatsOf, shore);

  return {
    nodes,
    edges,
    gates,
    beach: shore ? { shore, tilesX } : null,
    seats,
    beachSeats,
    sand: sandOf(input),
  };
}

function sandOf(input: WalkNetworkInput): SandGrid | null {
  if (!input.shore) return null;
  return sandGridFor({
    shore: input.shore,
    tilesX: input.tilesX,
    obstacles: input.obstacles ?? [],
  });
}

// Half a terrace: a seat names hip height, so it sits a few voxels above its paving, but
// paving a whole terrace away is out of reach.
const SEAT_RISE = LEVEL_VOXELS / 2;

function seatsAmong(
  spots: readonly SeatSpot[],
  nodes: readonly WalkNode[],
  seatsOf: readonly number[][],
  shore: Shore | null,
): { readonly seats: WalkSeat[]; readonly beachSeats: number[] } {
  const seats: WalkSeat[] = [];
  const beachSeats: number[] = [];
  if (spots.length === 0) return { seats, beachSeats };

  const byTile = nodesByTile(nodes);
  for (const spot of spots) {
    const node = nodeFor(spot, nodes, byTile);
    const sand = node === OFF_THE_GRAPH && onOpenSand(spot, shore);
    if (node === OFF_THE_GRAPH && !sand) continue;
    if (sand) beachSeats.push(seats.length);
    else seatsOf[node]!.push(seats.length);
    seats.push({
      x: spot.x,
      y: spot.y,
      z: spot.z,
      heading: spot.heading,
      pose: spot.pose,
      node,
    });
  }
  return { seats, beachSeats };
}

function onOpenSand(spot: SeatSpot, shore: Shore | null): boolean {
  return shore !== null && terrainAt(shore, spot.tileX, spot.tileZ) === 'beach';
}

function nodesByTile(nodes: readonly WalkNode[]): ReadonlyMap<string, number[]> {
  const byTile = new Map<string, number[]>();
  for (const [index, node] of nodes.entries()) {
    const key = tileKey(node.tileX, node.tileZ);
    const standing = byTile.get(key);
    if (standing) standing.push(index);
    else byTile.set(key, [index]);
  }
  return byTile;
}

const SEAT_TILES = [[0, 0] as const, ...NEIGHBOURS];

// Measured on the ground plane: the vertical part is what SEAT_RISE already bounds.
function nodeFor(
  spot: SeatSpot,
  nodes: readonly WalkNode[],
  byTile: ReadonlyMap<string, number[]>,
): number {
  let nearest = OFF_THE_GRAPH;
  let best = Infinity;
  for (const [dx, dz] of SEAT_TILES) {
    for (const index of byTile.get(tileKey(spot.tileX + dx, spot.tileZ + dz)) ?? []) {
      const node = nodes[index]!;
      const reach = Math.hypot(node.x - spot.x, node.z - spot.z);
      if (reach < best && Math.abs(node.y - spot.y) <= SEAT_RISE) {
        best = reach;
        nearest = index;
      }
    }
  }
  return nearest;
}

type TileStand =
  | { readonly kind: 'centre'; readonly node: number }
  | {
      readonly kind: 'flight';
      readonly climb: { readonly dx: number; readonly dz: number };
      readonly low: number;
      readonly high: number;
    };

const HALF_TILE = TILE_VOXELS / 2;

// A flight gets a node at each end: a centre node at its tile's ground height sits half a
// level under the treads. Sideways neighbours reach the foot because stairs.ts also makes
// flights across corridors, and refusing them would strand the corridor.
function standFor(
  tile: PavedTile,
  climbs: ReadonlyMap<string, { dx: number; dz: number }>,
  spans: ReadonlyMap<string, Span>,
  shore: Shore | null,
  paved: ReadonlyMap<string, number>,
  standAt: (x: number, y: number, z: number, tile: PavedTile, gate?: boolean) => number,
): TileStand {
  const x = (tile.tileX + 0.5) * TILE_VOXELS;
  const z = (tile.tileZ + 0.5) * TILE_VOXELS;
  const foot = walkingSurface(tile.y);
  const key = tileKey(tile.tileX, tile.tileZ);
  const span = spans.get(key);
  // Never a beach gate: the deck stands a metre above the sand.
  if (span?.kind === 'deck') {
    return { kind: 'centre', node: standAt(x, tile.y + BRIDGE_VOXELS, z, tile) };
  }
  const rise = span ? BRIDGE_VOXELS - PAVING_VOXELS : LEVEL_VOXELS;
  const climb = span ? span.climb : climbs.get(key);
  if (!climb) {
    const gate = adjoinsOpenSand(tile, shore, paved);
    return { kind: 'centre', node: standAt(x, foot, z, tile, gate) };
  }
  return {
    kind: 'flight',
    climb,
    low: standAt(x - climb.dx * HALF_TILE, foot, z - climb.dz * HALF_TILE, tile),
    high: standAt(x + climb.dx * HALF_TILE, foot + rise, z + climb.dz * HALF_TILE, tile),
  };
}

function facing(stand: TileStand, dx: number, dz: number): number {
  if (stand.kind === 'centre') return stand.node;
  return stand.climb.dx === dx && stand.climb.dz === dz ? stand.high : stand.low;
}

// Flipped from spans.ts, which names a ramp by its shore: a stand wants the way the surface rises.
interface Span {
  readonly kind: SpanKind;
  readonly climb: { readonly dx: number; readonly dz: number };
}

// Asked of spans.ts so a crossing cannot come ashore in one module and not the other.
function spansAmong(
  paved: readonly PavedTile[],
  bridged: SpanProvider | undefined,
): ReadonlyMap<string, Span> {
  const spans = new Map<string, Span>();
  if (!bridged) return spans;
  const asTiles: Tile[] = paved.map((tile) => ({ x: tile.tileX, z: tile.tileZ }));
  for (const span of spanTilesFor(asTiles, bridged)) {
    const bank = CLIMBS.find((candidate) => candidate.rotation === span.rotation);
    if (!bank) continue;
    spans.set(tileKey(span.tile.x, span.tile.z), {
      kind: span.kind,
      climb: { dx: -bank.dx, dz: -bank.dz },
    });
  }
  return spans;
}

// Asked of stairs.ts: where a path turns on a step, the corner tile has higher paving on two
// sides but can only climb one; the other pair looks walkable and is a wall.
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

// A drop is answered by the edge in the other direction: every adjacency is visited from both ends.
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

export const BEACH_SURFACE = SAND_LEVEL;

// A roamer walks a straight line and the coast wanders, so a far target can have sea in
// between; a few columns keeps the chord on the sand.
const ROAM_COLUMNS = 3;

// Keeps the chord dry on the seaward side too.
const WATER_MARGIN = 1;

// The beach is level 0 by an invariant elevation.ts enforces, so the height is a constant.
export function beachPointAt(
  beach: BeachBand,
  random: () => number,
  fromX?: number,
): { readonly x: number; readonly z: number } {
  const column = nearbyColumn(beach, random, fromX);
  const water = waterStartZ(beach.shore, column);
  const back = water - beach.shore.spec.beach;
  const front = Math.max(back, water - 1 - WATER_MARGIN);
  return {
    x: (column + random()) * TILE_VOXELS,
    z: (back + random() * (front - back)) * TILE_VOXELS,
  };
}

function nearbyColumn(beach: BeachBand, random: () => number, fromX?: number): number {
  const last = beach.tilesX - 1;
  if (fromX === undefined) return Math.min(last, Math.floor(random() * beach.tilesX));
  const here = Math.floor(fromX / TILE_VOXELS);
  const drift = Math.round((random() * 2 - 1) * ROAM_COLUMNS);
  return Math.min(last, Math.max(0, here + drift));
}
