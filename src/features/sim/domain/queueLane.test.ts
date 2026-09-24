import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { blockedAt, type ObstacleBox } from '../../crowd/domain/sandGrid';
import {
  BEACH_SURFACE,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
} from '../../crowd/domain/walkNetwork';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { MAX_QUEUE_SHOWN, queueLaneFor, sandLaneFor, type QueueSpot } from './queueLane';

const FLAT: LevelProvider = () => 0;

const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[], levelOf: LevelProvider = FLAT): WalkNetwork =>
  walkNetworkFor({ paved, levelOf, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

const WEST = { x: -TILE_VOXELS / 2, z: TILE_VOXELS / 2 };

const TERRACE: LevelProvider = (_x, z) => (z <= 1 ? 1 : 0);

const towards = (from: { x: number; z: number }, to: { x: number; z: number }): number =>
  Math.atan2(to.x - from.x, to.z - from.z);

const distance = (spot: QueueSpot, to: { x: number; z: number }): number =>
  Math.hypot(spot.x - to.x, spot.z - to.z);

describe('queueLaneFor', () => {
  it('runs away from the venue and never back towards it', () => {
    const network = networkOf(street(20));
    const lane = queueLaneFor(network, nodeAt(network, 0), WEST);
    expect(lane).toHaveLength(MAX_QUEUE_SHOWN);
    for (let slot = 1; slot < lane.length; slot++) {
      expect(distance(lane[slot]!, WEST), `slot ${slot}`).toBeGreaterThan(
        distance(lane[slot - 1]!, WEST),
      );
    }
  });

  it('stands the first person on the door and the rest an even spacing apart along the path', () => {
    const network = networkOf(street(20));
    const door = network.nodes[nodeAt(network, 0)]!;
    const lane = queueLaneFor(network, nodeAt(network, 0), WEST);
    expect(lane[0]).toMatchObject({ x: door.x, z: door.z, y: door.y });
    const spacing = distance(lane[1]!, lane[0]!);
    expect(spacing).toBeGreaterThan(0);
    for (let slot = 1; slot < lane.length; slot++) {
      expect(distance(lane[slot]!, lane[slot - 1]!), `slot ${slot}`).toBeCloseTo(spacing);
    }
  });

  it('keeps every spot on the paving round a corner', () => {
    const paved: PavedTile[] = [
      { tileX: 0, tileZ: 5, y: 0 },
      { tileX: 1, tileZ: 5, y: 0 },
      { tileX: 2, tileZ: 5, y: 0 },
      { tileX: 2, tileZ: 4, y: 0 },
      { tileX: 2, tileZ: 3, y: 0 },
      { tileX: 2, tileZ: 2, y: 0 },
      { tileX: 2, tileZ: 1, y: 0 },
      { tileX: 2, tileZ: 0, y: 0 },
    ];
    const network = networkOf(paved);
    const venue = { x: -TILE_VOXELS / 2, z: 5.5 * TILE_VOXELS };
    const lane = queueLaneFor(network, nodeAt(network, 0, 5), venue);
    expect(lane.length).toBeGreaterThan(8);
    for (const [slot, spot] of lane.entries()) {
      const onPaving = network.nodes.some(
        (node) =>
          Math.abs(spot.x - node.x) <= TILE_VOXELS / 2 &&
          Math.abs(spot.z - node.z) <= TILE_VOXELS / 2,
      );
      expect(onPaving, `slot ${slot} at ${spot.x},${spot.z}`).toBe(true);
    }
    expect(lane.at(-1)!.z).toBeLessThan(5 * TILE_VOXELS);
  });

  it('climbs a flight of steps rather than hanging in the air off the top of it', () => {
    const paved: PavedTile[] = [0, 1, 2, 3, 4].map((tileZ) => ({
      tileX: 0,
      tileZ,
      y: tileZ <= 1 ? LEVEL_VOXELS : 0,
    }));
    const network = networkOf(paved, TERRACE);
    const venue = { x: TILE_VOXELS / 2, z: 5.5 * TILE_VOXELS };
    const door = nodeAt(network, 0, 4);
    const lane = queueLaneFor(network, door, venue);
    for (let slot = 1; slot < lane.length; slot++) {
      expect(lane[slot]!.y, `slot ${slot}`).toBeGreaterThanOrEqual(lane[slot - 1]!.y);
    }
    const top = Math.max(...lane.map((spot) => spot.y));
    expect(top).toBeGreaterThan(network.nodes[door]!.y);
    const partway = lane.some(
      (spot) => spot.y > network.nodes[door]!.y + 0.5 && spot.y < top - 0.5,
    );
    expect(partway).toBe(true);
  });

  it('gives a door nobody can walk away from a lane of exactly one', () => {
    const network = networkOf([{ tileX: 3, tileZ: 3, y: 0 }]);
    const lane = queueLaneFor(network, 0, { x: 3.5 * TILE_VOXELS, z: 2.5 * TILE_VOXELS });
    expect(lane).toHaveLength(1);
  });

  it('faces everybody at the person in front, and the front of the line at the venue', () => {
    const network = networkOf(street(20));
    const lane = queueLaneFor(network, nodeAt(network, 0), WEST);
    expect(Math.cos(lane[0]!.heading - towards(lane[0]!, WEST))).toBeCloseTo(1);
    for (let slot = 1; slot < lane.length; slot++) {
      const spot = lane[slot]!;
      expect(Math.cos(spot.heading - towards(spot, lane[slot - 1]!)), `slot ${slot}`).toBeCloseTo(
        1,
      );
      expect(Math.sin(spot.heading), `slot ${slot} faces west`).toBeCloseTo(-1);
    }
  });
});

describe('sandLaneFor', () => {
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const beachOf = (obstacles: ObstacleBox[]): WalkNetwork =>
    walkNetworkFor({
      paved: [{ tileX: 10, tileZ: 11, y: 0 }],
      levelOf: FLAT,
      shore,
      tilesX: 20,
      obstacles,
    });
  const shower: ObstacleBox = { x: 4 * TILE_VOXELS, z: 13 * TILE_VOXELS, width: 16, depth: 16 };
  const door = { x: 5.5 * TILE_VOXELS, z: 13.5 * TILE_VOXELS };
  const east = { x: 12.5 * TILE_VOXELS, z: 13.5 * TILE_VOXELS };

  it('never stands anybody inside anything, or off the sand', () => {
    const network = beachOf([shower]);
    const nearWater = { x: door.x, z: 15.5 * TILE_VOXELS };
    const lane = sandLaneFor(network, nearWater, { x: door.x, z: 30 * TILE_VOXELS });
    expect(lane.length).toBeGreaterThan(1);
    expect(lane.length).toBeLessThan(MAX_QUEUE_SHOWN);
    for (const [slot, spot] of lane.entries()) {
      expect(blockedAt(network.sand!, spot.x, spot.z), `slot ${slot}`).toBe(false);
      const tile = terrainAt(
        shore,
        Math.floor(spot.x / TILE_VOXELS),
        Math.floor(spot.z / TILE_VOXELS),
      );
      expect(tile, `slot ${slot}`).toBe('beach');
      expect(spot.y).toBe(BEACH_SURFACE);
    }
    expect(sandLaneFor(network, door, east)).toHaveLength(MAX_QUEUE_SHOWN);
  });

  it('holds a line of two where a lounger stands two spots out', () => {
    const lounger: ObstacleBox = { x: door.x + 11, z: door.z - 4, width: 8, depth: 8 };
    expect(sandLaneFor(beachOf([shower, lounger]), door, east)).toHaveLength(2);
  });

  it('faces the whole line at the door', () => {
    const lane = sandLaneFor(beachOf([shower]), door, east);
    for (const [slot, spot] of lane.entries()) {
      expect(Math.sin(spot.heading), `slot ${slot} faces west`).toBeCloseTo(-1);
      if (slot > 0) {
        const ahead = lane[slot - 1]!;
        expect(Math.cos(spot.heading - towards(spot, ahead)), `slot ${slot}`).toBeCloseTo(1);
        expect(spot.x).toBeGreaterThan(ahead.x);
      }
    }
  });
});
