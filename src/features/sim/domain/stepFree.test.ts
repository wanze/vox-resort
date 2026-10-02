import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorsFor } from './doors';
import { stepFreeReachOn } from './stepFree';
import type { Venue } from './venues';

// The gate is at the west end of the lower street. The terrace north of it is climbed by a flight
// at x = 0 and, when asked, by a ramp at x = 4.
const terrace = (ramp: boolean): WalkNetwork => {
  const paved: PavedTile[] = [];
  for (let tileX = 0; tileX <= 4; tileX++) {
    paved.push({ tileX, tileZ: 0, y: LEVEL_VOXELS }, { tileX, tileZ: 3, y: 0 });
  }
  paved.push(
    { tileX: 0, tileZ: 2, y: 0, id: 'path', rotation: 0 },
    { tileX: 0, tileZ: 1, y: 0, id: 'stairs', rotation: 0 },
    { tileX: 4, tileZ: 2, y: 0, id: ramp ? 'ramp-foot' : 'path', rotation: 0 },
  );
  if (ramp) paved.push({ tileX: 4, tileZ: 1, y: 0, id: 'ramp-head', rotation: 0 });
  return walkNetworkFor({
    paved,
    levelOf: (_x, tileZ) => (tileZ < 1 ? 1 : 0),
    shore: null,
    tilesX: 8,
  });
};

const venueAt = (key: string, tileX: number, tileZ: number): Venue => ({
  key,
  id: key,
  label: key,
  role: 'food',
  satisfies: [],
  capacity: 4,
  dwellSeconds: { min: 60, max: 120 },
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

const UPSTAIRS = venueAt('cafe', 2, -1);
const DOWNSTAIRS = venueAt('bar', 2, 4);

const reachOn = (network: WalkNetwork) => {
  const index = nodeIndexFor(network);
  const gate = network.nodes.findIndex((node) => node.tileX === 0 && node.tileZ === 3);
  return stepFreeReachOn(network, [UPSTAIRS, DOWNSTAIRS], (venue) => doorsFor(venue, index).nodes, [
    gate,
  ]);
};

describe('stepFreeReachOn', () => {
  it('counts a venue up a flight with no ramp as reached on foot and not step-free', () => {
    const reach = reachOn(terrace(false));
    expect(reach.cutOff).toEqual([UPSTAIRS]);
    expect({ reached: reach.reached, venues: reach.venues }).toEqual({ reached: 1, venues: 2 });
  });

  it('counts every venue once a ramp climbs the terrace', () => {
    const reach = reachOn(terrace(true));
    expect(reach.cutOff).toEqual([]);
    expect({ reached: reach.reached, venues: reach.venues }).toEqual({ reached: 2, venues: 2 });
  });

  it('marks the stairs-only paving as the bad end, and leaves nothing unreached coloured', () => {
    const network = terrace(false);
    const { nodes } = reachOn(network);
    const upper = network.nodes.findIndex((node) => node.tileX === 3 && node.tileZ === 0);
    const lower = network.nodes.findIndex((node) => node.tileX === 3 && node.tileZ === 3);
    expect(nodes[upper]).toBe(1);
    expect(nodes[lower]).toBe(0);
    expect(nodes.some((value) => Number.isNaN(value))).toBe(false);
  });
});
