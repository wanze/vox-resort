import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorNodesFor } from './doors';
import type { Venue } from './venues';

/** Everything at sea level, as `walkNetwork.test.ts` builds its fixtures. */
const FLAT: LevelProvider = () => 0;

const flat = (tiles: readonly (readonly [number, number])[]): PavedTile[] =>
  tiles.map(([tileX, tileZ]) => ({ tileX, tileZ, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 20 });

/** The tile each node of the network stands on, for readable assertions. */
const tilesOf = (network: WalkNetwork, nodes: readonly number[]): string[] =>
  nodes.map((node) => `${network.nodes[node]!.tileX},${network.nodes[node]!.tileZ}`);

const venueAt = (tileX: number, tileZ: number, tilesX = 1, tilesZ = 1): Venue => ({
  key: 'bakery#0',
  id: 'bakery',
  label: 'Bakery',
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
  x: (tileX + tilesX / 2) * TILE_VOXELS,
  z: (tileZ + tilesZ / 2) * TILE_VOXELS,
  tileX,
  tileZ,
  tilesX,
  tilesZ,
});

describe('doorNodesFor', () => {
  it('finds the path running past a one-tile venue', () => {
    // A street along z = 1, with the bakery standing on the tile above it.
    const network = networkOf(
      flat([
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
    );
    const doors = doorNodesFor(venueAt(1, 0), nodeIndexFor(network));
    expect(tilesOf(network, doors).toSorted()).toEqual(['0,1', '1,1', '2,1']);
  });

  it('finds nodes along every edge of a footprint that covers several tiles', () => {
    // A ring of paving right round a 2 x 3 building standing at 1,1.
    const paved: (readonly [number, number])[] = [];
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 4; z++) paved.push([x, z]);
    const network = networkOf(
      flat(paved.filter(([x, z]) => x === 0 || x === 3 || z === 0 || z === 4)),
    );
    const doors = tilesOf(network, doorNodesFor(venueAt(1, 1, 2, 3), nodeIndexFor(network)));
    // Every tile of the ring: the corners as well as the four sides.
    expect(doors).toContain('0,0');
    expect(doors).toContain('3,4');
    expect(doors).toContain('0,2');
    expect(doors).toContain('2,4');
    expect(doors).toHaveLength(14);
  });

  it('finds nothing for a bakery in the middle of a lawn', () => {
    const network = networkOf(
      flat([
        [10, 10],
        [11, 10],
      ]),
    );
    expect(doorNodesFor(venueAt(1, 1), nodeIndexFor(network))).toEqual([]);
  });

  it('returns each node once, sorted, however many tiles reach it', () => {
    // A corner tile of the ring is inside the two loops' overlap; a flight would
    // put two nodes on one tile. Neither may show up twice or out of order.
    const network = networkOf(
      flat([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ]),
    );
    const doors = doorNodesFor(venueAt(1, 1), nodeIndexFor(network));
    expect(new Set(doors).size).toBe(doors.length);
    expect([...doors].toSorted((a, b) => a - b)).toEqual(doors);
    expect(doors).toHaveLength(8);
  });

  it('leaves out a paved tile nobody can walk away from', () => {
    // `nodeIndexFor` drops a node with no exits, and so must a door: a venue
    // reached only by an isolated slab is a venue nobody reaches.
    const network = networkOf(
      flat([
        [1, 0],
        [4, 4],
        [5, 4],
      ]),
    );
    expect(doorNodesFor(venueAt(1, 1), nodeIndexFor(network))).toEqual([]);
  });
});
