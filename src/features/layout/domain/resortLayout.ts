import {
  TILE_VOXELS,
  type ModelCategory,
  type ModelDoor,
  type PlacementGround,
} from '../../../../voxel-gen/voxelgen.ts';
import {
  BENCH_ID,
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
  DERIVED_IDS,
  HEDGE_ID,
  JETTY_ID,
  LAMP_ID,
  PATH_ID,
  PIER_RAILING_ID,
  RAILING_ID,
  STAIR_RAILING_ID,
  STAIRS_ID,
  type Bend,
  type PathEdge,
  type PathNode,
  type Plaza,
  type ResortPlan,
  type ResortPlot,
} from './resortPlan';
import type { Ground } from './ground';
import type { Terrain } from './terrain';
import { terrainFor } from './terrain';
import { levelHeight, straddledTile, type LevelProvider } from './elevation';
import { stairTilesFor } from './stairs';
import { railTilesFor, type RailKind, type RailTile } from './railings';
import { spanTilesFor, type SpanProvider } from './spans';
import { doorStepTile, placedDoors } from './doorStep';
import { rotateExtent, ROTATIONS, type Extent, type Rotation } from './rotation';

const LAMP_SPACING = 5;

// Nine against the lamps' five: at the lamps' spacing the promenade came out as a run of benches.
const BENCH_SPACING = 9;

const PARK_BENCH_SPACING = 4;

export interface LayoutItem {
  readonly id: string;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly width: number;
  readonly depth: number;
  readonly category?: ModelCategory;
  readonly ground?: PlacementGround;
  readonly doors?: readonly ModelDoor[];
}

export interface Placement {
  readonly key: string;
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  // Every other field is already turned; this is only for drawing the object and its lamps.
  readonly rotation: Rotation;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
}

export interface Tile {
  readonly x: number;
  readonly z: number;
}

export interface ResortLayout {
  readonly placements: readonly Placement[];
  readonly props: readonly Placement[];
  readonly paths: readonly Placement[];
  // A list of their own: a rail claims no ground, so the occupancy index, shadows and sky bake leave
  // them out.
  readonly rails: readonly Placement[];
  readonly tilesX: number;
  readonly tilesZ: number;
}

export const tileKey = (x: number, z: number): string => `${x},${z}`;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function place(
  item: LayoutItem,
  key: string,
  tileX: number,
  tileZ: number,
  rotation: Rotation = 0,
  level = 0,
): Placement {
  const tiles = rotateExtent(item.tilesX, item.tilesZ, rotation);
  const model = rotateExtent(item.width, item.depth, rotation);
  return {
    key,
    id: item.id,
    tileX,
    tileZ,
    tilesX: tiles.x,
    tilesZ: tiles.z,
    rotation,
    x: tileX * TILE_VOXELS + Math.floor((tiles.x * TILE_VOXELS - model.x) / 2),
    z: tileZ * TILE_VOXELS + Math.floor((tiles.z * TILE_VOXELS - model.z) / 2),
    y: levelHeight(level),
    width: model.x,
    depth: model.z,
  };
}

function placeOnEdge(
  item: LayoutItem,
  key: string,
  tileX: number,
  tileZ: number,
  rotation: Rotation,
  level = 0,
): Placement {
  const flat = place(item, key, tileX, tileZ, rotation, level);
  const along = Math.floor((TILE_VOXELS - item.width) / 2);
  const across = TILE_VOXELS - item.depth;
  const offset = {
    0: { x: along, z: 0 },
    1: { x: 0, z: along },
    2: { x: along, z: across },
    3: { x: across, z: along },
  }[rotation];
  return {
    ...flat,
    x: tileX * TILE_VOXELS + offset.x,
    z: tileZ * TILE_VOXELS + offset.z,
  };
}

// Only the ground claim turns: a model too big for its footprint is too big whichever way round.
function footprintOf(item: LayoutItem, plot: ResortPlot): Extent {
  return rotateExtent(item.tilesX, item.tilesZ, plot.rotation ?? 0);
}

// Keyed by tile rather than numbered in layout order, so an edit renames only what it changed.
export function derivedKey(id: string, tileX: number, tileZ: number): string {
  return `${id}@${tileX},${tileZ}`;
}

export function plotKeys(plots: readonly ResortPlot[]): string[] {
  const seen = new Map<string, number>();
  return plots.map((plot) => {
    const count = (seen.get(plot.id) ?? 0) + 1;
    seen.set(plot.id, count);
    return count === 1 ? plot.id : `${plot.id}#${count}`;
  });
}

export function occupiedTiles(
  items: readonly LayoutItem[],
  plan: ResortPlan,
): ReadonlyMap<string, string> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const keys = plotKeys(plan.plots);
  const occupied = new Map<string, string>();
  // Built once: anchoring an elevation spec validates it against every column of the plot.
  const terrain = terrainFor(plan);
  plan.plots.forEach((plot, index) => {
    const key = keys[index]!;
    const tiles = claimableTiles(byId, plot, key, plan, terrain);
    for (let x = plot.tileX; x < plot.tileX + tiles.x; x++) {
      for (let z = plot.tileZ; z < plot.tileZ + tiles.z; z++) {
        const cell = tileKey(x, z);
        const already = occupied.get(cell);
        if (already) throw new Error(`"${key}" overlaps "${already}" at tile ${x},${z}`);
        occupied.set(cell, key);
      }
    }
  });
  return occupied;
}

function claimableTiles(
  byId: ReadonlyMap<string, LayoutItem>,
  plot: ResortPlot,
  key: string,
  plan: ResortPlan,
  terrain: Terrain,
): Extent {
  const item = byId.get(plot.id);
  if (!item) throw new Error(`The plot places unknown object "${plot.id}"`);
  if (item.width > item.tilesX * TILE_VOXELS || item.depth > item.tilesZ * TILE_VOXELS) {
    throw new Error(`"${item.id}" is larger than the ${item.tilesX}x${item.tilesZ} it claims`);
  }
  const tiles = footprintOf(item, plot);
  if (
    plot.tileX < 0 ||
    plot.tileZ < 0 ||
    plot.tileX + tiles.x > plan.tilesX ||
    plot.tileZ + tiles.z > plan.tilesZ
  ) {
    throw new Error(`"${key}" does not fit inside the ${plan.tilesX}x${plan.tilesZ} plot`);
  }
  requireDryGround(terrain, plot, tiles, key);
  requireOneLevel(terrain, plot, tiles, key);
  return tiles;
}

function requireOneLevel(terrain: Terrain, plot: ResortPlot, tiles: Extent, key: string): void {
  const straddled = straddledTile((x, z) => terrain.levelOf(x, z), {
    tileX: plot.tileX,
    tileZ: plot.tileZ,
    tilesX: tiles.x,
    tilesZ: tiles.z,
  });
  if (straddled) {
    throw new Error(`"${key}" straddles a step at tile ${straddled.x},${straddled.z}`);
  }
}

function requireDryGround(terrain: Terrain, plot: ResortPlot, tiles: Extent, key: string): void {
  for (let x = plot.tileX; x < plot.tileX + tiles.x; x++) {
    for (let z = plot.tileZ; z < plot.tileZ + tiles.z; z++) {
      if (terrain.surfaceOf(x, z) === 'water') {
        throw new Error(`"${key}" stands in the water at tile ${x},${z}`);
      }
    }
  }
}

export function widthOffsets(width: number): number[] {
  if (width < 1) throw new Error(`A street cannot be ${width} tiles wide`);
  const low = -Math.floor(width / 2);
  return Array.from({ length: width }, (_, index) => low + index);
}

export function routeEdgeTiles(
  a: PathNode,
  b: PathNode,
  width = 1,
  bend: Bend = 'x-first',
): Tile[] {
  const offsets = widthOffsets(width);
  const tiles = new Map<string, Tile>();
  const add = (x: number, z: number): void => {
    tiles.set(tileKey(x, z), { x, z });
  };
  const alongX = (z: number, from: number, to: number): void => {
    for (let x = Math.min(from, to); x <= Math.max(from, to); x++) {
      for (const offset of offsets) add(x, z + offset);
    }
  };
  const alongZ = (x: number, from: number, to: number): void => {
    for (let z = Math.min(from, to); z <= Math.max(from, to); z++) {
      for (const offset of offsets) add(x + offset, z);
    }
  };

  const corner = bend === 'x-first' ? { x: b.tileX, z: a.tileZ } : { x: a.tileX, z: b.tileZ };
  if (bend === 'x-first') {
    alongX(a.tileZ, a.tileX, b.tileX);
    alongZ(b.tileX, a.tileZ, b.tileZ);
  } else {
    alongZ(a.tileX, a.tileZ, b.tileZ);
    alongX(b.tileZ, a.tileX, b.tileX);
  }
  for (const dx of offsets) for (const dz of offsets) add(corner.x + dx, corner.z + dz);

  return [...tiles.values()];
}

export function streetTiles(plan: ResortPlan): Tile[] {
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const terrain = terrainFor(plan);
  const tiles = new Map<string, Tile>();
  const add = (tile: Tile, overWater = false): void => {
    requireInsidePlot(plan, tile);
    // The sea stops a street, a river does not: a channel is something a road goes over as a bridge.
    if (!overWater && terrain.isSea(tile.x, tile.z)) return;
    tiles.set(tileKey(tile.x, tile.z), tile);
  };

  for (const edge of plan.edges) {
    const [from, to] = endsOf(nodes, edge);
    for (const tile of routeEdgeTiles(from, to, edge.width ?? 1, edge.bend ?? 'x-first')) {
      add(tile, edge.overWater ?? false);
    }
  }
  for (const plaza of plan.plazas) {
    for (let x = plaza.x0; x <= plaza.x1; x++) {
      for (let z = plaza.z0; z <= plaza.z1; z++) add({ x, z });
    }
  }
  return [...tiles.values()];
}

function requireInsidePlot(plan: ResortPlan, tile: Tile): void {
  if (tile.x < 0 || tile.z < 0 || tile.x >= plan.tilesX || tile.z >= plan.tilesZ) {
    throw new Error(`A street leaves the plot at tile ${tile.x},${tile.z}`);
  }
}

function endsOf(
  nodes: ReadonlyMap<string, PathNode>,
  edge: PathEdge,
): readonly [PathNode, PathNode] {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from) throw new Error(`Street edge references unknown node "${edge.from}"`);
  if (!to) throw new Error(`Street edge references unknown node "${edge.to}"`);
  return [from, to];
}

function borderTiles(plot: ResortPlot, item: LayoutItem, plan: ResortPlan): Tile[] {
  const footprint = footprintOf(item, plot);
  const x1 = plot.tileX + footprint.x - 1;
  const z1 = plot.tileZ + footprint.z - 1;
  const tiles: Tile[] = [];
  for (let x = plot.tileX; x <= x1; x++) {
    tiles.push({ x, z: plot.tileZ - 1 }, { x, z: z1 + 1 });
  }
  for (let z = plot.tileZ; z <= z1; z++) {
    tiles.push({ x: plot.tileX - 1, z }, { x: x1 + 1, z });
  }
  return tiles.filter(
    (tile) => tile.x >= 0 && tile.z >= 0 && tile.x < plan.tilesX && tile.z < plan.tilesZ,
  );
}

// Decided plot by plot: a later building may attach to an earlier one's spur, so its facing changes
// what the later one can reach. Dressing and anything on sand grow no spur: nobody walks to a palm,
// and sand is walked on.
function growSpurs(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  occupied: ReadonlyMap<string, string>,
  paved: Map<string, Tile>,
): Rotation[] {
  const { byId, keys, terrain } = spurContext(items, plan);
  // Sand is not routed through either, or the search lays a boardwalk across the beach.
  const isFree = (x: number, z: number): boolean =>
    x >= 0 &&
    z >= 0 &&
    x < plan.tilesX &&
    z < plan.tilesZ &&
    terrain.surfaceOf(x, z) === 'grass' &&
    !occupied.has(tileKey(x, z)) &&
    !paved.has(tileKey(x, z));
  const touchesPath = (x: number, z: number): boolean =>
    NEIGHBOURS.some(([dx, dz]) => paved.has(tileKey(x + dx, z + dz)));

  const pave = (route: readonly Tile[]): void => {
    for (const tile of route) paved.set(tileKey(tile.x, tile.z), tile);
  };
  const isPaved = (tile: Tile): boolean => paved.has(tileKey(tile.x, tile.z));
  const turns = plan.plots.map((plot): Rotation => plot.rotation ?? 0);

  plan.plots.forEach((plot, index) => {
    const item = byId.get(plot.id)!;
    if (!needsPaving(item, plot, terrain)) return;
    const toDoor = doorSpur(item, plot, { isPaved, isFree, touchesPath });
    if (toDoor) {
      turns[index] = toDoor.rotation;
      pave(toDoor.route);
      return;
    }
    const border = borderTiles(plot, item, plan);
    if (border.some(isPaved)) return;

    const route = spurRoute(border, isFree, touchesPath);
    if (!route) throw new Error(`"${keys[index]}" cannot be reached from the path network`);
    pave(route);
  });
  return turns;
}

interface SpurGround {
  readonly isPaved: (tile: Tile) => boolean;
  readonly isFree: (x: number, z: number) => boolean;
  readonly touchesPath: (x: number, z: number) => boolean;
}

// Only turns claiming the plan's own tiles, so the occupancy and fit checks already passed still
// stand. Ties keep the plan's turn.
function doorSpur(
  item: LayoutItem,
  plot: ResortPlot,
  ground: SpurGround,
): { readonly rotation: Rotation; readonly route: readonly Tile[] } | null {
  const doors = item.doors ?? [];
  if (doors.length === 0) return null;
  let best: { rotation: Rotation; route: readonly Tile[] } | null = null;
  for (const rotation of sameFootprintTurns(item, plot.rotation ?? 0)) {
    const standing = place(item, '', plot.tileX, plot.tileZ, rotation);
    const steps = placedDoors(standing, doors, item.width, item.depth).map((door) =>
      doorStepTile(standing, door),
    );
    if (steps.some(ground.isPaved)) return { rotation, route: [] };
    const route = spurRoute(steps, ground.isFree, ground.touchesPath);
    if (route && route.length < (best?.route.length ?? Number.POSITIVE_INFINITY)) {
      best = { rotation, route };
    }
  }
  return best;
}

function sameFootprintTurns(item: LayoutItem, planned: Rotation): Rotation[] {
  const claimed = rotateExtent(item.tilesX, item.tilesZ, planned);
  return [planned, ...ROTATIONS.filter((each) => each !== planned)].filter((rotation) => {
    const footprint = rotateExtent(item.tilesX, item.tilesZ, rotation);
    return footprint.x === claimed.x && footprint.z === claimed.z;
  });
}

function spurContext(items: readonly LayoutItem[], plan: ResortPlan) {
  return {
    byId: new Map(items.map((item) => [item.id, item])),
    keys: plotKeys(plan.plots),
    terrain: terrainFor(plan),
  };
}

// The one place both exemptions live, so a spur is never grown to something the audit calls
// unreachable.
function needsPaving(item: LayoutItem, plot: ResortPlot, terrain: Terrain): boolean {
  return item.category !== 'grounds' && terrain.surfaceOf(plot.tileX, plot.tileZ) !== 'sand';
}

// Breadth-first from every free border tile at once, so the route is the shortest out of any side.
function spurRoute(
  border: readonly Tile[],
  isFree: (x: number, z: number) => boolean,
  touchesPath: (x: number, z: number) => boolean,
): Tile[] | null {
  const parents = new Map<string, Tile | null>();
  const queue: Tile[] = [];
  for (const tile of border) {
    if (!isFree(tile.x, tile.z)) continue;
    const key = tileKey(tile.x, tile.z);
    if (parents.has(key)) continue;
    parents.set(key, null);
    queue.push(tile);
  }

  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head]!;
    if (touchesPath(tile.x, tile.z)) return walkBack(tile, parents);
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = tile.x + dx;
      const nz = tile.z + dz;
      const key = tileKey(nx, nz);
      if (parents.has(key) || !isFree(nx, nz)) continue;
      parents.set(key, tile);
      queue.push({ x: nx, z: nz });
    }
  }
  return null;
}

function walkBack(from: Tile, parents: ReadonlyMap<string, Tile | null>): Tile[] {
  const route: Tile[] = [];
  for (let step: Tile | null = from; step; step = parents.get(tileKey(step.x, step.z)) ?? null) {
    route.push(step);
  }
  return route;
}

export function pathTilesFor(items: readonly LayoutItem[], plan: ResortPlan): Tile[] {
  return pavingOf(items, plan).tiles;
}

function pavingOf(
  items: readonly LayoutItem[],
  plan: ResortPlan,
): { readonly tiles: Tile[]; readonly turns: readonly Rotation[] } {
  const occupied = occupiedTiles(items, plan);
  const paved = new Map<string, Tile>();
  for (const tile of streetTiles(plan)) {
    const key = tileKey(tile.x, tile.z);
    if (!occupied.has(key)) paved.set(key, tile);
  }
  const turns = growSpurs(items, plan, occupied, paved);
  return { tiles: [...paved.values()].toSorted((a, b) => a.z - b.z || a.x - b.x), turns };
}

export function isPathNetworkConnected(tiles: readonly Tile[]): boolean {
  if (tiles.length === 0) return true;
  const remaining = new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));
  const first = tiles[0]!;
  const queue: Tile[] = [first];
  remaining.delete(tileKey(first.x, first.z));
  while (queue.length > 0) {
    const { x, z } = queue.pop()!;
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x + dx;
      const nz = z + dz;
      if (remaining.delete(tileKey(nx, nz))) queue.push({ x: nx, z: nz });
    }
  }
  return remaining.size === 0;
}

export function plotsWithoutPathAccess(items: readonly LayoutItem[], plan: ResortPlan): string[] {
  const { byId, keys, terrain } = spurContext(items, plan);
  const paved = new Set(pathTilesFor(items, plan).map((tile) => tileKey(tile.x, tile.z)));
  return plan.plots
    .map((plot, index) => ({ plot, key: keys[index]! }))
    .filter(({ plot }) => {
      const item = byId.get(plot.id);
      if (!item) return true;
      if (!needsPaving(item, plot, terrain)) return false;
      return !borderTiles(plot, item, plan).some((tile) => paved.has(tileKey(tile.x, tile.z)));
    })
    .map(({ key }) => key);
}

export interface TurnedTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
}

export interface Decorations {
  readonly lamps: readonly Tile[];
  readonly benches: readonly TurnedTile[];
  readonly hedges: readonly Tile[];
  readonly trees: readonly Tile[];
}

const AVENUE_PITCH = 3;

// A tile beside two avenues is a corner, where a tree would stand in a junction's sight line.
function avenueTrees(
  ring: readonly Tile[],
  streets: readonly Plaza[],
  taken: ReadonlySet<string>,
): Tile[] {
  return ring.filter((tile) => {
    if (taken.has(tileKey(tile.x, tile.z))) return false;
    const side = avenueSide(tile, streets);
    if (side === 'north-south') return tile.x % AVENUE_PITCH === 0;
    return side === 'east-west' && tile.z % AVENUE_PITCH === 0;
  });
}

function avenueSide(
  tile: Tile,
  streets: readonly Plaza[],
): 'north-south' | 'east-west' | 'corner' | null {
  const on = (x: number, z: number) =>
    streets.some((rect) => x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1);
  const across = on(tile.x, tile.z - 1) || on(tile.x, tile.z + 1);
  const along = on(tile.x - 1, tile.z) || on(tile.x + 1, tile.z);
  if (across && along) return 'corner';
  if (across) return 'north-south';
  return along ? 'east-west' : null;
}

// A turn of 1 swings +z round to +x, so the sequence runs +z, +x, -z, -x: the order seat facings use.
function facingRotation(dx: number, dz: number): Rotation {
  if (dz > 0) return 0;
  if (dx > 0) return 1;
  if (dz < 0) return 2;
  return 3;
}

function edgeRing(parts: {
  readonly plan: ResortPlan;
  readonly terrain: Terrain;
  readonly occupied: ReadonlyMap<string, string>;
  readonly paved: ReadonlySet<string>;
  readonly pathNeighbours: (x: number, z: number) => number;
}): Tile[] {
  const { plan, terrain, occupied, paved, pathNeighbours } = parts;
  const ring: Tile[] = [];
  for (let z = 0; z < plan.tilesZ; z++) {
    for (let x = 0; x < plan.tilesX; x++) {
      const key = tileKey(x, z);
      if (occupied.has(key) || paved.has(key)) continue;
      if (terrain.surfaceOf(x, z) !== 'grass') continue;
      if (pathNeighbours(x, z) > 0) ring.push({ x, z });
    }
  }
  return ring;
}

// Benches are taken before hedges: both want the same tiles, and taken last there were no benches
// left on the promenade.
export function decorationsFor(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  spacing = LAMP_SPACING,
): Decorations {
  const occupied = occupiedTiles(items, plan);
  const terrain = terrainFor(plan);
  const paved = new Set(pathTilesFor(items, plan).map((tile) => tileKey(tile.x, tile.z)));

  const pathNeighbours = (x: number, z: number): number =>
    NEIGHBOURS.filter(([dx, dz]) => paved.has(tileKey(x + dx, z + dz))).length;

  const ring = edgeRing({ plan, terrain, occupied, paved, pathNeighbours });

  const taken = new Set<string>();
  const lamps = spacedLamps(ring, spacing, taken);
  const parks = plan.parks ?? [];
  const inPark = (tile: Tile): boolean =>
    parks.some(
      (park) => tile.x >= park.x0 && tile.x <= park.x1 && tile.z >= park.z0 && tile.z <= park.z1,
    );
  const benches = spacedBenches({ ring, paved, taken, inPark });
  const trees = plan.avenues ? avenueTrees(ring, plan.avenues.streets, taken) : [];
  for (const tree of trees) taken.add(tileKey(tree.x, tree.z));
  const streets = plan.avenues?.streets ?? [];
  const hedges = hedgeRuns({
    ring,
    taken,
    occupied,
    skip: (tile) => inPark(tile) || (streets.length > 0 && avenueSide(tile, streets) !== null),
    pathNeighbours,
  });
  return { lamps, benches, hedges, trees };
}

function spacedLamps(ring: readonly Tile[], spacing: number, taken: Set<string>): Tile[] {
  const lamps: Tile[] = [];
  for (const tile of ring) {
    const clear = lamps.every(
      (lamp) => Math.max(Math.abs(lamp.x - tile.x), Math.abs(lamp.z - tile.z)) >= spacing,
    );
    if (!clear) continue;
    lamps.push(tile);
    taken.add(tileKey(tile.x, tile.z));
  }
  return lamps;
}

// Exactly one: a tile with paving on two sides is a corner, where a seat would turn its back to a path.
function soleNeighbour(
  paved: ReadonlySet<string>,
  x: number,
  z: number,
): readonly [number, number] | null {
  let found: readonly [number, number] | null = null;
  for (const [dx, dz] of NEIGHBOURS) {
    if (!paved.has(tileKey(x + dx, z + dz))) continue;
    if (found) return null;
    found = [dx, dz];
  }
  return found;
}

function spacedBenches(parts: {
  readonly ring: readonly Tile[];
  readonly paved: ReadonlySet<string>;
  readonly taken: Set<string>;
  readonly inPark: (tile: Tile) => boolean;
}): TurnedTile[] {
  const { ring, paved, taken, inPark } = parts;
  const benches: TurnedTile[] = [];
  for (const tile of ring) {
    if (taken.has(tileKey(tile.x, tile.z))) continue;
    const facing = soleNeighbour(paved, tile.x, tile.z);
    if (!facing) continue;
    const apart = inPark(tile) ? PARK_BENCH_SPACING : BENCH_SPACING;
    const clear = benches.every(
      (bench) =>
        Math.max(Math.abs(bench.tile.x - tile.x), Math.abs(bench.tile.z - tile.z)) >= apart,
    );
    if (!clear) continue;
    benches.push({ tile, rotation: facingRotation(facing[0], facing[1]) });
    taken.add(tileKey(tile.x, tile.z));
  }
  return benches;
}

function hedgeRuns(parts: {
  readonly ring: readonly Tile[];
  readonly taken: ReadonlySet<string>;
  readonly occupied: ReadonlyMap<string, string>;
  readonly skip: (tile: Tile) => boolean;
  readonly pathNeighbours: (x: number, z: number) => number;
}): Tile[] {
  const { ring, taken, occupied, skip, pathNeighbours } = parts;
  const nextToBuilding = (x: number, z: number): boolean =>
    [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => occupied.has(tileKey(x + dx, z + dz))));
  const candidates = ring.filter(
    (tile) =>
      !taken.has(tileKey(tile.x, tile.z)) &&
      !skip(tile) &&
      pathNeighbours(tile.x, tile.z) === 1 &&
      !nextToBuilding(tile.x, tile.z),
  );
  const candidateKeys = new Set(candidates.map((tile) => tileKey(tile.x, tile.z)));
  return candidates.filter((tile) =>
    NEIGHBOURS.some(([dx, dz]) => candidateKeys.has(tileKey(tile.x + dx, tile.z + dz))),
  );
}

function requireEveryTypePlanted(items: readonly LayoutItem[], plan: ResortPlan): void {
  if (plan.standsWholeCatalogue === false) return;
  const planted = new Set(plan.plots.map((plot) => plot.id));
  for (const item of items) {
    if (!DERIVED_IDS.has(item.id) && !planted.has(item.id)) {
      throw new Error(`"${item.id}" has no plot on the resort plan`);
    }
  }
}

export type RailModels = { readonly [kind in RailKind]: LayoutItem | undefined };

export function railModelsIn(items: readonly LayoutItem[]): RailModels {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    flight: byId.get(STAIR_RAILING_ID),
    edge: byId.get(RAILING_ID),
    // A catalogue with no lit pier rail rails its piers the way it rails a terrace.
    pier: byId.get(PIER_RAILING_ID) ?? byId.get(RAILING_ID),
    span: byId.get(BRIDGE_RAILING_ID),
    'ramp-left': byId.get(BRIDGE_RAMP_RAILING_LEFT_ID),
    'ramp-right': byId.get(BRIDGE_RAMP_RAILING_RIGHT_ID),
  };
}

// Shared with the pointer, so a rail drawn by hand does not land a voxel off the one beside it.
export function railPlacementsFor(
  models: RailModels,
  rails: readonly RailTile[],
  levelOf: LevelProvider,
): Placement[] {
  const placements: Placement[] = [];
  for (const rail of rails) {
    const item = models[rail.kind];
    if (!item) continue;
    const { x, z } = rail.tile;
    const level = levelOf(x, z);
    placements.push(
      rail.kind === 'flight'
        ? place(item, railKey(item, rail), x, z, rail.rotation, level)
        : placeOnEdge(item, railKey(item, rail), x, z, rail.rotation, level),
    );
  }
  return placements;
}

// The edge too: a terrace corner is one tile with two rails, and the pointer diffs rails by key alone.
function railKey(item: LayoutItem, rail: RailTile): string {
  return `${derivedKey(item.id, rail.tile.x, rail.tile.z)}:${rail.rotation}`;
}

export function layoutResort(items: readonly LayoutItem[], plan: ResortPlan): ResortLayout {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path = byId.get(PATH_ID);
  if (!path) throw new Error(`The catalogue has no "${PATH_ID}" object to pave with`);
  if (path.tilesX !== 1 || path.tilesZ !== 1) throw new Error(`"${PATH_ID}" must be a 1x1 tile`);

  requireEveryTypePlanted(items, plan);

  const terrain = terrainFor(plan);
  const levelOf = (tileX: number, tileZ: number): number => terrain.levelOf(tileX, tileZ);

  const boardwalk = byId.get(BOARDWALK_ID) ?? path;
  const jetty = byId.get(JETTY_ID) ?? boardwalk;
  const bridge = byId.get(BRIDGE_ID) ?? jetty;
  const bridgeRamp = byId.get(BRIDGE_RAMP_ID) ?? bridge;
  // Without the bridge model a crossing falls back to a flat pier. Remembered per tile because four
  // passes ask what a tile is made of, and surfaceOf evaluates a meander every time.
  const spanning = byId.has(BRIDGE_ID);
  const surfaceAt = new Map<string, Ground>();
  const surfaceOf = (tileX: number, tileZ: number): Ground => {
    const key = tileKey(tileX, tileZ);
    let known = surfaceAt.get(key);
    if (known === undefined) {
      known = terrain.surfaceOf(tileX, tileZ);
      surfaceAt.set(key, known);
    }
    return known;
  };
  const raised: SpanProvider = (tileX, tileZ) =>
    spanning && surfaceOf(tileX, tileZ) === 'water' && !terrain.isSea(tileX, tileZ);
  const pavingFor = (tile: Tile): LayoutItem => {
    const ground = surfaceOf(tile.x, tile.z);
    if (ground === 'water') return terrain.isSea(tile.x, tile.z) ? jetty : bridge;
    return ground === 'sand' ? boardwalk : path;
  };

  const { tiles: paved, turns } = pavingOf(items, plan);
  const stairs = byId.get(STAIRS_ID);
  const flights = new Map(
    stairTilesFor(paved, levelOf).map((flight) => [
      tileKey(flight.tile.x, flight.tile.z),
      flight.rotation,
    ]),
  );
  const spans = new Map(
    spanTilesFor(paved, raised).map((span) => [tileKey(span.tile.x, span.tile.z), span]),
  );
  const paths = paved.map((tile) => {
    const span = spans.get(tileKey(tile.x, tile.z));
    const climb = span || !stairs ? undefined : flights.get(tileKey(tile.x, tile.z));
    const paving = span
      ? span.kind === 'ramp'
        ? bridgeRamp
        : bridge
      : climb === undefined
        ? pavingFor(tile)
        : stairs!;
    const key = derivedKey(paving.id, tile.x, tile.z);
    const rotation = span ? span.rotation : (climb ?? 0);
    return place(paving, key, tile.x, tile.z, rotation, levelOf(tile.x, tile.z));
  });
  const keys = plotKeys(plan.plots);
  const placements = plan.plots.map((plot, index) =>
    place(
      byId.get(plot.id)!,
      keys[index]!,
      plot.tileX,
      plot.tileZ,
      turns[index]!,
      levelOf(plot.tileX, plot.tileZ),
    ),
  );

  // Water counts as a drop: the sea beside a jetty stands at the jetty's own level, so the heights
  // alone would say there was nothing to fall into.
  const overWater = (tileX: number, tileZ: number): boolean => surfaceOf(tileX, tileZ) === 'water';
  const rails = railPlacementsFor(
    railModelsIn(items),
    railTilesFor(paved, levelOf, overWater, raised),
    levelOf,
  );

  const props = propsFor(items, plan, levelOf);
  return { placements, props, paths, rails, tilesX: plan.tilesX, tilesZ: plan.tilesZ };
}

function propsFor(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  levelOf: (tileX: number, tileZ: number) => number,
): Placement[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const { lamps, benches, hedges, trees } = decorationsFor(items, plan);
  const turned: { id: string; tile: Tile; rotation: Rotation }[] = [
    ...lamps.map((tile) => ({ id: LAMP_ID, tile, rotation: 0 as Rotation })),
    ...hedges.map((tile) => ({ id: HEDGE_ID, tile, rotation: 0 as Rotation })),
    ...trees.map((tile) => ({ id: plan.avenues?.tree ?? '', tile, rotation: 0 as Rotation })),
    ...benches.map(({ tile, rotation }) => ({ id: BENCH_ID, tile, rotation })),
  ];
  return turned.flatMap(({ id, tile, rotation }) => {
    const item = byId.get(id);
    if (!item) return [];
    return [
      place(
        item,
        derivedKey(id, tile.x, tile.z),
        tile.x,
        tile.z,
        rotation,
        levelOf(tile.x, tile.z),
      ),
    ];
  });
}

export function placementCenter(placement: Placement): { x: number; z: number } {
  return {
    x: placement.x + placement.width / 2,
    z: placement.z + placement.depth / 2,
  };
}
