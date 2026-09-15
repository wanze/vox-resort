import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import type { ObstacleBox } from '../../crowd/domain/sandGrid';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { shoreFor } from '../../layout/domain/shoreline';
import { doorsFor } from './doors';
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
  doors: [],
});

describe('doorsFor, with no door declared', () => {
  it('finds the path running past a one-tile venue', () => {
    // A street along z = 1, with the bakery standing on the tile above it.
    const network = networkOf(
      flat([
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
    );
    const doors = doorsFor(venueAt(1, 0), nodeIndexFor(network)).nodes;
    expect(tilesOf(network, doors).toSorted()).toEqual(['0,1', '1,1', '2,1']);
  });

  it('finds nodes along every edge of a footprint that covers several tiles', () => {
    // A ring of paving right round a 2 x 3 building standing at 1,1.
    const paved: (readonly [number, number])[] = [];
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 4; z++) paved.push([x, z]);
    const network = networkOf(
      flat(paved.filter(([x, z]) => x === 0 || x === 3 || z === 0 || z === 4)),
    );
    const doors = tilesOf(network, doorsFor(venueAt(1, 1, 2, 3), nodeIndexFor(network)).nodes);
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
    expect(doorsFor(venueAt(1, 1), nodeIndexFor(network)).nodes).toEqual([]);
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
    const doors = doorsFor(venueAt(1, 1), nodeIndexFor(network)).nodes;
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
    expect(doorsFor(venueAt(1, 1), nodeIndexFor(network)).nodes).toEqual([]);
  });
});

/** A door in the middle of a venue's +z side, walked out of southwards. */
const southDoor = (venue: Venue): Venue['doors'][number] => ({
  x: venue.x,
  z: (venue.tileZ + venue.tilesZ) * TILE_VOXELS - 2,
  facing: 0,
});

/** A 2 x 2 bakery at 2,2 with paving right round it, one tile out. */
const ringed = (): { network: WalkNetwork; bakery: Venue } => {
  const paved: (readonly [number, number])[] = [];
  for (let x = 1; x <= 4; x++) {
    for (let z = 1; z <= 4; z++) if (x === 1 || x === 4 || z === 1 || z === 4) paved.push([x, z]);
  }
  return { network: networkOf(flat(paved)), bakery: venueAt(2, 2, 2, 2) };
};

describe('doorsFor, with doors declared', () => {
  it('gives only the tile the door faces into', () => {
    const { network, bakery } = ringed();
    const doors = doorsFor({ ...bakery, doors: [southDoor(bakery)] }, nodeIndexFor(network));
    // The door is on the east half of the south side, at x = 3.
    expect(doors.declared).toBe(true);
    expect(tilesOf(network, doors.nodes)).toEqual(['3,4']);
  });

  it('falls back to the ring when nothing is paved where the door faces', () => {
    const { bakery } = ringed();
    // The same ring with the tile in front of the door taken up.
    const paved = flat([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [1, 2],
      [4, 2],
      [1, 3],
      [4, 3],
      [1, 4],
      [2, 4],
      [4, 4],
    ]);
    const network = networkOf(paved);
    const doors = doorsFor({ ...bakery, doors: [southDoor(bakery)] }, nodeIndexFor(network));
    expect(doors.declared).toBe(false);
    expect(doors.nodes).toEqual(doorsFor(bakery, nodeIndexFor(network)).nodes);
    expect(doors.nodes.length).toBeGreaterThan(1);
  });

  it('gives both of two doors, sorted and once each', () => {
    const { network, bakery } = ringed();
    const west: Venue['doors'][number] = {
      x: bakery.tileX * TILE_VOXELS + 3,
      z: bakery.z,
      facing: 3,
    };
    // The south door twice over, as two doors on one tile would be.
    const doors = doorsFor(
      { ...bakery, doors: [southDoor(bakery), west, southDoor(bakery)] },
      nodeIndexFor(network),
    );
    expect(doors.declared).toBe(true);
    expect(tilesOf(network, doors.nodes).toSorted()).toEqual(['1,3', '3,4']);
    expect([...doors.nodes].toSorted((a, b) => a - b)).toEqual(doors.nodes);
  });

  it('behaves exactly as it always did for a venue with none declared', () => {
    const { network, bakery } = ringed();
    const doors = doorsFor(bakery, nodeIndexFor(network));
    expect(doors.declared).toBe(false);
    // Every tile of the ring, which is the whole of the paving here.
    expect(doors.nodes).toHaveLength(12);
  });
});

/** The centre of a tile, along either axis, in voxels. */
const centre = (tile: number): number => (tile + 0.5) * TILE_VOXELS;

describe('doorsFor, on the beach', () => {
  // Water from z = 18; six rows of sand in front of it, so z = 12..17 is beach.
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  /** A boardwalk down to the back of the sand, so the beach has a gate and no more. */
  const boardwalk = flat([
    [10, 9],
    [10, 10],
    [10, 11],
  ]);
  const beachOf = (obstacles: ObstacleBox[] = []): WalkNetwork =>
    walkNetworkFor({ paved: boardwalk, levelOf: FLAT, shore, tilesX: 20, obstacles });

  it('gives a shower on the sand with no doors the open tiles round it, and no nodes', () => {
    const shower = venueAt(4, 14);
    // A lounger on the tile east of it: that one is not open.
    const lounger = { x: 5 * TILE_VOXELS + 4, z: 14 * TILE_VOXELS + 4, width: 8, depth: 8 };
    const network = beachOf([
      lounger,
      { x: 4 * TILE_VOXELS, z: 14 * TILE_VOXELS, width: 16, depth: 16 },
    ]);
    const doors = doorsFor(shower, nodeIndexFor(network), network);
    expect(doors.nodes).toEqual([]);
    expect(doors.sand).toHaveLength(7);
    expect(doors.sand).not.toContainEqual({ x: centre(5), z: centre(14) });
    expect(doors.sand).toContainEqual({ x: centre(4), z: centre(15) });
    expect(doors.sand).not.toContainEqual({ x: centre(4), z: centre(14) });
  });

  it('gives a beach club with a door down to the sand the tile in front of it', () => {
    const club = { ...venueAt(4, 12, 3, 2) };
    const door = { x: 5.5 * TILE_VOXELS, z: 14 * TILE_VOXELS - 1, facing: 0 as const };
    const network = beachOf();
    const doors = doorsFor({ ...club, doors: [door] }, nodeIndexFor(network), network);
    expect(doors.sand).toEqual([{ x: centre(5), z: centre(14) }]);
  });

  it('gives a bakery on the grass no sand, and exactly what it gave before', () => {
    const { network: inland, bakery } = ringed();
    const coastal = walkNetworkFor({
      paved: inland.nodes.map((node) => ({ tileX: node.tileX, tileZ: node.tileZ, y: 0 })),
      levelOf: FLAT,
      shore,
      tilesX: 20,
    });
    const index = nodeIndexFor(coastal);
    const doors = doorsFor(bakery, index, coastal);
    expect(doors.sand).toEqual([]);
    expect(doors.nodes).toEqual(doorsFor(bakery, index).nodes);
    expect(doors.declared).toBe(false);
  });
});
