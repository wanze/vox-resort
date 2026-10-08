import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import { walkNetworkFor, type PavedTile } from '../../crowd/domain/walkNetwork';
import { shoreFor } from '../../layout/domain/shoreline';
import { doorsFor } from './doors';
import { flowFieldFor } from './flowField';
import type { Lodging } from './lodgings';
import { sandRoutesFor } from './sandRoute';
import { createVenueRoutes, SAND_ROUTE_TILES } from './venueRoutes';
import type { Venue } from './venues';

const shop = (key: string, tileX: number, tileZ: number): Venue => ({
  key,
  id: key.split('#')[0]!,
  label: key,
  role: 'food',
  satisfies: [{ need: 'hunger', amount: 0.5 }],
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

describe('venue routes on a small beach', () => {
  const shore = shoreFor({
    tilesX: 20,
    tilesZ: 20,
    shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
  });
  const paved: PavedTile[] = Array.from({ length: 8 }, (_, index) => ({
    tileX: 10,
    tileZ: 4 + index,
    y: 0,
  }));
  const network = walkNetworkFor({
    paved,
    levelOf: () => 0,
    shore,
    tilesX: 20,
    obstacles: [{ x: 4 * TILE_VOXELS, z: 14 * TILE_VOXELS, width: 16, depth: 16 }],
  });
  const pedalos: Venue = { ...shop('pedalo-rental#0', 4, 14), role: 'activity' };
  const kiosk = shop('kiosk#0', 11, 5);
  const hotel: Lodging = {
    key: 'hotel#0',
    id: 'hotel',
    label: 'Hotel',
    beds: 4,
    dwellSeconds: { min: 240, max: 480 },
    tileX: 11,
    tileZ: 7,
    tilesX: 1,
    tilesZ: 1,
    x: 11.5 * TILE_VOXELS,
    z: 7.5 * TILE_VOXELS,
    doors: [],
  };
  const index = nodeIndexFor(network);

  it('sweeps a lodging field once, as a direct sweep would, and the step-free one apart', () => {
    const routes = createVenueRoutes(network, [pedalos, kiosk], [hotel]);
    const field = routes.lodgingField(0, false);
    expect(field).toEqual(flowFieldFor(network, doorsFor(hotel, index).nodes));
    expect(routes.lodgingField(0, false)).toBe(field);
    expect(routes.sweeps).toBe(1);
    const stepFree = routes.lodgingField(0, true);
    expect(stepFree).not.toBe(field);
    expect(routes.lodgingField(0, true)).toBe(stepFree);
    expect(routes.sweeps).toBe(2);
  });

  it('routes over the sand to a building on it, and to nothing off the beach', () => {
    const routes = createVenueRoutes(network, [pedalos, kiosk], [hotel]);
    const overSand = routes.sandRoutesOf(0);
    expect(overSand.length).toBeGreaterThan(0);
    expect(overSand).toEqual(
      sandRoutesFor(network, doorsFor(pedalos, index, network).sand, SAND_ROUTE_TILES),
    );
    expect(routes.sandRoutesOf(0)).toBe(overSand);
    expect(routes.sandRoutesOf(1)).toEqual([]);
    expect(routes.sweeps).toBe(0);
  });
});
