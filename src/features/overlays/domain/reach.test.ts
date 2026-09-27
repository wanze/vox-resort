import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { shoreFor } from '../../layout/domain/shoreline';
import { doorsFor } from '../../sim/domain/doors';
import { flowFieldFor } from '../../sim/domain/flowField';
import type { Venue } from '../../sim/domain/venues';
import { hopsFrom, reachSeedsFor } from './reach';

const street = (length: number): WalkNetwork =>
  walkNetworkFor({
    paved: Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 })),
    levelOf: () => 0,
    shore: null,
    tilesX: 20,
  });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

const alongStreet = (network: WalkNetwork, hops: Int32Array): number[] =>
  Array.from({ length: network.nodes.length }, (_, tileX) => hops[nodeAt(network, tileX)]!);

const barAt = (tileX: number, tileZ: number, need: 'thirst' | 'hunger' = 'thirst'): Venue => ({
  key: `bar#${tileX}`,
  id: 'bar',
  label: 'Bar',
  role: 'drink',
  satisfies: [{ need, amount: 0.5 }],
  capacity: 8,
  dwellSeconds: { min: 240, max: 480 },
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  doors: [],
});

describe('hopsFrom', () => {
  it('gives what flowFieldFor gives when every seed starts at 0', () => {
    const network = street(6);
    const sources = [nodeAt(network, 0), nodeAt(network, 4)];
    const hops = hopsFrom(
      network,
      sources.map((node) => ({ node, hops: 0 })),
    );
    expect([...hops]).toEqual([...flowFieldFor(network, sources).hops]);
  });

  it('counts a seed that starts further out from its own distance', () => {
    const network = street(6);
    const hops = hopsFrom(network, [
      { node: nodeAt(network, 0), hops: 0 },
      { node: nodeAt(network, 5), hops: 3 },
    ]);
    expect(alongStreet(network, hops)).toEqual([0, 1, 2, 3, 4, 3]);
  });

  it('keeps the nearer distance where a far seed stands on a node reached sooner', () => {
    const network = street(3);
    const hops = hopsFrom(network, [
      { node: nodeAt(network, 1), hops: 5 },
      { node: nodeAt(network, 0), hops: 0 },
    ]);
    expect(alongStreet(network, hops)).toEqual([0, 1, 2]);
  });

  it('skips a seed off the graph and leaves the unreached at -1', () => {
    const network = street(2);
    expect([...hopsFrom(network, [{ node: 9, hops: 0 }])]).toEqual([-1, -1]);
  });
});

describe('reachSeedsFor', () => {
  it('seeds the door of a venue on the paving at 0, and nothing for a need it does not serve', () => {
    const network = street(4);
    const index = nodeIndexFor(network);
    const bar = barAt(2, 1);
    const doors = doorsFor(bar, index, network).nodes;
    expect(doors.length).toBeGreaterThan(0);
    expect(reachSeedsFor([bar], 'thirst', network, index)).toEqual(
      doors.map((node) => ({ node, hops: 0 })),
    );
    expect(reachSeedsFor([bar], 'hunger', network, index)).toEqual([]);
  });

  it('seeds a bar on the sand at the gate it is walked to from, as far out as the walk', () => {
    const shore = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
    });
    const paved: PavedTile[] = Array.from({ length: 6 }, (_, at) => ({
      tileX: 10,
      tileZ: 6 + at,
      y: 0,
    }));
    const network = walkNetworkFor({ paved, levelOf: () => 0, shore, tilesX: 20 });
    const seeds = reachSeedsFor([barAt(4, 14)], 'thirst', network, nodeIndexFor(network));
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.node).toBe(network.gates[0]);
    expect(seeds[0]!.hops).toBeGreaterThan(3);
  });
});
