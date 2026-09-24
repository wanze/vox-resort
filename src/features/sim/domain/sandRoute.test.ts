import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { blockedAt, clearLine, type ObstacleBox } from '../../crowd/domain/sandGrid';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { LevelProvider } from '../../layout/domain/elevation';
import { elevationFor, levelAt } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor, terrainAt, type Shore } from '../../layout/domain/shoreline';
import { doorsFor } from './doors';
import { sandFieldFor, sandRoutesFor, type SandPoint, type SandRoute } from './sandRoute';
import { venuesOn } from './venues';

const FLAT: LevelProvider = () => 0;

const straightShore = shoreFor({
  tilesX: 20,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
})!;

const pathDown = (tileX: number, to = 11): PavedTile[] =>
  Array.from({ length: to - 5 }, (_, index) => ({ tileX, tileZ: 6 + index, y: 0 }));

const beachOf = (
  paved: PavedTile[],
  obstacles: ObstacleBox[] = [],
  shore: Shore = straightShore,
  tilesX = 20,
): WalkNetwork => walkNetworkFor({ paved, levelOf: FLAT, shore, tilesX, obstacles });

const centreOf = (tileX: number, tileZ: number): SandPoint => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
});

const tileOf = (point: SandPoint): [number, number] => [
  Math.floor(point.x / TILE_VOXELS),
  Math.floor(point.z / TILE_VOXELS),
];

const legsOf = (network: WalkNetwork, route: SandRoute): [SandPoint, SandPoint][] => {
  const gate = network.nodes[route.gate]!;
  const points = [{ x: gate.x, z: gate.z }, ...route.waypoints];
  return points.slice(1).map((point, index) => [points[index]!, point]);
};

describe('sandRoutesFor', () => {
  it('reaches the one gate on a straight open beach in one leg past the step off the paving', () => {
    const network = beachOf(pathDown(10));
    expect(network.gates).toHaveLength(1);
    const door = centreOf(4, 14);
    const routes = sandRoutesFor(network, [door], 40);
    expect(routes).toHaveLength(1);
    const [route] = routes as [SandRoute];
    expect(route.gate).toBe(network.gates[0]);
    expect(route.waypoints).toHaveLength(2);
    expect(route.waypoints.at(-1)).toEqual(door);
    const gate = network.nodes[route.gate]!;
    const first = route.waypoints[0]!;
    expect(route.length).toBeCloseTo(
      Math.hypot(first.x - gate.x, first.z - gate.z) +
        Math.hypot(door.x - first.x, door.z - first.z),
    );
  });

  it('walks round a lounger standing between the door and the gate', () => {
    const windbreak: ObstacleBox = {
      x: 7 * TILE_VOXELS + 4,
      z: 12 * TILE_VOXELS,
      width: 8,
      depth: 4 * TILE_VOXELS,
    };
    const network = beachOf(pathDown(10), [windbreak]);
    const door = centreOf(4, 13);
    expect(clearLine(network.sand!, door.x, door.z, 10.5 * TILE_VOXELS, 12.5 * TILE_VOXELS)).toBe(
      false,
    );
    const [route] = sandRoutesFor(network, [door], 40) as [SandRoute];
    expect(route.waypoints.length).toBeGreaterThan(2);
    for (const [from, to] of legsOf(network, route).slice(1)) {
      expect(clearLine(network.sand!, from.x, from.z, to.x, to.z), `${from.x},${from.z}`).toBe(
        true,
      );
    }
    expect(Math.max(...route.waypoints.map((point) => point.z))).toBeGreaterThan(16 * TILE_VOXELS);
  });

  it('never lays a leg across the water where the coast bends round a bay', () => {
    const shore = shoreFor({
      tilesX: 60,
      tilesZ: 40,
      shore: { inset: 8, beach: 3, wave: 4, seed: 5 },
    })!;
    const back = (tileX: number): number => {
      let tileZ = 0;
      while (terrainAt(shore, tileX, tileZ + 1) === 'land') tileZ++;
      return tileZ;
    };
    const paved = Array.from({ length: back(2) + 1 }, (_, tileZ) => ({ tileX: 2, tileZ, y: 0 }));
    const network = beachOf(paved, [], shore, 60);
    let door: SandPoint | null = null;
    for (let tileX = 58; tileX > 30 && !door; tileX--) {
      for (let tileZ = 0; tileZ < 40 && !door; tileZ++) {
        if (terrainAt(shore, tileX, tileZ) !== 'beach') continue;
        const candidate = centreOf(tileX, tileZ);
        if (sandRoutesFor(network, [candidate], 120).length > 0) door = candidate;
      }
    }
    expect(door, 'nowhere far along the beach was reachable').not.toBeNull();
    const [route] = sandRoutesFor(network, [door!], 120) as [SandRoute];
    const gate = network.nodes[route.gate]!;

    const wades = (from: SandPoint, to: SandPoint): boolean => {
      const samples = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z));
      for (let sample = 0; sample <= samples; sample++) {
        const f = samples === 0 ? 0 : sample / samples;
        const tileX = Math.floor((from.x + (to.x - from.x) * f) / TILE_VOXELS);
        const tileZ = Math.floor((from.z + (to.z - from.z) * f) / TILE_VOXELS);
        if (terrainAt(shore, tileX, tileZ) === 'water') return true;
      }
      return false;
    };
    expect(wades(gate, door!), 'the coast is straight enough to walk across').toBe(true);
    for (const [from, to] of legsOf(network, route)) {
      expect(wades(from, to), `leg to ${to.x},${to.z}`).toBe(false);
    }
  });

  it('gives nothing for a door no gate can reach within the limit', () => {
    const network = beachOf(pathDown(18));
    expect(sandRoutesFor(network, [centreOf(2, 14)], 40)).toHaveLength(1);
    expect(sandRoutesFor(network, [centreOf(2, 14)], 5)).toEqual([]);
  });

  it('hands back every gate that can reach it, nearest first', () => {
    const network = beachOf([...pathDown(3), ...pathDown(15)]);
    expect(network.gates).toHaveLength(2);
    const routes = sandRoutesFor(network, [centreOf(13, 14)], 40);
    expect(routes).toHaveLength(2);
    expect(network.nodes[routes[0]!.gate]!.tileX).toBe(15);
    expect(network.nodes[routes[1]!.gate]!.tileX).toBe(3);
    expect(routes[0]!.length).toBeLessThan(routes[1]!.length);
  });

  it('walks somebody already out on the sand to the door, from their own tile', () => {
    const network = beachOf(pathDown(10));
    const door = centreOf(4, 14);
    const field = sandFieldFor(network, [door], 40);
    const from = { x: 16.5 * TILE_VOXELS, z: 13.5 * TILE_VOXELS };
    const route = field.routeFrom(from)!;
    expect(route, 'nowhere to walk from a tile of open sand').not.toBeNull();
    expect(route[0]).toEqual(centreOf(16, 13));
    expect(route.at(-1)).toEqual(door);
    for (const point of route) {
      expect(terrainAt(straightShore, ...tileOf(point))).toBe('beach');
    }
    expect(field.routeFrom(centreOf(8, 15))).not.toBeNull();
    expect(field.routeFrom({ x: 4.5 * TILE_VOXELS, z: 4.5 * TILE_VOXELS })).toBeNull();
  });

  it('has nothing to say on a plot with no beach or for doors off the sand', () => {
    const inland = walkNetworkFor({ paved: pathDown(3), levelOf: FLAT, shore: null, tilesX: 20 });
    expect(sandFieldFor(inland, [centreOf(3, 14)], 40).routeFrom(centreOf(3, 14))).toBeNull();
    expect(sandFieldFor(beachOf(pathDown(3)), [], 40).routeFrom(centreOf(3, 14))).toBeNull();
  });

  it('gives nothing on a plot with no beach, or for a door off the sand', () => {
    const inland = walkNetworkFor({ paved: pathDown(3), levelOf: FLAT, shore: null, tilesX: 20 });
    expect(sandRoutesFor(inland, [centreOf(3, 14)], 40)).toEqual([]);
    expect(sandRoutesFor(beachOf(pathDown(3)), [centreOf(3, 4)], 40)).toEqual([]);
  });

  // Timed in CPU time, best of five, after a warm-up call: the first call mostly
  // compiles clearLine and blockedAt, and wall clock is noisy beside the suite.
  it('routes every building on the reference plot’s beach in well under a frame', () => {
    const plan = generateResort(
      OBJECT_TYPES.map((type) => ({
        id: type.id,
        tilesX: type.model.tiles.x,
        tilesZ: type.model.tiles.z,
        category: type.category,
        placement: type.model.placement,
      })),
      clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
    );
    const items: LayoutItem[] = OBJECT_TYPES.map((type) => ({
      id: type.id,
      tilesX: type.model.tiles.x,
      tilesZ: type.model.tiles.z,
      width: type.model.width,
      depth: type.model.depth,
      category: type.category,
      doors: type.venue?.doors ?? [],
    }));
    const layout = layoutResort(items, plan);
    const elevation = elevationFor(plan);
    const network = walkNetworkFor({
      paved: layout.paths,
      levelOf: (x, z) => levelAt(elevation, x, z),
      shore: shoreFor(plan),
      tilesX: plan.tilesX,
      obstacles: layout.placements,
    });
    const index = nodeIndexFor(network);
    const onSand = venuesOn(layout.placements)
      .map((venue) => doorsFor(venue, index, network))
      .filter((doors) => doors.nodes.length === 0 && doors.sand.length > 0);
    expect(onSand.length).toBeGreaterThanOrEqual(19);

    const routes = onSand.map((doors) => sandRoutesFor(network, doors.sand, 40));
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const started = process.cpuUsage();
      for (const doors of onSand) sandRoutesFor(network, doors.sand, 40);
      const spent = process.cpuUsage(started);
      best = Math.min(best, (spent.user + spent.system) / 1000);
    }
    expect(best).toBeLessThan(40);
    expect(routes.filter((each) => each.length === 0)).toEqual([]);
    for (const each of routes.flat()) {
      for (const point of each.waypoints) {
        const tileX = Math.floor(point.x / TILE_VOXELS);
        const tileZ = Math.floor(point.z / TILE_VOXELS);
        expect(terrainAt(network.beach!.shore, tileX, tileZ)).toBe('beach');
        expect(blockedAt(network.sand!, point.x, point.z)).toBe(false);
      }
    }
  });
});
