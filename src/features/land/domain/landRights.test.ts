import { describe, expect, it } from 'vitest';
import { landPriceOf, LAND_PARCEL_COST } from '../../catalog/domain/prices';
import { emptyResortPlan } from '../../layout/domain/resortGenerator';
import {
  BARE_WORLD_TILES,
  buyParcel,
  createLandRights,
  facesUnowned,
  forSale,
  landViewOf,
  ownedArea,
  ownedBounds,
  ownsTile,
  parcelOf,
  parcelRect,
  rightsOf,
  startingLand,
  tileMaskInto,
  TILE_FOR_SALE,
  TILE_OWNED,
  TILE_UNOWNED,
  type LandGrid,
} from './landRights';

const WORLD = { tilesX: 64, tilesZ: 64 };

function ownedParcels(grid: LandGrid): { px: number; pz: number }[] {
  const parcels: { px: number; pz: number }[] = [];
  for (let pz = 0; pz < grid.parcelsZ; pz++) {
    for (let px = 0; px < grid.parcelsX; px++) {
      if (grid.owned[pz * grid.parcelsX + px] === 1) parcels.push({ px, pz });
    }
  }
  return parcels;
}

function withParcel(px: number, pz: number) {
  const rights = createLandRights(WORLD.tilesX, WORLD.tilesZ);
  rights.owned[pz * rights.parcelsX + px] = 1;
  return rights;
}

describe('startingLand', () => {
  it('owns a 4 by 5 block centred on the south edge of a bare world', () => {
    const plan = emptyResortPlan(BARE_WORLD_TILES, BARE_WORLD_TILES, 1);
    const grid = startingLand(plan.tilesX, plan.tilesZ, plan.shore);
    const parcels = ownedParcels(grid);
    expect(parcels).toHaveLength(20);
    expect(new Set(parcels.map(({ px }) => px))).toEqual(new Set([6, 7, 8, 9]));
    expect(Math.max(...parcels.map(({ pz }) => pz))).toBe(15);
    expect(Math.min(...parcels.map(({ pz }) => pz))).toBe(11);
  });

  it('reaches further inland when the island deepens the bay', () => {
    const plain = emptyResortPlan(BARE_WORLD_TILES, BARE_WORLD_TILES, 1);
    const island = emptyResortPlan(BARE_WORLD_TILES, BARE_WORLD_TILES, 1, { island: true });
    const plainRows = ownedParcels(startingLand(256, 256, plain.shore)).length / 4;
    const islandRows = ownedParcels(startingLand(256, 256, island.shore)).length / 4;
    expect(islandRows).toBeGreaterThan(plainRows);
  });
});

describe('forSale', () => {
  it('sells a side neighbour of owned land but not a diagonal one', () => {
    const rights = withParcel(1, 1);
    expect(forSale(rights, 2, 1)).toBe(true);
    expect(forSale(rights, 1, 0)).toBe(true);
    expect(forSale(rights, 2, 2)).toBe(false);
  });

  it('sells nothing already owned or outside the world', () => {
    const rights = withParcel(0, 0);
    expect(forSale(rights, 0, 0)).toBe(false);
    expect(forSale(rights, -1, 0)).toBe(false);
    expect(forSale(rights, 0, -1)).toBe(false);
  });
});

describe('buyParcel', () => {
  it('does nothing for a parcel that is not for sale', () => {
    const rights = withParcel(1, 1);
    buyParcel(rights, 3, 3);
    expect(ownedParcels(rights)).toEqual([{ px: 1, pz: 1 }]);
    expect(rights.version).toBe(0);
  });

  it('owns the parcel and grows the bounds and area', () => {
    const rights = withParcel(1, 1);
    buyParcel(rights, 2, 1);
    expect(rights.version).toBe(1);
    expect(ownedBounds(rights, WORLD)).toEqual({ x0: 16, x1: 47, z0: 16, z1: 31 });
    expect(ownedArea(rights, WORLD)).toBe(2 * 16 * 16);
  });
});

describe('ownsTile', () => {
  it('owns everything without rights, the apron past the plot included', () => {
    expect(ownsTile(null, WORLD, 0, 63)).toBe(true);
    expect(ownsTile(null, WORLD, 64, 0)).toBe(true);
    expect(ownsTile(null, WORLD, -1, 0)).toBe(true);
  });

  it('owns nothing outside the world with rights', () => {
    const rights = withParcel(0, 0);
    expect(ownsTile(rights, WORLD, -1, 0)).toBe(false);
  });

  it('owns the tiles of an owned parcel only', () => {
    const rights = withParcel(1, 1);
    expect(ownsTile(rights, WORLD, 16, 16)).toBe(true);
    expect(ownsTile(rights, WORLD, 31, 31)).toBe(true);
    expect(ownsTile(rights, WORLD, 32, 31)).toBe(false);
  });
});

describe('facesUnowned', () => {
  // Owns the parcel at (1, 1); a gate's long side along z = 16 looks out over the parcel above.
  const rights = withParcel(1, 1);

  it('faces the edge along a long side, in either turn', () => {
    expect(facesUnowned(rights, { tileX: 20, tileZ: 16, tilesX: 4, tilesZ: 1 }, WORLD)).toBe(true);
    expect(facesUnowned(rights, { tileX: 16, tileZ: 20, tilesX: 1, tilesZ: 4 }, WORLD)).toBe(true);
  });

  it('does not count an edge along its short end only', () => {
    expect(facesUnowned(rights, { tileX: 28, tileZ: 20, tilesX: 4, tilesZ: 1 }, WORLD)).toBe(false);
    expect(facesUnowned(rights, { tileX: 20, tileZ: 28, tilesX: 1, tilesZ: 4 }, WORLD)).toBe(false);
  });

  it('does not count a side with one owned tile in the row', () => {
    const corner = withParcel(1, 1);
    corner.owned[1] = 1;
    corner.owned[2] = 1;
    expect(facesUnowned(corner, { tileX: 30, tileZ: 16, tilesX: 4, tilesZ: 1 }, WORLD)).toBe(false);
  });

  it('faces the edge of the world', () => {
    const edge = withParcel(0, 0);
    expect(facesUnowned(edge, { tileX: 4, tileZ: 0, tilesX: 4, tilesZ: 1 }, WORLD)).toBe(true);
    expect(facesUnowned(edge, { tileX: 0, tileZ: 4, tilesX: 1, tilesZ: 4 }, WORLD)).toBe(true);
  });

  it('takes any side of a square footprint', () => {
    expect(facesUnowned(rights, { tileX: 29, tileZ: 20, tilesX: 3, tilesZ: 3 }, WORLD)).toBe(true);
    expect(facesUnowned(rights, { tileX: 20, tileZ: 20, tilesX: 3, tilesZ: 3 }, WORLD)).toBe(false);
  });
});

describe('tileMaskInto', () => {
  it('marks owned, for sale and unowned tiles at a parcel edge', () => {
    const rights = withParcel(1, 1);
    const mask = new Uint8Array(WORLD.tilesX * WORLD.tilesZ);
    tileMaskInto(rights, WORLD, mask);
    expect(mask[16 * 64 + 31]).toBe(TILE_OWNED);
    expect(mask[16 * 64 + 32]).toBe(TILE_FOR_SALE);
    expect(mask[15 * 64 + 15]).toBe(TILE_UNOWNED);
  });

  it('marks every tile owned without rights', () => {
    const mask = new Uint8Array(4);
    tileMaskInto(null, { tilesX: 2, tilesZ: 2 }, mask);
    expect([...mask]).toEqual([1, 1, 1, 1]);
  });
});

describe('a world that is not a multiple of a parcel', () => {
  const world = { tilesX: 40, tilesZ: 20 };

  it('rounds the last parcel up and clips it to the world', () => {
    const rights = createLandRights(world.tilesX, world.tilesZ);
    expect(rights.parcelsX).toBe(3);
    expect(rights.parcelsZ).toBe(2);
    rights.owned[1 * 3 + 2] = 1;
    expect(ownedBounds(rights, world)).toEqual({ x0: 32, x1: 39, z0: 16, z1: 19 });
    expect(ownedArea(rights, world)).toBe(8 * 4);
    expect(ownsTile(rights, world, 39, 19)).toBe(true);
    expect(ownsTile(rights, world, 40, 19)).toBe(false);
  });
});

describe('parcels', () => {
  it('maps tiles to parcels and back', () => {
    expect(parcelOf(17, 47)).toEqual({ px: 1, pz: 2 });
    expect(parcelRect(1, 2)).toEqual({ x0: 16, x1: 31, z0: 32, z1: 47 });
  });

  it('copies a grid so buying does not touch the plan it came from', () => {
    const grid = withParcel(0, 0);
    const rights = rightsOf(grid);
    buyParcel(rights, 1, 0);
    expect(ownedParcels(grid)).toHaveLength(1);
  });
});

describe('landViewOf', () => {
  it('counts parcels owned and for sale', () => {
    expect(landViewOf(withParcel(1, 1), 100)).toEqual({ forSale: 4, price: 100, owned: 1 });
    expect(landViewOf(null, 100)).toEqual({ forSale: 0, price: 100, owned: 0 });
  });
});

describe('landPriceOf', () => {
  it('charges a parcel in tycoon and nothing in sandbox', () => {
    expect(landPriceOf('tycoon')).toBe(LAND_PARCEL_COST);
    expect(landPriceOf('sandbox')).toBe(0);
  });
});
