import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { MAX_QUEUE_SHOWN, queueLaneFor, type QueueSpot } from './queueLane';

const FLAT: LevelProvider = () => 0;

/** A paved corridor `length` tiles long, running east from tile 0. */
const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[], levelOf: LevelProvider = FLAT): WalkNetwork =>
  walkNetworkFor({ paved, levelOf, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

/** A venue standing just west of the corridor's first tile. */
const WEST = { x: -TILE_VOXELS / 2, z: TILE_VOXELS / 2 };

/** The terrace is z <= 1, so a flight stands on z = 2 and climbs north. */
const TERRACE: LevelProvider = (_x, z) => (z <= 1 ? 1 : 0);

/** The heading, in `crowd.ts`'s `atan2(dx, dz)` convention, from one point to another. */
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
      // Crossing a node mid-gap included: a straight corridor makes the path
      // distance and the straight one the same thing.
      expect(distance(lane[slot]!, lane[slot - 1]!), `slot ${slot}`).toBeCloseTo(spacing);
    }
  });

  it('keeps every spot on the paving round a corner', () => {
    // Two tiles east, then north up a side street: a ray would cut the corner
    // across the grass, and the lane must turn with the path.
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
    // And it did turn: the back of the line is up the side street.
    expect(lane.at(-1)!.z).toBeLessThan(5 * TILE_VOXELS);
  });

  it('climbs a flight of steps rather than hanging in the air off the top of it', () => {
    // The flight climbs north from the door at z = 4 on the ground below.
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
    // Somebody is part way up it, not only at its foot and its head.
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
    // The line runs east, so everybody in it faces west, which is -x.
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
