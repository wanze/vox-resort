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
 * Tile-to-voxel conversion happens here, so everything downstream works in
 * voxels: a model smaller than its declared footprint is centred in it.
 */

import { TILE_VOXELS } from "../../../../voxel-gen/voxelgen.ts";
import {
  HEDGE_ID,
  LAMP_ID,
  PATH_ID,
  type Bend,
  type PathNode,
  type ResortPlan,
  type ResortPlot,
} from "./resortPlan";

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
  /** World-space corner of the model itself, in voxels. */
  readonly x: number;
  readonly z: number;
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

const tileKey = (x: number, z: number): string => `${x},${z}`;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Places one item's footprint at a tile position, centring a model that is smaller. */
export function place(item: LayoutItem, key: string, tileX: number, tileZ: number): Placement {
  return {
    key,
    id: item.id,
    tileX,
    tileZ,
    tilesX: item.tilesX,
    tilesZ: item.tilesZ,
    x: tileX * TILE_VOXELS + Math.floor((item.tilesX * TILE_VOXELS - item.width) / 2),
    z: tileZ * TILE_VOXELS + Math.floor((item.tilesZ * TILE_VOXELS - item.depth) / 2),
    width: item.width,
    depth: item.depth,
  };
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
    const item = byId.get(plot.id);
    if (!item) throw new Error(`The plot places unknown object "${plot.id}"`);
    const key = keys[index]!;
    if (item.width > item.tilesX * TILE_VOXELS || item.depth > item.tilesZ * TILE_VOXELS) {
      throw new Error(`"${item.id}" is larger than the ${item.tilesX}x${item.tilesZ} it claims`);
    }
    if (
      plot.tileX < 0 ||
      plot.tileZ < 0 ||
      plot.tileX + item.tilesX > plan.tilesX ||
      plot.tileZ + item.tilesZ > plan.tilesZ
    ) {
      throw new Error(`"${key}" does not fit inside the ${plan.tilesX}x${plan.tilesZ} plot`);
    }
    for (let x = plot.tileX; x < plot.tileX + item.tilesX; x++) {
      for (let z = plot.tileZ; z < plot.tileZ + item.tilesZ; z++) {
        const cell = tileKey(x, z);
        const already = occupied.get(cell);
        if (already) throw new Error(`"${key}" overlaps "${already}" at tile ${x},${z}`);
        occupied.set(cell, key);
      }
    }
  });
  return occupied;
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
  bend: Bend = "x-first",
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

  const corner = bend === "x-first" ? { x: b.tileX, z: a.tileZ } : { x: a.tileX, z: b.tileZ };
  if (bend === "x-first") {
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

/** Every tile the plan's streets and plazas cover, before objects are subtracted. */
export function streetTiles(plan: ResortPlan): Tile[] {
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const tiles = new Map<string, Tile>();
  const add = (tile: Tile): void => {
    if (tile.x < 0 || tile.z < 0 || tile.x >= plan.tilesX || tile.z >= plan.tilesZ) {
      throw new Error(`A street leaves the plot at tile ${tile.x},${tile.z}`);
    }
    tiles.set(tileKey(tile.x, tile.z), tile);
  };

  for (const edge of plan.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from) throw new Error(`Street edge references unknown node "${edge.from}"`);
    if (!to) throw new Error(`Street edge references unknown node "${edge.to}"`);
    for (const tile of routeEdgeTiles(from, to, edge.width ?? 1, edge.bend ?? "x-first")) {
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
  const x1 = plot.tileX + item.tilesX - 1;
  const z1 = plot.tileZ + item.tilesZ - 1;
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
  const isFree = (x: number, z: number): boolean =>
    x >= 0 &&
    z >= 0 &&
    x < plan.tilesX &&
    z < plan.tilesZ &&
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
  const paved = new Set(pathTilesFor(items, plan).map((tile) => tileKey(tile.x, tile.z)));

  const pathNeighbours = (x: number, z: number): number =>
    NEIGHBOURS.filter(([dx, dz]) => paved.has(tileKey(x + dx, z + dz))).length;

  const ring: Tile[] = [];
  for (let z = 0; z < plan.tilesZ; z++) {
    for (let x = 0; x < plan.tilesX; x++) {
      const key = tileKey(x, z);
      if (occupied.has(key) || paved.has(key)) continue;
      if (pathNeighbours(x, z) > 0) ring.push({ x, z });
    }
  }

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
 * Lays the plan out: one placement per plot, a paved tile wherever a street or
 * a spur runs clear of an object, and lamps and hedges along the path edges.
 * Every object type except the ones the layout places itself must appear on the
 * plan at least once.
 */
export function layoutResort(items: readonly LayoutItem[], plan: ResortPlan): ResortLayout {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path = byId.get(PATH_ID);
  if (!path) throw new Error(`The catalogue has no "${PATH_ID}" object to pave with`);
  if (path.tilesX !== 1 || path.tilesZ !== 1) throw new Error(`"${PATH_ID}" must be a 1x1 tile`);

  const derived = new Set([PATH_ID, LAMP_ID, HEDGE_ID]);
  const planted = new Set(plan.plots.map((plot) => plot.id));
  for (const item of items) {
    if (!derived.has(item.id) && !planted.has(item.id)) {
      throw new Error(`"${item.id}" has no plot on the resort plan`);
    }
  }

  // occupiedTiles does the overlap, bounds and footprint checks for us.
  const paths = pathTilesFor(items, plan).map((tile) =>
    place(path, derivedKey(PATH_ID, tile.x, tile.z), tile.x, tile.z),
  );
  const keys = plotKeys(plan.plots);
  const placements = plan.plots.map((plot, index) =>
    place(byId.get(plot.id)!, keys[index]!, plot.tileX, plot.tileZ),
  );

  const props: Placement[] = [];
  const { lamps, hedges } = decorationsFor(items, plan);
  const lamp = byId.get(LAMP_ID);
  if (lamp) {
    for (const tile of lamps)
      props.push(place(lamp, derivedKey(LAMP_ID, tile.x, tile.z), tile.x, tile.z));
  }
  const hedge = byId.get(HEDGE_ID);
  if (hedge) {
    for (const tile of hedges) {
      props.push(place(hedge, derivedKey(HEDGE_ID, tile.x, tile.z), tile.x, tile.z));
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
