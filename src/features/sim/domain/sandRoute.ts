/**
 * A way over the beach from the paving to a building standing on the sand.
 *
 * The beach is not in the walk graph, by design - see `walkNetwork.ts` - and the
 * layout grows no paving to anything standing on it, because sand is walked on.
 * So a beach shower has no door node, and without this nobody could ever be
 * routed to it. What joins the two is a **sand leg**: from a gate, over beach
 * tiles, to the building's sand door. The router walks a guest to the gate on
 * the graph as it walks them to any door, and hands the crowd the leg one
 * waypoint at a time.
 *
 * ## Over tiles, then pulled straight
 *
 * A straight line from a gate is not a safe line. Loungers and parasols stand
 * between most gates and most buildings, and the coast meanders, so two points
 * both on sand can have sea between them - the reason a roamer only drifts a
 * few columns per hop (`ROAM_COLUMNS`). So the leg is found over beach tiles
 * first, a breadth-first sweep of tile centres whose every step is clear on
 * `network.sand`, and only then shortened: a waypoint is dropped wherever the
 * one after it can be walked to straight, clear of everything and without the
 * chord leaving the beach. A guest walks a few straight legs rather than a
 * staircase of tile centres, and never wades.
 *
 * ## One sweep per building, from all its sand doors
 *
 * A building on the sand may have several ways in - three flights down off a
 * beach club's deck, or the open ring round a shower - so the sweep starts from
 * all of them at once and each gate gets the route to whichever door is nearest
 * it. One sweep per door would be the same answer for many times the work.
 *
 * Nothing here touches the crowd. It answers points, and the router is what
 * walks anybody along them.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { clearLine } from '../../crowd/domain/sandGrid';
import type { BeachBand, WalkNetwork } from '../../crowd/domain/walkNetwork';
import { waterStartZ } from '../../layout/domain/shoreline';

/** A point on the ground plane, in world voxels. */
export interface SandPoint {
  readonly x: number;
  readonly z: number;
}

export interface SandRoute {
  /** The gate node this route leaves the graph at. */
  readonly gate: number;
  /** Points to walk, gate end first, door last, in world voxels. Never empty. */
  readonly waypoints: readonly SandPoint[];
  /** Voxels walked from the gate along them, for `chooseVenue`'s distance. */
  readonly length: number;
}

/** The 4-neighbours, in a fixed order so the same beach sweeps the same way twice. */
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/**
 * Voxels at the gate end of the step off the paving that are not asked about
 * obstacles: a gate is paving that lamps stand beside. The crowd's own
 * `GATE_CLEAR`, for the crowd's reason.
 */
const GATE_CLEAR = TILE_VOXELS / 2 + 2;

/** How often a chord is asked whether it is still over the beach, in voxels. */
const TERRAIN_SAMPLE = TILE_VOXELS / 4;

/** One tile the sweep reached: where it is stood on, and the tile it came from. */
interface Reached {
  readonly tileX: number;
  readonly tileZ: number;
  readonly point: SandPoint;
  readonly parent: number;
  readonly depth: number;
}

/**
 * One building's sweep, kept: the way to its doors from anywhere on the sand
 * that can reach them.
 *
 * The sweep is the expensive half of a route and it is the same sweep for every
 * starting point, so a guest on a pitch who wants an ice cream asks this rather
 * than sweeping the beach again. {@link sandRoutesFor} is the gates asked of one
 * of these; a stay on the sand asks it of wherever the party settled.
 */
export interface SandField {
  /**
   * The walk from a point on the sand to the nearest door, its own tile first
   * and the door last, or null where the sweep never reached that tile.
   *
   * The first waypoint is the centre of the caller's own tile rather than the
   * point itself: somebody lying on a lounger is inside its box, and the way out
   * of one is the way in.
   */
  routeFrom(from: SandPoint): readonly SandPoint[] | null;
}

/**
 * The sweep over the beach from a building's doors, as something to ask for
 * routes. Empty of answers on a plot with no beach, or for doors on no beach
 * tile.
 */
export function sandFieldFor(
  network: WalkNetwork,
  doors: readonly SandPoint[],
  maxTiles: number,
): SandField {
  if (!network.beach || doors.length === 0) return { routeFrom: () => null };
  const beach = bandOf(network.beach);
  const reached = sweepBeach(network, beach, doors, maxTiles);
  const byTile = tileIndexOf(beach, reached);
  return {
    routeFrom(from) {
      const tileX = Math.floor(from.x / TILE_VOXELS);
      const tileZ = Math.floor(from.z / TILE_VOXELS);
      const start = byTile.get(tileKey(beach, tileX, tileZ));
      if (start === undefined) return null;
      return pulled(network, beach, pathFrom(reached, start));
    },
  };
}

/** Where each reached tile is in the sweep, by its tile key. */
function tileIndexOf(beach: Band, reached: readonly Reached[]): Map<number, number> {
  const byTile = new Map<number, number>();
  for (const [index, tile] of reached.entries()) {
    byTile.set(tileKey(beach, tile.tileX, tile.tileZ), index);
  }
  return byTile;
}

/**
 * Every gate that can reach one of `doors` within `maxTiles` steps over the
 * beach, each with its route, nearest first and ties to the lower gate.
 *
 * Empty on a plot with no beach, for doors that stand on no beach tile, and
 * for a building no gate can reach: the router treats all three as a venue
 * nobody can walk to.
 *
 * A door stands in for the centre of its own tile, so the door itself - which
 * `doors.ts` puts outside the building - is where every route ends.
 */
export function sandRoutesFor(
  network: WalkNetwork,
  doors: readonly SandPoint[],
  maxTiles: number,
): readonly SandRoute[] {
  if (!network.beach || doors.length === 0) return [];
  const beach = bandOf(network.beach);
  const reached = sweepBeach(network, beach, doors, maxTiles);
  if (reached.length === 0) return [];

  const byTile = tileIndexOf(beach, reached);
  const routes: SandRoute[] = [];
  for (const gate of network.gates) {
    const node = network.nodes[gate]!;
    const start = stepOffFrom(network, beach, byTile, reached, node);
    if (start === -1) continue;
    const waypoints = pulled(network, beach, pathFrom(reached, start));
    routes.push({ gate, waypoints, length: lengthOf(node, waypoints) });
  }
  return routes.toSorted((a, b) => a.length - b.length || a.gate - b.gate);
}

/**
 * The breadth-first sweep over beach tiles, out from every door at once, as the
 * list of tiles reached in the order they were: each one's parent is nearer a
 * door, and the doors themselves are at depth 0.
 */
function sweepBeach(
  network: WalkNetwork,
  beach: Band,
  doors: readonly SandPoint[],
  maxTiles: number,
): Reached[] {
  const reached: Reached[] = [];
  const seen = new Set<number>();
  /** Takes a tile nobody has reached yet, if it is sand and the step onto it is clear. */
  const reach = (tileX: number, tileZ: number, point: SandPoint, parent: number): void => {
    const key = tileKey(beach, tileX, tileZ);
    if (seen.has(key) || !isBeach(beach, tileX, tileZ)) return;
    const from = reached[parent];
    if (from && !clearOnSand(network, from.point, point)) return;
    seen.add(key);
    reached.push({ tileX, tileZ, point, parent, depth: from ? from.depth + 1 : 0 });
  };

  for (const door of doors) {
    reach(Math.floor(door.x / TILE_VOXELS), Math.floor(door.z / TILE_VOXELS), door, -1);
  }
  for (let head = 0; head < reached.length; head++) {
    const from = reached[head]!;
    if (from.depth >= maxTiles) continue;
    for (const [dx, dz] of NEIGHBOURS) {
      const tileX = from.tileX + dx;
      const tileZ = from.tileZ + dz;
      reach(tileX, tileZ, centreOf(tileX, tileZ), head);
    }
  }
  return reached;
}

/**
 * Which reached tile a person at this gate steps off the paving onto: the one
 * beside the gate's own tile nearest a door, or -1 where none is, or where the
 * step onto it is not clear.
 */
function stepOffFrom(
  network: WalkNetwork,
  beach: Band,
  byTile: ReadonlyMap<number, number>,
  reached: readonly Reached[],
  gate: { readonly x: number; readonly z: number; readonly tileX: number; readonly tileZ: number },
): number {
  let best = -1;
  for (const [dx, dz] of NEIGHBOURS) {
    const tileX = gate.tileX + dx;
    if (tileX < 0 || tileX >= beach.tilesX) continue;
    const index = byTile.get(tileKey(beach, tileX, gate.tileZ + dz));
    if (index === undefined) continue;
    if (best !== -1 && reached[index]!.depth >= reached[best]!.depth) continue;
    const sand = network.sand;
    const target = reached[index]!.point;
    if (sand && !clearLine(sand, gate.x, gate.z, target.x, target.z, GATE_CLEAR)) continue;
    best = index;
  }
  return best;
}

/** The tiles from one reached tile back to the door it was reached from, as points. */
function pathFrom(reached: readonly Reached[], start: number): SandPoint[] {
  const points: SandPoint[] = [];
  for (let at = start; at !== -1; at = reached[at]!.parent) points.push(reached[at]!.point);
  return points;
}

/**
 * The same walk with every waypoint dropped that can be walked past in a
 * straight line: from each point kept, on to the furthest point ahead that is
 * still clear and still over the beach all the way.
 *
 * Asked forwards and stopped at the first refusal rather than asked of the
 * furthest point first, so a long route costs a clear line per waypoint rather
 * than one per pair. It can keep a corner a search over every pair would have
 * cut, and a guest walking one corner too many is not a guest walking into the
 * sea.
 */
function pulled(
  network: WalkNetwork,
  beach: Band,
  points: readonly SandPoint[],
): readonly SandPoint[] {
  const kept: SandPoint[] = [points[0]!];
  let from = 0;
  while (from < points.length - 1) {
    let to = from + 1;
    while (to + 1 < points.length && straightOver(network, beach, points[from]!, points[to + 1]!)) {
      to++;
    }
    kept.push(points[to]!);
    from = to;
  }
  return kept;
}

/** Whether the chord between two points is clear and never leaves the beach. */
function straightOver(network: WalkNetwork, beach: Band, a: SandPoint, b: SandPoint): boolean {
  if (!clearOnSand(network, a, b)) return false;
  const samples = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / TERRAIN_SAMPLE);
  for (let sample = 1; sample < samples; sample++) {
    const f = sample / samples;
    const tileX = Math.floor((a.x + (b.x - a.x) * f) / TILE_VOXELS);
    const tileZ = Math.floor((a.z + (b.z - a.z) * f) / TILE_VOXELS);
    if (!isBeach(beach, tileX, tileZ)) return false;
  }
  return true;
}

const clearOnSand = (network: WalkNetwork, a: SandPoint, b: SandPoint): boolean =>
  network.sand === null || clearLine(network.sand, a.x, a.z, b.x, b.z);

/** Voxels from the gate through every waypoint in turn. */
function lengthOf(gate: SandPoint, waypoints: readonly SandPoint[]): number {
  let length = 0;
  let from = gate;
  for (const point of waypoints) {
    length += Math.hypot(point.x - from.x, point.z - from.z);
    from = point;
  }
  return length;
}

/**
 * The beach band as one row range per column, worked out once per call.
 *
 * `terrainAt` evaluates the coast's meander every time it is asked, and a sweep
 * asks it of every tile it considers - most of the cost of a route, measured,
 * before this table. The answer is `terrainAt`'s own, read off `waterStartZ`.
 */
interface Band {
  readonly tilesX: number;
  /** The first water row of each column. */
  readonly water: Int32Array;
  /** Rows of sand in front of the water. */
  readonly depth: number;
}

function bandOf(beach: BeachBand): Band {
  const water = new Int32Array(beach.tilesX);
  for (let tileX = 0; tileX < beach.tilesX; tileX++) water[tileX] = waterStartZ(beach.shore, tileX);
  return { tilesX: beach.tilesX, water, depth: beach.shore.spec.beach };
}

const isBeach = (band: Band, tileX: number, tileZ: number): boolean => {
  if (tileX < 0 || tileX >= band.tilesX) return false;
  const water = band.water[tileX]!;
  return tileZ < water && tileZ >= water - band.depth;
};

const centreOf = (tileX: number, tileZ: number): SandPoint => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
});

/** One number per tile, which a negative row is not given: the beach never has one. */
const tileKey = (beach: Band, tileX: number, tileZ: number): number => tileZ * beach.tilesX + tileX;
