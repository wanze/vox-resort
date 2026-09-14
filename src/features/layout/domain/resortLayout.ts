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
 *    Dressing grows none, and neither does anything standing on sand; see
 *    {@link growSpurs} for why a palm and a sun lounger are not places you walk
 *    to.
 * 3. **Dressing** — street lamps are scattered along the path edges at an even
 *    spacing, benches at a wider one facing the path they stand beside, and
 *    hedges fill the straight runs between them.
 * 4. **Rails** — a handrail is stood along every paved edge the ground drops
 *    away beyond, and a balustrade up both flanks of every flight of stairs. Like
 *    the paving a tile gets, it is a fact about the ground rather than about the
 *    route. See `railings.ts`.
 *
 * Because the plan may stand several cottages on the plot, a placement carries
 * both its object type (`id`) and a unique `key`. Authored plots are keyed by
 * type and ordinal (`cottage#3`); everything derived is keyed by the tile it
 * stands on (`path@12,7`), because those keys have to survive an edit — see
 * {@link derivedKey}.
 *
 * A plan may also give the plot a shore, in which case its southern end is sea.
 * Water is not ground: nothing *stands* on it and no spur routes through it, and
 * a street stops where the beach ends unless it says it is a pier — in which case
 * its tiles over the water come out as a jetty, which is the same rule as the
 * boardwalk one tile landward of them. The sand in between is ordinary buildable
 * ground with that one difference, which is that a path laid on it comes out as
 * decking rather than as flagstones. See `shoreline.ts`, `PathEdge.overWater`,
 * and `ground.ts` for why sand is not only the flat band in front of the water:
 * a terrace can be made of it too, and the dune behind a beach is.
 *
 * A plan may also give the land terraces, in which case the plot is no longer
 * flat and every placement carries the height of the ground it stands on. Paving
 * follows from that the same way it follows from the ground being sand: a paved
 * tile with paved ground one level above it comes out as a flight of stairs
 * rather than as a slab, and one with a drop beside it gets a rail along that
 * edge. See `elevation.ts`, `stairs.ts` and `railings.ts`.
 *
 * Tile-to-voxel conversion happens here, so everything downstream works in
 * voxels: a model smaller than its declared footprint is centred in it — except
 * a handrail, which is stood against the edge it guards. See {@link placeOnEdge}.
 */

import {
  TILE_VOXELS,
  type ModelCategory,
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
import { rotateExtent, type Extent, type Rotation } from './rotation';

/** Tiles between one street lamp and the next, measured on the longer axis. */
const LAMP_SPACING = 5;

/**
 * Tiles between one bench and the next.
 *
 * Nine, against the lamps' five: a lamp every 20 m of path is lighting and a
 * bench every 36 m is furniture, and the resort has a couple of thousand paved
 * tiles. At the lamps' spacing the promenade came out as a run of benches with
 * nowhere to walk between them, and every one of them wanted a person on it.
 */
const BENCH_SPACING = 9;

/** Tiles between one bench and the next along a park path, where sitting is the point. */
const PARK_BENCH_SPACING = 4;

export interface LayoutItem {
  readonly id: string;
  /** Footprint the object claims on the tile grid. */
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Actual model size in voxels; may be smaller than the footprint. */
  readonly width: number;
  readonly depth: number;
  /**
   * Shelf of the build palette the object is offered on, when the caller has one
   * to hand.
   *
   * The layout asks one question of it: whether the object is *dressing* — the
   * grounds shelf, which is the palms, the flowerbeds and the sun loungers — and
   * dressing grows no spur. See {@link growSpurs}. Optional because most of what
   * builds a `LayoutItem` is describing a footprint rather than a catalogue
   * entry, and an item that does not say is treated as something worth walking
   * to.
   */
  readonly category?: ModelCategory;
  /**
   * Ground the object will stand on and nowhere else, when its model declares
   * one. Only the build tool reads it — an authored plan is held to nothing of
   * the kind. See `placementGround.ts`.
   */
  readonly ground?: PlacementGround;
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
  /**
   * Handrails, one per guarded edge and one per flight of stairs.
   *
   * A list of their own because a rail is the one thing on the plot that claims
   * no ground: it stands *on* the paving it guards, at that tile's own height,
   * and the tile is already spoken for by the slab under it. Everything that
   * draws the resort draws these with the rest of it; everything that asks what
   * is standing on a tile — the occupancy index, the shadows, the sky-visibility
   * bake — leaves them out, because the answer for their tile is the paving.
   */
  readonly rails: readonly Placement[];
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
 * Stands a model flush against one edge of its tile instead of centred in it,
 * with the edge it hugs being the one its turn points at.
 *
 * Everything else on the plot is centred in the footprint it claims, which is
 * right for everything that *stands* somewhere: a lounger narrower than its tile
 * belongs in the middle of it. A handrail is the one thing that does not — it
 * belongs against the edge it guards, and which edge that is, is the whole
 * content of the placement. So the offset across the tile is flush rather than
 * halved, while the one along it stays centred: a rail shorter than the tile
 * runs down the middle of the edge it is on rather than off one end of it.
 *
 * The turn is otherwise the ordinary one — the model is drawn with the same
 * instance matrix everything else is — so a rail authored along its own north
 * edge lands on the west edge at a turn of one, exactly as a stair authored
 * climbing north climbs west. See `railing.ts`.
 */
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
  // Built once rather than per plot: anchoring an elevation spec validates it
  // against every column of the plot, which is not a thing to do five hundred
  // times over.
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

/**
 * Throws if a plot would stand across a terrace step.
 *
 * A model is a box with a flat underside, so a building laid across a step hangs
 * in the air at one end and is buried at the other — see `straddledTile` for why
 * there is no height that would do. A plan that does it is a mistake in the plan,
 * which is the same bargain `requireDryGround` strikes with one that builds in
 * the sea.
 */
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

/**
 * Throws if any tile a plot would claim is water rather than ground.
 *
 * Any water: the bay, and a river or a lake the plan carries as terrain edits.
 * Nothing in the catalogue floats, and a hotel standing in a channel is a
 * mistake in the plan wherever the channel came from.
 */
function requireDryGround(terrain: Terrain, plot: ResortPlot, tiles: Extent, key: string): void {
  for (let x = plot.tileX; x < plot.tileX + tiles.x; x++) {
    for (let z = plot.tileZ; z < plot.tileZ + tiles.z; z++) {
      if (terrain.surfaceOf(x, z) === 'water') {
        throw new Error(`"${key}" stands in the water at tile ${x},${z}`);
      }
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
 *
 * Unless the edge is a **pier**, which is the one run that means to be out
 * there: `overWater` keeps its tiles over the water, and `layoutResort` paves
 * them with the jetty. Nothing else changes — a pier is paving like any other,
 * so the crowd walks it, the rails guard it and the plazas, which are never
 * piers, still stop at the sand. See `PathEdge.overWater`.
 */
export function streetTiles(plan: ResortPlan): Tile[] {
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const terrain = terrainFor(plan);
  const tiles = new Map<string, Tile>();
  const add = (tile: Tile, overWater = false): void => {
    requireInsidePlot(plan, tile);
    // The *sea* stops a street; a river does not. A run strung corner to corner
    // over a plot with a bay in one corner wants to stop at the sand rather than
    // pave a causeway across the water, which is what `overWater` is for — and a
    // channel two tiles wide is nothing of the sort. It is something a road goes
    // over, and `pavingFor` turns those tiles into the bridge. See
    // `PathEdge.overWater`.
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

/** Throws if a tile falls outside the plot, which is a plan that does not fit. */
function requireInsidePlot(plan: ResortPlan, tile: Tile): void {
  if (tile.x < 0 || tile.z < 0 || tile.x >= plan.tilesX || tile.z >= plan.tilesZ) {
    throw new Error(`A street leaves the plot at tile ${tile.x},${tile.z}`);
  }
}

/** The two nodes an edge is strung between, or a throw naming the missing one. */
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
 *
 * **Nothing on the grounds shelf grows one.** A palm, a flowerbed, a hedge and a
 * sun lounger are dressing rather than destinations: nobody walks *to* a palm,
 * and a plot that paved a way to every one of them spent more of the hill on
 * paving than on grass. Which shelf a model is on is a fact the art declares, so
 * this needs no list of ids — see `objectTypes.ts`.
 *
 * **Nothing standing on sand grows one either.** Sand is walked on: a lounger is
 * reached across the beach, and a boardwalk to every parasol is a car park with
 * sand in it. This is the one rule that keeps a beach a beach, and it is worth
 * being precise about what it buys — a spur is grown *per object*, so three
 * lines of loungers used to pave the whole row of sand in front of them, one
 * tile at a time, and the walks that used to cross the beach existed mostly to
 * keep those spurs one tile long. Neither is needed once the sand is the path.
 *
 * It is asked of the ground rather than of the beach, so the shelf on top of the
 * dune is covered by it too: the bungalows up there have a sidewalk because the
 * generator laid one down the middle of their bench, not because each of them
 * grew a spur to it. See `ground.ts`.
 */
function growSpurs(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  occupied: ReadonlyMap<string, string>,
  paved: Map<string, Tile>,
): void {
  const { byId, keys, terrain } = spurContext(items, plan);
  // Sand is not routed *through* either, for the same reason nothing standing on
  // it grows a spur: a walk laid across the beach to reach a building on the
  // grass behind it is a boardwalk nobody asked for, and the BFS will happily
  // find one along a free row of it.
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

  plan.plots.forEach((plot, index) => {
    const item = byId.get(plot.id)!;
    if (!needsPaving(item, plot, terrain)) return;
    const border = borderTiles(plot, item, plan);
    if (border.some((tile) => paved.has(tileKey(tile.x, tile.z)))) return;

    const route = spurRoute(border, isFree, touchesPath);
    if (!route) throw new Error(`"${keys[index]}" cannot be reached from the path network`);
    for (const tile of route) paved.set(tileKey(tile.x, tile.z), tile);
  });
}

/**
 * What both questions about spurs need to know: the catalogue by id, the plots'
 * keys, and the ground the plan describes.
 *
 * One helper because the two are the same question asked twice — one grows the
 * paving and the other checks that it reached everything — and a preamble that
 * drifted between them would be a spur grown against one rule and audited
 * against another.
 */
function spurContext(items: readonly LayoutItem[], plan: ResortPlan) {
  return {
    byId: new Map(items.map((item) => [item.id, item])),
    keys: plotKeys(plan.plots),
    terrain: terrainFor(plan),
  };
}

/**
 * Whether something standing here has to have paving walked to it.
 *
 * The one place the two exemptions live, because two callers ask the same
 * question and an answer that differed between them would be a spur grown to
 * something the reachability check then called unreachable. Dressing — the
 * grounds shelf — is not a destination, and sand is walked on. See
 * {@link growSpurs}.
 */
function needsPaving(item: LayoutItem, plot: ResortPlot, terrain: Terrain): boolean {
  return item.category !== 'grounds' && terrain.surfaceOf(plot.tileX, plot.tileZ) !== 'sand';
}

/**
 * The shortest run of free tiles from a footprint's border to the network, or
 * null when it is walled in.
 *
 * Breadth-first from every free border tile at once, so the first tile found
 * touching the network is the shortest way out of *any* side of the object
 * rather than the shortest way out of the side that happened to be looked at
 * first. The route comes back seaward-first — the tile touching the network,
 * then the way back to the object — which is immaterial, because the caller
 * paves all of it.
 */
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

/** The tiles from the one the search reached back to the border it started at. */
function walkBack(from: Tile, parents: ReadonlyMap<string, Tile | null>): Tile[] {
  const route: Tile[] = [];
  for (let step: Tile | null = from; step; step = parents.get(tileKey(step.x, step.z)) ?? null) {
    route.push(step);
  }
  return route;
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

/**
 * Keys of objects with no paved tile touching their footprint — nobody can reach
 * them.
 *
 * Dressing and anything standing on sand are reachable by definition and never
 * appear here: nobody walks to a palm, and a lounger is reached across the sand.
 * Both are the rules `growSpurs` lays no paving by.
 */
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

/**
 * A tile of dressing that has to face something: the bench, and so far only the
 * bench.
 *
 * A lamp and a hedge are the same from all four sides, so the layout has never
 * had to turn a prop before. A seat is not: it has a front, and the front has
 * to look at the path, or the resort fills up with people sitting with their
 * backs to it. See {@link facingRotation}.
 */
export interface TurnedTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
}

export interface Decorations {
  readonly lamps: readonly Tile[];
  /** Benches, each turned to face the path it stands beside. */
  readonly benches: readonly TurnedTile[];
  readonly hedges: readonly Tile[];
  /** Trees in rows along the plan's avenues, where it has any. */
  readonly trees: readonly Tile[];
}

/** Tiles from one tree of an avenue to the next. */
const AVENUE_PITCH = 3;

/**
 * The trees of a plan's avenues: every third free tile beside one of its
 * streets, counted along the street, so the trees either side of it stand in
 * straight rows facing each other. A tile beside two avenues at once is a
 * corner, where a tree would stand in the sight line of a junction, and gets none.
 */
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

/**
 * Which side of an avenue a tile is on: beside a street running east to west
 * (so north or south of it), beside one running north to south, at a corner of
 * both, or beside none.
 */
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

/**
 * The turn that points a model's own +z the way `(dx, dz)` points.
 *
 * The convention is `rotation.ts`'s, and the one fact worth writing down is why
 * these four are the answer: a turn of 1 swings +z round to +x — see
 * {@link rotatePoint} — so the sequence runs +z, +x, -z, -x. It is the same
 * sequence a seat's own `facing` is declared in, which is what lets the two be
 * added together.
 */
function facingRotation(dx: number, dz: number): Rotation {
  if (dz > 0) return 0;
  if (dx > 0) return 1;
  if (dz < 0) return 2;
  return 3;
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

/**
 * Dresses the path edges. All three lists come from the same ring of free tiles
 * that touch a path: lamps are taken first at an even spacing, then benches at
 * a wider one, then hedges fill the straight runs left over, skipping anything
 * pressed against a building so the planting reads as a border rather than as
 * undergrowth.
 *
 * Benches are taken before the hedges rather than after, and that order is the
 * only thing about it worth arguing over: the tiles all three want are the same
 * tiles, and a bench is worth more than a hedge on any of them — one is a place
 * a person sits, the other is a line of green. Taken last there were none left
 * on the promenade at all.
 */
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
  // An avenue is lined with trees and nothing else: no hedge on the tiles between them.
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

/** Lamps along the ring at an even spacing, each marked taken. */
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

/**
 * The one paved neighbour of a tile, or null where it has none or several.
 *
 * A bench wants exactly one: it is what makes the facing unambiguous, and a
 * tile with paving on two sides is a corner, where a seat would have its back
 * to a path people walk along.
 */
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

/** Benches on the free ring tiles with one path beside them, spaced apart, each marked taken. */
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
    // Closer together inside a park, where a bench is what the path is for.
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

/**
 * Hedges along the straight runs left over: free tiles with one path beside
 * them, clear of buildings on every side, and only where they continue a run so
 * no hedge stands on its own.
 */
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
  const planted = new Set(plan.plots.map((plot) => plot.id));
  for (const item of items) {
    if (!DERIVED_IDS.has(item.id) && !planted.has(item.id)) {
      throw new Error(`"${item.id}" has no plot on the resort plan`);
    }
  }
}

/** The model each kind of rail is drawn with; a catalogue may have neither. */
export type RailModels = { readonly [kind in RailKind]: LayoutItem | undefined };

/** The rail models a catalogue offers, looked up by the ids the layout owns. */
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

/**
 * Stands the rails the ground asked for, one placement per rail.
 *
 * Split from the rule so the pointer stands a rail exactly as the layout does —
 * same model, same key, same offset in the tile — for the same reason `climbAt`
 * is shared: the two would otherwise drift, and a rail drawn by hand would land
 * a voxel off the one beside it. A catalogue with neither model in it simply
 * comes out with no rails.
 *
 * A rail stands on the tile it guards rather than claiming one of its own. See
 * `railings.ts` for the rule and `placeOnEdge` for why one of the two kinds is
 * not centred in its tile.
 */
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
    // A flight's balustrade covers the whole tile and is placed like anything
    // else; every other rail — a bridge's parapets included — is stood flush
    // against the edge it guards.
    placements.push(
      rail.kind === 'flight'
        ? place(item, railKey(item, rail), x, z, rail.rotation, level)
        : placeOnEdge(item, railKey(item, rail), x, z, rail.rotation, level),
    );
  }
  return placements;
}

/**
 * Key one rail stands under: its model, its tile, and the edge it guards.
 *
 * The edge as well as the tile, because a corner of a terrace is one tile with
 * two rails on it and a derived key has to be unique. Everything a rail is, is
 * in the key — which is what lets the pointer tell the rails a tile wants from
 * the ones already standing on it by key alone. See `build/domain/handrails.ts`.
 */
function railKey(item: LayoutItem, rail: RailTile): string {
  return `${derivedKey(item.id, rail.tile.x, rail.tile.z)}:${rail.rotation}`;
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
  // route: the same street comes out as flagstones on grass, decking on sand, a
  // flight of stairs where it climbs a terrace, a pier where it leaves the shore
  // and a bridge where it crosses a channel. A catalogue missing one of those
  // simply paves that ground in stone.
  //
  // How high the ground is, and what it is made of, both come off the one field:
  // a flat plan with no coast reports grass at level 0 everywhere, so nothing
  // below here has to know whether the plot has terraces, a bay or a river on it.
  const terrain = terrainFor(plan);
  const levelOf = (tileX: number, tileZ: number): number => terrain.levelOf(tileX, tileZ);

  const boardwalk = byId.get(BOARDWALK_ID) ?? path;
  const jetty = byId.get(JETTY_ID) ?? boardwalk;
  const bridge = byId.get(BRIDGE_ID) ?? jetty;
  const bridgeRamp = byId.get(BRIDGE_RAMP_ID) ?? bridge;
  // Which water a span stands *above* rather than on, which is the one thing a
  // bridge does that no other paving does. Only where the catalogue actually has
  // the bridge: with the model missing the crossing falls back to a pier laid
  // flat, and a flat pier has neither ends nor a parapet of its own to speak of.
  //
  // Remembered per tile, because four separate passes ask what a tile is made of
  // — the paving, the span rule, the span rule again about each neighbour, and
  // the rails — and `surfaceOf` walks the terraces and evaluates a meander every
  // time. Asked once per tile it is the cost it was before there were spans.
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
  // Four answers from one question about the ground under a tile. Sand rather
  // than beach, because the sidewalk along the top of a dune is decking for the
  // same reason the pier is — see `ground.ts`; and water only ever reaches here
  // on a run that means to be out there, because nothing else paves it. Which
  // span it gets is the one thing the bay and a river disagree about.
  const pavingFor = (tile: Tile): LayoutItem => {
    const ground = surfaceOf(tile.x, tile.z);
    if (ground === 'water') return terrain.isSea(tile.x, tile.z) ? jetty : bridge;
    return ground === 'sand' ? boardwalk : path;
  };

  // occupiedTiles does the overlap, bounds and footprint checks for us.
  const paved = pathTilesFor(items, plan);
  const stairs = byId.get(STAIRS_ID);
  const flights = new Map(
    stairTilesFor(paved, levelOf).map((flight) => [
      tileKey(flight.tile.x, flight.tile.z),
      flight.rotation,
    ]),
  );
  // Which tiles of a crossing come ashore, and which way each one runs. Asked of
  // `spans.ts` rather than re-derived, exactly as the flights are asked of
  // `stairs.ts`: the paving tool asks the same question one tile at a time.
  const spans = new Map(
    spanTilesFor(paved, raised).map((span) => [tileKey(span.tile.x, span.tile.z), span]),
  );
  const paths = paved.map((tile) => {
    // A span first, because a crossing answers to the water under it and nothing
    // else — a tile of it climbs nothing, since inland water is flush with its
    // banks. Then a flight, which stands on the lower tile of a step and is
    // turned to face the higher ground; everything else is laid flat and
    // unturned.
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
      plot.rotation ?? 0,
      levelOf(plot.tileX, plot.tileZ),
    ),
  );

  // Water counts as a drop, which is what rails a pier down both flanks and
  // across its head: the sea beside a jetty stands at the jetty's own level, so
  // the heights alone would say there was nothing to fall into. See
  // `railings.ts`.
  const overWater = (tileX: number, tileZ: number): boolean => surfaceOf(tileX, tileZ) === 'water';
  const rails = railPlacementsFor(
    railModelsIn(items),
    railTilesFor(paved, levelOf, overWater, raised),
    levelOf,
  );

  const props = propsFor(items, plan, levelOf);
  return { placements, props, paths, rails, tilesX: plan.tilesX, tilesZ: plan.tilesZ };
}

/** The dressing as placements: lamps, hedges and avenue trees unturned, benches facing their path. */
function propsFor(
  items: readonly LayoutItem[],
  plan: ResortPlan,
  levelOf: (tileX: number, tileZ: number) => number,
): Placement[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const { lamps, benches, hedges, trees } = decorationsFor(items, plan);
  // The bench is scattered like the others and turned like nothing else: its
  // own model is 1x1, so the turn costs it no footprint, only a different
  // instance matrix and — the point of the whole thing — a sitter facing the
  // path. See `crowd/domain/seating.ts`.
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

/** Centre of a placement's model, useful for anchoring HUD labels. */
export function placementCenter(placement: Placement): { x: number; z: number } {
  return {
    x: placement.x + placement.width / 2,
    z: placement.z + placement.depth / 2,
  };
}
