/**
 * Pure placement for the resort plot.
 *
 * The resort is an authored plan rather than a uniform grid, and the paths are
 * *derived* from it in three stages:
 *
 * 1. **Streets** — the plan's node/edge graph is routed into L-shaped orthogonal
 *    runs, plus any plazas paved wholesale. A tile an object stands on is never
 *    paved, which is how the fountain sits in the middle of its plaza.
 * 2. **Spurs** — every object that no street already touches grows the shortest
 *    one-tile path to the network. That is what keeps the paving sparse: a
 *    cottage village needs one lane and eight short spurs, not a paved block.
 * 3. **Dressing** — street lamps are scattered along the path edges at an even
 *    spacing, and hedges fill the straight runs between them.
 *
 * Because the plan may stand several cottages on the plot, a placement carries
 * both its object type (`id`) and a unique `key`. Authored plots are keyed by
 * type and ordinal (`cottage#3`); everything derived is keyed by the tile it
 * stands on (`path@12,7`), because those keys have to survive an edit — see
 * {@link derivedKey}.
 *
 * A plan may also give the plot a shore, in which case its southern end is sea.
 * Water is not ground: nothing stands on it, no street crosses it and no spur
 * routes through it — a street simply stops where the beach ends. The sand in
 * between is ordinary buildable ground with one difference, which is that a path
 * laid on it comes out as a boardwalk rather than as flagstones. See
 * `shoreline.ts`.
 *
 * Tile-to-voxel conversion happens here, so everything downstream works in
 * voxels: a model smaller than its declared footprint is centred in it.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  BOARDWALK_ID,
  HEDGE_ID,
  LAMP_ID,
  PATH_ID,
  type Bend,
  type PathNode,
  type ResortPlan,
  type ResortPlot,
} from './resortPlan';
import { isBeach, isWater, shoreFor, terrainAt, type Shore } from './shoreline';
import { elevationFor, levelAt, levelHeight, type Elevation } from './elevation';
import { rotateExtent, type Extent, type Rotation } from './rotation';

/** Tiles between one street lamp and the next, measured on the longer axis. */
const LAMP_SPACING = 5;

export interface LayoutItem {
  readonly id: string;
  /** Footprint the object claims on the tile grid. */
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Actual model size in voxels; may be smaller than the footprint. */
  readonly width: number;
  readonly depth: number;
}

export interface Placement {
  /** Unique per placement, e.g. `"cottage#3"` or `"path@12,7"`. */
  readonly key: string;
  /** Object type standing here; the plan may place one type many times. */
  readonly id: string;
  /** Tile the object's footprint starts on. */
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  /**
   * Quarter turns the object stands at.
   *
   * Every other measurement on a placement is already turned — the footprint
   * below and the extent below that are what the object claims *as it stands* —
   * so nothing that only asks where something is has to know about this. It is
   * here for the two things that draw the object rather than place it: the
   * instance matrix, and where the model's own lamps ended up.
   */
  readonly rotation: Rotation;
  /** World-space corner of the model itself, in voxels. */
  readonly x: number;
  readonly z: number;
  /**
   * Height the object stands at, in voxels: the surface of the terrace its
   * tiles are on. Zero on a flat plot, which is every plot with no elevation
   * spec on it.
   *
   * Unlike `x` and `z` this is not a corner that a smaller model is centred in —
   * a model sits *on* the ground, so its own `y = 0` plate lies on the terrace
   * exactly as it lies on the grass at sea level. It is here for the same reason
   * the turn is: everything that draws, lights or shades an object needs it, and
   * nothing that does should have to ask which level the object is on. See
   * `elevation.ts`.
   */
  readonly y: number;
  readonly width: number;
  readonly depth: number;
}

export interface Tile {
  readonly x: number;
  readonly z: number;
}

export interface ResortLayout {
  /** One placement per authored plot, in plan order. */
  readonly placements: readonly Placement[];
  /** Lamps and hedges the layout scattered itself; never labelled. */
  readonly props: readonly Placement[];
  /** One placement per paved tile, kept apart so the HUD does not label them. */
  readonly paths: readonly Placement[];
  readonly tilesX: number;
  readonly tilesZ: number;
}

/** Key for one tile of the plot; unique, and stable as long as the tile is. */
export const tileKey = (x: number, z: number): string => `${x},${z}`;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Places one item's footprint at a tile position and on a terrace, centring a
 * model that is smaller than the footprint it claims.
 *
 * The turn and the level are both taken here rather than downstream, so the
 * placement that comes out describes the object as it stands: a 2x3 cottage
 * given a quarter turn claims 3x2 tiles and is 44 voxels wide, and one on the
 * first terrace stands `LEVEL_VOXELS` up. Everything that reads a placement —
 * the occupancy index, the camera's bounds, the chunk it is culled in, the
 * footprint the preview paints, the shadow it throws — then needs no notion of
 * either.
 *
 * One level for the whole footprint, taken from the tile it is anchored on,
 * because an object may only stand where all its tiles are on the same terrace.
 */
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

/**
 * The tiles a plot claims, once the way it stands is taken into account.
 *
 * A model is checked against its *unturned* size wherever a check is about the
 * model rather than the ground — a 2x3 cottage is too big for a 1x1 footprint
 * whichever way round it is — so only this, the ground claim, turns.
 */
function footprintOf(item: LayoutItem, plot: ResortPlot): Extent {
  return rotateExtent(item.tilesX, item.tilesZ, plot.rotation ?? 0);
}

/**
 * Key for a placement the layout derived rather than the plan authored: its type
 * and the tile it stands on.
 *
 * Derived placements used to be numbered in the order they came out of the
 * layout — `path#1`, `path#2` — which made every key downstream of an edit a
 * different key: paving one more tile renumbered every tile after it, and a diff
 * against the live scene was the whole resort. A tile is unique and does not
 * move, so keying on it means an edit renames only what it actually changed.
 */
export function derivedKey(id: string, tileX: number, tileZ: number): string {
  return `${id}@${tileX},${tileZ}`;
}

/** Unique key per plot: the type id, suffixed once a type appears more than once. */
export function plotKeys(plots: readonly ResortPlot[]): string[] {
  const seen = new Map<string, number>();
  return plots.map((plot) => {
    const count = (seen.get(plot.id) ?? 0) + 1;
    seen.set(plot.id, count);
    return count === 1 ? plot.id : `${plot.id}#${count}`;
  });
}

/**
 * Every tile an object stands on, mapped to the key of the object standing
 * there. Throws if the plan overlaps two objects or pushes one off the plot.
 */
export function occupiedTiles(
  items: readonly LayoutItem[],
  plan: ResortPlan,
): ReadonlyMap<string, string> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const keys = plotKeys(plan.plots);
  const occupied = new Map<string, string>();
  plan.plots.forEach((plot, index) => {
    const key = keys[index]!;
    const tiles = claimableTiles(byId, plot, key, plan);
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

/**
 * The tiles one plot may claim, or the reason it may not stand at all.
 *
 * The model is checked against the footprint it declares, which no turn
 * changes — a 2x3 cottage is too big for a 1x1 whichever way round it is — and
 * the plot is checked against the footprint it actually covers, which a quarter
 * turn does change.
 */
function claimableTiles(
  byId: ReadonlyMap<string, LayoutItem>,
  plot: ResortPlot,
  key: string,
  plan: ResortPlan,
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
  requireDryGround(plan, plot, tiles, key);
  return tiles;
}

/** Throws if any tile a plot would claim is sea rather than ground. */
function requireDryGround(plan: ResortPlan, plot: ResortPlot, tiles: Extent, key: string): void {
  const shore = shoreFor(plan);
  if (!shore) return;
  for (let x = plot.tileX; x < plot.tileX + tiles.x; x++) {
    for (let z = plot.tileZ; z < plot.tileZ + tiles.z; z++) {
      if (isWater(shore, x, z)) throw new Error(`"${key}" stands in the sea at tile ${x},${z}`);
    }
  }
}

/** Offsets that grow a one-tile run to `width`, biased west/north. */
export function widthOffsets(width: number): number[] {
  if (width < 1) throw new Error(`A street cannot be ${width} tiles wide`);
  const low = -Math.floor(width / 2);
  return Array.from({ length: width }, (_, index) => low + index);
}

/**
 * Routes one street: an L from `a` to `b`, thickened perpendicular to each leg
 * with the corner squared off so a wide street turns without pinching.
 */
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
  // square the corner off so both legs meet at full width
  for (const dx of offsets) for (const dz of offsets) add(corner.x + dx, corner.z + dz);

  return [...tiles.values()];
}

/**
 * Every tile the plan's streets and plazas cover, before objects are subtracted.
 *
 * A street that runs into the sea is cut off at the water rather than refused.
 * Leaving the plot is still an error, because that is a plan that does not fit;
 * reaching the shore is not, because a street graph strung corner to corner over
 * a plot with a beach in one corner is the normal case, and the answer a
 * promenade wants there is to stop at the sand.
 */
export function streetTiles(plan: ResortPlan): Tile[] {
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const shore = shoreFor(plan);
  const tiles = new Map<string, Tile>();
  const add = (tile: Tile): void => {
    if (tile.x < 0 || tile.z < 0 || tile.x >= plan.tilesX || tile.z >= plan.tilesZ) {
      throw new Error(`A street leaves the plot at tile ${tile.x},${tile.z}`);
    }
    if (isWater(shore, tile.x, tile.z)) return;
    tiles.set(tileKey(tile.x, tile.z), tile);
  };

  for (const edge of plan.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from) throw new Error(`Street edge references unknown node "${edge.from}"`);
    if (!to) throw new Error(`Street edge references unknown node "${edge.to}"`);
    for (const tile of routeEdgeTiles(from, to, edge.width ?? 1, edge.bend ?? 'x-first')) {
      add(tile);
    }
  }
  for (const plaza of plan.plazas) {
    for (let x = plaza.x0; x <= plaza.x1; x++) {
      for (let z = plaza.z0; z <= plaza.z1; z++) add({ x, z });
    }
  }
  return [...tiles.values()];
}

/** The tiles orthogonally touching a footprint — where a spur can attach. */
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

/**
 * Grows the shortest one-tile spur from each object to the network, in plan
 * order, so a later object may attach to an earlier object's spur. Mutates
 * `paved`. Throws if an object is walled in with no way out.
 */
function growSpurs(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  occupied: ReadonlyMap<string, string>,
  paved: Map<string, Tile>,
): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  const keys = plotKeys(plan.plots);
  const shore = shoreFor(plan);
  const isFree = (x: number, z: number): boolean =>
    x >= 0 &&
    z >= 0 &&
    x < plan.tilesX &&
    z < plan.tilesZ &&
    !isWater(shore, x, z) &&
    !occupied.has(tileKey(x, z)) &&
    !paved.has(tileKey(x, z));
  const touchesPath = (x: number, z: number): boolean =>
    NEIGHBOURS.some(([dx, dz]) => paved.has(tileKey(x + dx, z + dz)));

  plan.plots.forEach((plot, index) => {
    const item = byId.get(plot.id)!;
    const border = borderTiles(plot, item, plan);
    if (border.some((tile) => paved.has(tileKey(tile.x, tile.z)))) return;

    // Breadth-first over free tiles: the first one touching the network wins.
    const parents = new Map<string, Tile | null>();
    const queue: Tile[] = [];
    for (const tile of border) {
      if (!isFree(tile.x, tile.z)) continue;
      const key = tileKey(tile.x, tile.z);
      if (parents.has(key)) continue;
      parents.set(key, null);
      queue.push(tile);
    }

    let found: Tile | null = null;
    for (let head = 0; head < queue.length && !found; head++) {
      const tile = queue[head]!;
      if (touchesPath(tile.x, tile.z)) {
        found = tile;
        break;
      }
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = tile.x + dx;
        const nz = tile.z + dz;
        const key = tileKey(nx, nz);
        if (parents.has(key) || !isFree(nx, nz)) continue;
        parents.set(key, tile);
        queue.push({ x: nx, z: nz });
      }
    }

    if (!found) throw new Error(`"${keys[index]}" cannot be reached from the path network`);
    for (let step: Tile | null = found; step; step = parents.get(tileKey(step.x, step.z)) ?? null) {
      paved.set(tileKey(step.x, step.z), step);
    }
  });
}

/** The streets and spurs minus whatever stands on them: the tiles that get paved. */
export function pathTilesFor(items: readonly LayoutItem[], plan: ResortPlan): Tile[] {
  const occupied = occupiedTiles(items, plan);
  const paved = new Map<string, Tile>();
  for (const tile of streetTiles(plan)) {
    const key = tileKey(tile.x, tile.z);
    if (!occupied.has(key)) paved.set(key, tile);
  }
  growSpurs(items, plan, occupied, paved);
  return [...paved.values()].toSorted((a, b) => a.z - b.z || a.x - b.x);
}

/** True when the paved tiles form a single piece under 4-way adjacency. */
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

/** Keys of objects with no paved tile touching their footprint — nobody can reach them. */
export function plotsWithoutPathAccess(items: readonly LayoutItem[], plan: ResortPlan): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const keys = plotKeys(plan.plots);
  const paved = new Set(pathTilesFor(items, plan).map((tile) => tileKey(tile.x, tile.z)));
  return plan.plots
    .map((plot, index) => ({ plot, key: keys[index]! }))
    .filter(({ plot }) => {
      const item = byId.get(plot.id);
      if (!item) return true;
      return !borderTiles(plot, item, plan).some((tile) => paved.has(tileKey(tile.x, tile.z)));
    })
    .map(({ key }) => key);
}

export interface Decorations {
  readonly lamps: readonly Tile[];
  readonly hedges: readonly Tile[];
}

/**
 * The free grass tiles that touch a path: everything the dressing is chosen
 * from, in row order.
 *
 * Grass only. A lamp post is a street fitting and a hedge is a garden one, so
 * neither belongs on a beach, and nothing at all stands in the sea.
 */
function edgeRing(parts: {
  readonly plan: ResortPlan;
  readonly shore: Shore | null;
  readonly occupied: ReadonlyMap<string, string>;
  readonly paved: ReadonlySet<string>;
  readonly pathNeighbours: (x: number, z: number) => number;
}): Tile[] {
  const { plan, shore, occupied, paved, pathNeighbours } = parts;
  const ring: Tile[] = [];
  for (let z = 0; z < plan.tilesZ; z++) {
    for (let x = 0; x < plan.tilesX; x++) {
      const key = tileKey(x, z);
      if (occupied.has(key) || paved.has(key)) continue;
      if (terrainAt(shore, x, z) !== 'land') continue;
      if (pathNeighbours(x, z) > 0) ring.push({ x, z });
    }
  }
  return ring;
}

/**
 * Dresses the path edges. Both lists come from the same ring of free tiles that
 * touch a path: lamps are taken first at an even spacing, then hedges fill the
 * straight runs left over, skipping anything pressed against a building so the
 * planting reads as a border rather than as undergrowth.
 */
export function decorationsFor(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  spacing = LAMP_SPACING,
): Decorations {
  const occupied = occupiedTiles(items, plan);
  const shore = shoreFor(plan);
  const paved = new Set(pathTilesFor(items, plan).map((tile) => tileKey(tile.x, tile.z)));

  const pathNeighbours = (x: number, z: number): number =>
    NEIGHBOURS.filter(([dx, dz]) => paved.has(tileKey(x + dx, z + dz))).length;

  const ring = edgeRing({ plan, shore, occupied, paved, pathNeighbours });

  const lamps: Tile[] = [];
  const taken = new Set<string>();
  for (const tile of ring) {
    const clear = lamps.every(
      (lamp) => Math.max(Math.abs(lamp.x - tile.x), Math.abs(lamp.z - tile.z)) >= spacing,
    );
    if (!clear) continue;
    lamps.push(tile);
    taken.add(tileKey(tile.x, tile.z));
  }

  // Hedge candidates: free of buildings on every side, and lying along a
  // straight stretch of path rather than at a junction.
  const nextToBuilding = (x: number, z: number): boolean => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (occupied.has(tileKey(x + dx, z + dz))) return true;
      }
    }
    return false;
  };
  const candidates = ring.filter(
    (tile) =>
      !taken.has(tileKey(tile.x, tile.z)) &&
      pathNeighbours(tile.x, tile.z) === 1 &&
      !nextToBuilding(tile.x, tile.z),
  );
  const candidateKeys = new Set(candidates.map((tile) => tileKey(tile.x, tile.z)));
  // Keep only tiles that continue a run, so no hedge stands on its own.
  const hedges = candidates.filter(
    (tile) =>
      candidateKeys.has(tileKey(tile.x - 1, tile.z)) ||
      candidateKeys.has(tileKey(tile.x + 1, tile.z)) ||
      candidateKeys.has(tileKey(tile.x, tile.z - 1)) ||
      candidateKeys.has(tileKey(tile.x, tile.z + 1)),
  );

  return { lamps, hedges };
}

/**
 * Checks that the plan stands every object the catalogue offers.
 *
 * A type in the catalogue that the plan forgot is a mistake worth hearing about
 * rather than an object quietly missing from the showcase — unless the plan says
 * it never meant to stand them all, which is what a generated plot too small for
 * the catalogue, and a bare plot, both say.
 */
function requireEveryTypePlanted(items: readonly LayoutItem[], plan: ResortPlan): void {
  if (plan.standsWholeCatalogue === false) return;
  const derived = new Set([PATH_ID, BOARDWALK_ID, LAMP_ID, HEDGE_ID]);
  const planted = new Set(plan.plots.map((plot) => plot.id));
  for (const item of items) {
    if (!derived.has(item.id) && !planted.has(item.id)) {
      throw new Error(`"${item.id}" has no plot on the resort plan`);
    }
  }
}

/**
 * Lays the plan out: one placement per plot, a paved tile wherever a street or
 * a spur runs clear of an object, and lamps and hedges along the path edges.
 * Every object type except the ones the layout places itself must appear on the
 * plan at least once, unless the plan says otherwise — see
 * {@link ResortPlan.standsWholeCatalogue}.
 */
export function layoutResort(items: readonly LayoutItem[], plan: ResortPlan): ResortLayout {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path = byId.get(PATH_ID);
  if (!path) throw new Error(`The catalogue has no "${PATH_ID}" object to pave with`);
  if (path.tilesX !== 1 || path.tilesZ !== 1) throw new Error(`"${PATH_ID}" must be a 1x1 tile`);

  requireEveryTypePlanted(items, plan);

  // The paving a tile gets is a fact about the ground under it, not about the
  // route: the same street comes out as flagstones on grass and as decking on
  // sand. A catalogue without a boardwalk simply paves the beach in stone.
  const shore = shoreFor(plan);
  const boardwalk = byId.get(BOARDWALK_ID) ?? path;
  const pavingFor = (tile: Tile): LayoutItem => (isBeach(shore, tile.x, tile.z) ? boardwalk : path);

  // How high the ground is under a tile is a fact about the plot, exactly as
  // what the ground is made of is: a flat plan reports level 0 everywhere, so
  // nothing below here has to know whether the plot has terraces on it.
  const elevation: Elevation | null = elevationFor(plan);
  const levelOf = (tileX: number, tileZ: number): number => levelAt(elevation, tileX, tileZ);

  // occupiedTiles does the overlap, bounds and footprint checks for us.
  const paths = pathTilesFor(items, plan).map((tile) => {
    const paving = pavingFor(tile);
    const key = derivedKey(paving.id, tile.x, tile.z);
    return place(paving, key, tile.x, tile.z, 0, levelOf(tile.x, tile.z));
  });
  const keys = plotKeys(plan.plots);
  const placements = plan.plots.map((plot, index) =>
    place(
      byId.get(plot.id)!,
      keys[index]!,
      plot.tileX,
      plot.tileZ,
      plot.rotation ?? 0,
      levelOf(plot.tileX, plot.tileZ),
    ),
  );

  const props: Placement[] = [];
  const { lamps, hedges } = decorationsFor(items, plan);
  for (const [id, tiles] of [
    [LAMP_ID, lamps],
    [HEDGE_ID, hedges],
  ] as const) {
    const item = byId.get(id);
    if (!item) continue;
    for (const tile of tiles) {
      props.push(
        place(item, derivedKey(id, tile.x, tile.z), tile.x, tile.z, 0, levelOf(tile.x, tile.z)),
      );
    }
  }

  return { placements, props, paths, tilesX: plan.tilesX, tilesZ: plan.tilesZ };
}

/** Centre of a placement's model, useful for anchoring HUD labels. */
export function placementCenter(placement: Placement): { x: number; z: number } {
  return {
    x: placement.x + placement.width / 2,
    z: placement.z + placement.depth / 2,
  };
}
