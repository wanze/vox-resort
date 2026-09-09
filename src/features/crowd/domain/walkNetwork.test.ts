import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createRandom } from '../../layout/domain/random';
import {
  beachPointAt,
  walkingSurface,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
} from './walkNetwork';

/** A flat run of paved tiles along z, all at sea level. */
const flat = (tiles: readonly (readonly [number, number])[]): PavedTile[] =>
  tiles.map(([tileX, tileZ]) => ({ tileX, tileZ, y: 0 }));

/** Everything at sea level. */
const FLAT: LevelProvider = () => 0;

/** One terrace behind z = 0, so a step runs across the plot at z = 1. */
const STEP_AT_Z1: LevelProvider = (_x, z) => (z <= 0 ? 1 : 0);

/** Higher ground both north and west, which is a path turning on a step. */
const CORNER: LevelProvider = (x, z) => (z <= 0 || x <= 0 ? 1 : 0);

/** Two levels in one step, which no flight could climb. */
const CLIFF_AT_Z1: LevelProvider = (_x, z) => (z <= 0 ? 2 : 0);

const nodeAt = (network: WalkNetwork, x: number, z: number): number =>
  network.nodes.findIndex((node) => node.tileX === x && node.tileZ === z);

/** The tiles a node can be walked to from here. */
const reachable = (network: WalkNetwork, from: number): string[] =>
  network.nodes[from]!.exits.map((edge) => {
    const to = network.nodes[network.edges[edge]!.to]!;
    return `${to.tileX},${to.tileZ}`;
  }).toSorted();

describe('walkNetworkFor', () => {
  it('joins paved neighbours and leaves the diagonals alone', () => {
    // A plus: the centre reaches all four arms, and no arm reaches another.
    const network = walkNetworkFor({
      paved: flat([
        [1, 1],
        [0, 1],
        [2, 1],
        [1, 0],
        [1, 2],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(reachable(network, nodeAt(network, 1, 1))).toEqual(['0,1', '1,0', '1,2', '2,1']);
    expect(reachable(network, nodeAt(network, 0, 1))).toEqual(['1,1']);
  });

  it('stores every adjacency in both directions', () => {
    const network = walkNetworkFor({
      paved: flat([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(network.edges).toHaveLength(4);
    for (const edge of network.edges) {
      const back = network.edges.find((other) => other.from === edge.to && other.to === edge.from);
      expect(back, `${edge.from} -> ${edge.to} has no way back`).toBeDefined();
    }
  });

  it('stands a node on the top of its own paving, not on the ground', () => {
    const network = walkNetworkFor({
      paved: [{ tileX: 3, tileZ: 4, y: LEVEL_VOXELS }],
      levelOf: FLAT,
      shore: null,
      tilesX: 8,
    });
    const node = network.nodes[0]!;
    expect(node.y).toBe(walkingSurface(LEVEL_VOXELS));
    expect([node.x, node.z]).toEqual([3.5 * TILE_VOXELS, 4.5 * TILE_VOXELS]);
  });

  describe('a step between two terraces', () => {
    // z = 0 is the upper terrace and z = 1 the lower, so the flight sits on
    // (0, 1) and climbs north — which is what `stairs.ts` decides for it.
    const levelOf = STEP_AT_Z1;
    const paved = [
      { tileX: 0, tileZ: 0, y: LEVEL_VOXELS },
      { tileX: 0, tileZ: 1, y: 0 },
    ];

    it('lets a person climb the flight, in both directions', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      expect(network.edges).toHaveLength(2);
      expect(reachable(network, nodeAt(network, 0, 1))).toEqual(['0,0']);
      expect(reachable(network, nodeAt(network, 0, 0))).toEqual(['0,1']);
    });

    it('measures the climb rather than the tile, so stairs take longer', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      expect(network.edges[0]!.length).toBeCloseTo(Math.hypot(TILE_VOXELS, LEVEL_VOXELS));
    });

    it('carries the climb in the two node heights, so a walk up it is a lerp', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      const lower = network.nodes[nodeAt(network, 0, 1)]!;
      const upper = network.nodes[nodeAt(network, 0, 0)]!;
      expect(upper.y - lower.y).toBe(LEVEL_VOXELS);
    });
  });

  it('refuses the side of a staircase, where a path turns on a step', () => {
    // The corner (1, 1) is low with higher paved ground both north and west, so
    // one tile would have to climb two ways. `stairs.ts` gives it the first by
    // compass order — north — and the pair to the west is then a wall.
    const network = walkNetworkFor({
      paved: [
        { tileX: 1, tileZ: 1, y: 0 },
        { tileX: 1, tileZ: 0, y: LEVEL_VOXELS },
        { tileX: 0, tileZ: 1, y: LEVEL_VOXELS },
      ],
      levelOf: CORNER,
      shore: null,
      tilesX: 4,
    });
    expect(reachable(network, nodeAt(network, 1, 1))).toEqual(['1,0']);
    expect(reachable(network, nodeAt(network, 0, 1))).toEqual([]);
  });

  it('refuses a drop of more than one level, which no flight could climb', () => {
    const network = walkNetworkFor({
      paved: [
        { tileX: 0, tileZ: 0, y: LEVEL_VOXELS * 2 },
        { tileX: 0, tileZ: 1, y: 0 },
      ],
      levelOf: CLIFF_AT_Z1,
      shore: null,
      tilesX: 4,
    });
    expect(network.edges).toEqual([]);
  });
});

describe('the gates onto the beach', () => {
  // Water from z = 8, four rows of sand in front of it: z = 4..7 is beach.
  const shore = shoreFor({
    tilesX: 10,
    tilesZ: 10,
    shore: { inset: 1, beach: 4, wave: 0, seed: 1 },
  });

  it('finds none on a plot with no coast', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(network.gates).toEqual([]);
    expect(network.beach).toBeNull();
  });

  it('opens a gate where paving has open sand beside it', () => {
    const network = walkNetworkFor({
      // A boardwalk running down into the sand, and one tile up on the grass.
      paved: flat([
        [5, 3],
        [5, 4],
        [5, 5],
      ]),
      levelOf: FLAT,
      shore,
      tilesX: 10,
    });
    // (5, 3) is on grass but touches the first row of sand at (5, 4)... which is
    // paved, so it is not open. Its neighbours (4, 3) and (6, 3) are grass.
    expect(network.nodes[nodeAt(network, 5, 3)]!.gate).toBe(false);
    // The two on the sand have open sand either side of them.
    expect(network.nodes[nodeAt(network, 5, 4)]!.gate).toBe(true);
    expect(network.nodes[nodeAt(network, 5, 5)]!.gate).toBe(true);
    expect(network.gates).toHaveLength(2);
  });
});

describe('beachPointAt', () => {
  const shore = shoreFor({
    tilesX: 40,
    tilesZ: 30,
    shore: { inset: 3, beach: 5, wave: 2, seed: 4 },
  })!;
  const beach = { shore, tilesX: 40 };

  it('lands on sand, in every column, however the coast wanders', () => {
    const random = createRandom(12);
    for (let draw = 0; draw < 400; draw++) {
      const point = beachPointAt(beach, random);
      const tileX = Math.floor(point.x / TILE_VOXELS);
      const tileZ = Math.floor(point.z / TILE_VOXELS);
      expect(tileX, 'off the west or east end of the plot').toBeGreaterThanOrEqual(0);
      expect(tileX, 'off the west or east end of the plot').toBeLessThan(40);
      // Asked of the shore itself rather than of our own arithmetic: the whole
      // point is that a roamer never has to.
      expect(terrainAt(shore, tileX, tileZ), `${tileX},${tileZ}`).toBe('beach');
    }
  });

  it('spreads over the sand rather than over the tile centres', () => {
    const random = createRandom(5);
    const xs = new Set<number>();
    for (let draw = 0; draw < 50; draw++) xs.add(beachPointAt(beach, random).x % TILE_VOXELS);
    expect(xs.size).toBeGreaterThan(40);
  });

  it('replays the same beach for the same seed', () => {
    const walk = (): number[] => {
      const random = createRandom(9);
      return Array.from({ length: 20 }, () => beachPointAt(beach, random)).flatMap((point) => [
        point.x,
        point.z,
      ]);
    };
    expect(walk()).toEqual(walk());
  });
});
