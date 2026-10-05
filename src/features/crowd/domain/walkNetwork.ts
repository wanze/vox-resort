import type { TileSpan } from '../../land/domain/landRights';
import {
  BRIDGE_VOXELS,
  LEVEL_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
} from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import type { Tile } from '../../layout/domain/resortLayout';
import { CLIMBS, stairTilesFor } from '../../layout/domain/stairs';
import type { ClimbKind } from '../../layout/domain/climbs';
import {
  RAMP_FOOT_ID,
  RAMP_HEAD_ID,
  STAIRCASE_ID,
  STAIRS_ID,
} from '../../layout/domain/resortPlan';
import type { Rotation } from '../../layout/domain/rotation';
import { spanTilesFor, type SpanKind, type SpanProvider } from '../../layout/domain/spans';
import { beachTilesOf, terrainAt, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL } from '../../rendering/domain/terrainSurface';
import type { SeatPose } from '../../../../voxel-gen/voxelgen.ts';
import type { SeatSpot } from './seating';
import { sandGridFor, type ObstacleBox, type SandGrid } from './sandGrid';

export interface PavedTile {
  readonly tileX: number;
  readonly tileZ: number;
  readonly y: number;
  // What was laid, read so the graph climbs where the paving does, an old save's flights included.
  readonly id?: string;
  readonly rotation?: Rotation;
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
  // Up or down the treads of a flight: the one way a wheelchair cannot go.
  readonly stepped: boolean;
}

export interface BeachBand {
  readonly shore: Shore;
  readonly tilesX: number;
  // The columns guests may roam: the land owned, which may be less than the world's width.
  readonly span: TileSpan;
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
  // Staff seats: in neither a node's seats nor beachSeats, the only lists guests look in.
  readonly posts: readonly number[];
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
  // The whole width when left out.
  readonly span?: TileSpan;
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
  const sandAt = openSandOf(shore, levelOf);

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

  const link = (from: number, to: number, stepped = false): void => {
    if (from === to) return;
    const a = nodes[from]!;
    const b = nodes[to]!;
    exits[from]!.push(edges.length);
    edges.push({ from, to, length: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), stepped });
  };

  const stands = paved.map((tile) =>
    standFor(tile, climbs, spans, adjoinsOpenSand(tile, sandAt, levelOf, indexOf), standAt),
  );
  for (const stand of stands) {
    if (stand.kind !== 'flight') continue;
    link(stand.low, stand.high, stand.stepped);
    link(stand.high, stand.low, stand.stepped);
  }

  const linkNeighbours = (index: number, tile: PavedTile): void => {
    for (const [dx, dz] of NEIGHBOURS) {
      const other = indexOf.get(tileKey(tile.tileX + dx, tile.tileZ + dz));
      if (other === undefined) continue;
      const here = stands[index]!;
      const there = stands[other]!;
      if (!steppable(tile, paved[other]!, { here, there, dx, dz }, climbs)) continue;
      link(facing(here, dx, dz), facing(there, -dx, -dz));
    }
  };
  for (const [index, tile] of paved.entries()) linkNeighbours(index, tile);

  const { seats, beachSeats, posts } = seatsAmong(input.seats ?? [], nodes, seatsOf, sandAt);

  return {
    nodes,
    edges,
    gates,
    beach: shore ? { shore, tilesX, span: spanOf(input) } : null,
    seats,
    beachSeats,
    posts,
    sand: sandOf(input, climbs),
  };
}

const spanOf = (input: WalkNetworkInput): TileSpan => input.span ?? { from: 0, to: input.tilesX };

type SandProvider = (tileX: number, tileZ: number) => boolean;

// Roamers walk the sand as one flat sheet at sea level, so a dune raised on the beach is not sand
// anybody can stand on.
const openSandOf =
  (shore: Shore | null, levelOf: LevelProvider): SandProvider =>
  (tileX, tileZ) =>
    shore !== null && terrainAt(shore, tileX, tileZ) === 'beach' && levelOf(tileX, tileZ) === 0;

const tileBox = (tileX: number, tileZ: number): ObstacleBox => ({
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  width: TILE_VOXELS,
  depth: TILE_VOXELS,
});

// Roamers cross the sand at its own height, and a ramp or flight rises out of it: walked through,
// it would hide them to the waist.
function sandOf(input: WalkNetworkInput, climbs: ReadonlyMap<string, Climb>): SandGrid | null {
  if (!input.shore) return null;
  const raised: ObstacleBox[] = input.paved
    .filter((tile) => climbs.has(tileKey(tile.tileX, tile.tileZ)))
    .map((tile) => tileBox(tile.tileX, tile.tileZ));
  const dunes: ObstacleBox[] = beachTilesOf(input.shore)
    .filter((tile) => input.levelOf(tile.x, tile.z) !== 0)
    .map((tile) => tileBox(tile.x, tile.z));
  return sandGridFor({
    shore: input.shore,
    tilesX: input.tilesX,
    span: spanOf(input),
    obstacles: [...(input.obstacles ?? []), ...raised, ...dunes],
  });
}

// Half a terrace: a seat names hip height, so it sits a few voxels above its paving, but
// paving a whole terrace away is out of reach.
const SEAT_RISE = LEVEL_VOXELS / 2;

function seatsAmong(
  spots: readonly SeatSpot[],
  nodes: readonly WalkNode[],
  seatsOf: readonly number[][],
  sandAt: SandProvider,
): { readonly seats: WalkSeat[]; readonly beachSeats: number[]; readonly posts: number[] } {
  const seats: WalkSeat[] = [];
  const beachSeats: number[] = [];
  const posts: number[] = [];
  if (spots.length === 0) return { seats, beachSeats, posts };

  const byTile = nodesByTile(nodes);
  for (const spot of spots) {
    // Only on sand: a lifeguard reaches a post over the beach, never from the paving.
    if (spot.post) {
      if (!sandAt(spot.tileX, spot.tileZ)) continue;
      posts.push(seats.length);
      seats.push(walkSeatAt(spot, OFF_THE_GRAPH));
      continue;
    }
    const node = nodeFor(spot, nodes, byTile);
    const sand = node === OFF_THE_GRAPH && sandAt(spot.tileX, spot.tileZ);
    if (node === OFF_THE_GRAPH && !sand) continue;
    if (sand) beachSeats.push(seats.length);
    else seatsOf[node]!.push(seats.length);
    seats.push(walkSeatAt(spot, node));
  }
  return { seats, beachSeats, posts };
}

const walkSeatAt = (spot: SeatSpot, node: number): WalkSeat => ({
  x: spot.x,
  y: spot.y,
  z: spot.z,
  heading: spot.heading,
  pose: spot.pose,
  node,
});

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
      readonly stepped: boolean;
      // Only the foot of a slope can be stepped onto from the side: elsewhere it is off the ground.
      readonly raised: boolean;
    };

interface Climb {
  readonly dx: number;
  readonly dz: number;
  readonly kind: ClimbKind;
}

const HALF_LEVEL = LEVEL_VOXELS / 2;

// Where each piece starts and ends above its tile's walking surface. A ramp's head starts half a
// level up, so it shares its low node with its foot's high one by position.
const SLOPES: { readonly [kind in ClimbKind]: Omit<Slope, 'gate'> } = {
  stairs: { low: 0, high: LEVEL_VOXELS, stepped: true, raised: false },
  'ramp-foot': { low: 0, high: HALF_LEVEL, stepped: false, raised: false },
  'ramp-head': { low: HALF_LEVEL, high: LEVEL_VOXELS, stepped: false, raised: true },
};

const HALF_TILE = TILE_VOXELS / 2;

// A flight gets a node at each end: a centre node at its tile's ground height sits half a
// level under the treads. Sideways neighbours reach the foot because stairs.ts also makes
// flights across corridors, and refusing them would strand the corridor.
function standFor(
  tile: PavedTile,
  climbs: ReadonlyMap<string, Climb>,
  spans: ReadonlyMap<string, Span>,
  gate: boolean,
  standAt: (x: number, y: number, z: number, tile: PavedTile, gate?: boolean) => number,
): TileStand {
  const { x, z, foot } = middleOf(tile);
  const key = tileKey(tile.tileX, tile.tileZ);
  const span = spans.get(key);
  // Never a beach gate: the deck stands a metre above the sand.
  if (span?.kind === 'deck') {
    return { kind: 'centre', node: standAt(x, tile.y + BRIDGE_VOXELS, z, tile) };
  }
  if (span) return slopeOn(tile, span.climb, BRIDGE_SLOPE, standAt);
  const climb = climbs.get(key);
  if (!climb) return { kind: 'centre', node: standAt(x, foot, z, tile, gate) };
  // The foot of a ramp can be the last tile before the sand, as the slab it replaced was. A head's
  // low end is half a level up, and shared with its foot: a gate there walks people into the ramp.
  const slope = SLOPES[climb.kind];
  return slopeOn(tile, climb, { ...slope, gate: gate && !slope.raised }, standAt);
}

function middleOf(tile: PavedTile): {
  readonly x: number;
  readonly z: number;
  readonly foot: number;
} {
  return {
    x: (tile.tileX + 0.5) * TILE_VOXELS,
    z: (tile.tileZ + 0.5) * TILE_VOXELS,
    foot: walkingSurface(tile.y),
  };
}

interface Slope {
  readonly low: number;
  readonly high: number;
  readonly stepped: boolean;
  readonly raised: boolean;
  readonly gate: boolean;
}

const BRIDGE_SLOPE: Slope = {
  low: 0,
  high: BRIDGE_VOXELS - PAVING_VOXELS,
  stepped: false,
  raised: false,
  gate: false,
};

function slopeOn(
  tile: PavedTile,
  climb: { readonly dx: number; readonly dz: number },
  slope: Slope,
  standAt: (x: number, y: number, z: number, tile: PavedTile, gate?: boolean) => number,
): TileStand {
  const { x, z, foot } = middleOf(tile);
  const { dx, dz } = climb;
  return {
    kind: 'flight',
    climb,
    low: standAt(x - dx * HALF_TILE, foot + slope.low, z - dz * HALF_TILE, tile, slope.gate),
    high: standAt(x + dx * HALF_TILE, foot + slope.high, z + dz * HALF_TILE, tile),
    stepped: slope.stepped,
    raised: slope.raised,
  };
}

function facing(stand: TileStand, dx: number, dz: number): number {
  if (stand.kind === 'centre') return stand.node;
  return stand.climb.dx === dx && stand.climb.dz === dz ? stand.high : stand.low;
}

function steppable(
  tile: PavedTile,
  other: PavedTile,
  step: {
    readonly here: TileStand;
    readonly there: TileStand;
    readonly dx: number;
    readonly dz: number;
  },
  climbs: ReadonlyMap<string, Climb>,
): boolean {
  const { here, there, dx, dz } = step;
  if (!walkable(tile, { dx, dz }, other.y - tile.y, climbs)) return false;
  return !enteredSideways(here, dx, dz) && !enteredSideways(there, -dx, -dz);
}

function enteredSideways(stand: TileStand, dx: number, dz: number): boolean {
  if (stand.kind !== 'flight' || !stand.raised) return false;
  return stand.climb.dx === 0 ? dx !== 0 : dz !== 0;
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

const CLIMB_IDS: ReadonlyMap<string, ClimbKind> = new Map([
  [STAIRS_ID, 'stairs'],
  [STAIRCASE_ID, 'stairs'],
  [RAMP_FOOT_ID, 'ramp-foot'],
  [RAMP_HEAD_ID, 'ramp-head'],
]);

const towards = (rotation: Rotation) => CLIMBS.find((climb) => climb.rotation === rotation)!;

// Read off the pieces laid, so the graph climbs exactly where the paving does. Paving without ids
// asks stairs.ts: where a path turns on a step, the corner tile has higher paving on two sides but
// can only climb one; the other pair looks walkable and is a wall.
function climbsAmong(
  paved: readonly PavedTile[],
  levelOf: LevelProvider,
): ReadonlyMap<string, Climb> {
  const climbs = new Map<string, Climb>();
  if (paved.some((tile) => tile.id !== undefined)) {
    for (const tile of paved) {
      const kind = tile.id === undefined ? undefined : CLIMB_IDS.get(tile.id);
      if (kind === undefined) continue;
      const { dx, dz } = towards(tile.rotation ?? 0);
      climbs.set(tileKey(tile.tileX, tile.tileZ), { dx, dz, kind });
    }
    return climbs;
  }
  const asTiles: Tile[] = paved.map((tile) => ({ x: tile.tileX, z: tile.tileZ }));
  for (const stair of stairTilesFor(asTiles, levelOf)) {
    const { dx, dz } = towards(stair.rotation);
    climbs.set(tileKey(stair.tile.x, stair.tile.z), { dx, dz, kind: 'stairs' });
  }
  return climbs;
}

// A ramp's foot never meets a tile a level off: its head does that.
function risingAt(climbs: ReadonlyMap<string, Climb>, x: number, z: number): Climb | undefined {
  const climb = climbs.get(tileKey(x, z));
  return climb?.kind === 'ramp-foot' ? undefined : climb;
}

// A drop is answered by the edge in the other direction: every adjacency is visited from both ends.
function walkable(
  tile: PavedTile,
  step: { readonly dx: number; readonly dz: number },
  rise: number,
  climbs: ReadonlyMap<string, Climb>,
): boolean {
  if (rise === 0) return true;
  if (Math.abs(rise) !== LEVEL_VOXELS) return false;

  // The flight is always on the lower tile, and it has to face the higher one:
  // this step for a climb, and the way we came for a drop.
  const climbing = rise > 0;
  const lowerX = climbing ? tile.tileX : tile.tileX + step.dx;
  const lowerZ = climbing ? tile.tileZ : tile.tileZ + step.dz;
  const climb = risingAt(climbs, lowerX, lowerZ);
  if (!climb) return false;
  const towardsX = climbing ? step.dx : -step.dx;
  const towardsZ = climbing ? step.dz : -step.dz;
  return climb.dx === towardsX && climb.dz === towardsZ;
}

// Paving up on a dune overlooks the beach but is a level above it: a gate there walks people
// off the edge.
function adjoinsOpenSand(
  tile: PavedTile,
  sandAt: SandProvider,
  levelOf: LevelProvider,
  paved: ReadonlyMap<string, number>,
): boolean {
  if (levelOf(tile.tileX, tile.tileZ) !== 0) return false;
  return NEIGHBOURS.some(([dx, dz]) => {
    const x = tile.tileX + dx;
    const z = tile.tileZ + dz;
    return !paved.has(tileKey(x, z)) && sandAt(x, z);
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
  const { from, to } = beach.span;
  const last = to - 1;
  if (fromX === undefined) return Math.min(last, from + Math.floor(random() * (to - from)));
  const here = Math.floor(fromX / TILE_VOXELS);
  const drift = Math.round((random() * 2 - 1) * ROAM_COLUMNS);
  return Math.min(last, Math.max(from, here + drift));
}
