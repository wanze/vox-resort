import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import type { LevelProvider } from '../../layout/domain/elevation';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Placement } from '../../layout/domain/resortLayout';
import { doorsFor } from './doors';
import { gatewaysOn } from './gateways';

const FLAT: LevelProvider = () => 0;

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 20 });

const gateAt = (key: string, tileX: number, tileZ: number): Placement => ({
  key,
  id: 'entrance',
  tileX,
  tileZ,
  tilesX: 4,
  tilesZ: 1,
  rotation: 0,
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  width: 4 * TILE_VOXELS,
  depth: TILE_VOXELS,
});

const bakeryAt = (tileX: number, tileZ: number): Placement => ({
  ...gateAt('bakery#0', tileX, tileZ),
  id: 'bakery',
  tilesX: 2,
  tilesZ: 2,
  width: 2 * TILE_VOXELS,
  depth: 2 * TILE_VOXELS,
});

const tilesOf = (network: WalkNetwork, nodes: readonly number[]): string[] =>
  nodes.map((node) => `${network.nodes[node]!.tileX},${network.nodes[node]!.tileZ}`).toSorted();

describe('gatewaysOn', () => {
  it('finds the gates the art declares, and nothing else standing on the plot', () => {
    const gateways = gatewaysOn([
      gateAt('entrance#0', 2, 3),
      bakeryAt(8, 8),
      gateAt('entrance#1', 12, 3),
    ]);
    expect(gateways.map((gateway) => gateway.key)).toEqual(['entrance#0', 'entrance#1']);
    expect(gateways[0]).toEqual({
      key: 'entrance#0',
      tileX: 2,
      tileZ: 3,
      tilesX: 4,
      tilesZ: 1,
      x: 2 * TILE_VOXELS + (4 * TILE_VOXELS) / 2,
      z: 3 * TILE_VOXELS + TILE_VOXELS / 2,
      doors: [],
    });
  });

  it('gives an empty list for a plot with no gate on it', () => {
    expect(gatewaysOn([bakeryAt(8, 8)])).toEqual([]);
    expect(gatewaysOn([])).toEqual([]);
  });

  it('hands straight to doorsFor and comes back with the paving either side of it', () => {
    const paved: PavedTile[] = [];
    for (let tileX = 2; tileX <= 5; tileX++) {
      for (const tileZ of [2, 4]) paved.push({ tileX, tileZ, y: 0 });
    }
    const network = networkOf(paved);
    const gateway = gatewaysOn([gateAt('entrance#0', 2, 3)])[0]!;

    const doors = doorsFor(gateway, nodeIndexFor(network));
    expect(doors.declared, 'a gate declares no door, so the ring is the way through').toBe(false);
    expect(tilesOf(network, doors.nodes)).toEqual([
      '2,2',
      '2,4',
      '3,2',
      '3,4',
      '4,2',
      '4,4',
      '5,2',
      '5,4',
    ]);
  });
});
