// The beach is deliberately not in the walk graph, so buildings on sand are reached by
// a leg swept over beach tiles from a gate. A straight line is unsafe: props stand in
// the way and the meandering coast can put sea between two sand points.

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { clearLine } from '../../crowd/domain/sandGrid';
import type { BeachBand, WalkNetwork } from '../../crowd/domain/walkNetwork';
import { waterStartZ } from '../../layout/domain/shoreline';

export interface SandPoint {
  readonly x: number;
  readonly z: number;
}

export interface SandRoute {
  readonly gate: number;
  readonly waypoints: readonly SandPoint[];
  readonly length: number;
}

// Fixed order so the same beach sweeps the same way twice.
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

// A gate is paving that lamps stand beside, so its end of the step skips obstacles.
const GATE_CLEAR = TILE_VOXELS / 2 + 2;

const TERRAIN_SAMPLE = TILE_VOXELS / 4;

interface Reached {
  readonly tileX: number;
  readonly tileZ: number;
  readonly point: SandPoint;
  readonly parent: number;
  readonly depth: number;
}

export interface SandField {
  // Starts from the centre of the caller's tile: someone on a lounger is inside its box.
  routeFrom(from: SandPoint): readonly SandPoint[] | null;
}

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

function tileIndexOf(beach: Band, reached: readonly Reached[]): Map<number, number> {
  const byTile = new Map<number, number>();
  for (const [index, tile] of reached.entries()) {
    byTile.set(tileKey(beach, tile.tileX, tile.tileZ), index);
  }
  return byTile;
}

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

// Sweeps from every door at once: one sweep per door gives the same answer for more work.
function sweepBeach(
  network: WalkNetwork,
  beach: Band,
  doors: readonly SandPoint[],
  maxTiles: number,
): Reached[] {
  const reached: Reached[] = [];
  const seen = new Set<number>();
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

function pathFrom(reached: readonly Reached[], start: number): SandPoint[] {
  const points: SandPoint[] = [];
  for (let at = start; at !== -1; at = reached[at]!.parent) points.push(reached[at]!.point);
  return points;
}

// Scans forwards and stops at the first refusal, costing one clear line per waypoint
// rather than per pair; an extra corner is acceptable.
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

function lengthOf(gate: SandPoint, waypoints: readonly SandPoint[]): number {
  let length = 0;
  let from = gate;
  for (const point of waypoints) {
    length += Math.hypot(point.x - from.x, point.z - from.z);
    from = point;
  }
  return length;
}

// Cached per call: terrainAt re-evaluates the coast meander and dominated route cost.
interface Band {
  readonly tilesX: number;
  readonly water: Int32Array;
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

const tileKey = (beach: Band, tileX: number, tileZ: number): number => tileZ * beach.tilesX + tileX;
