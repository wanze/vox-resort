import type { TileRect } from '../../layout/domain/parkShapes';
import { shoreFor, waterEdgeZ, type ShoreSpec } from '../../layout/domain/shoreline';

const PARCEL_TILES = 16;
export const BARE_WORLD_TILES = 256;

const START_PARCELS_WIDE = 4;
// Inland of the beach, so the first gate, desk and a row of bungalows fit before any land is bought.
const START_LAND_TILES = 32;

export interface LandGrid {
  readonly parcelsX: number;
  readonly parcelsZ: number;
  readonly owned: Uint8Array<ArrayBuffer>;
}

export interface LandRights extends LandGrid {
  version: number;
}

export interface World {
  readonly tilesX: number;
  readonly tilesZ: number;
}

export const TILE_UNOWNED = 0;
export const TILE_OWNED = 1;
export const TILE_FOR_SALE = 2;

const parcelsAcross = (tiles: number): number => Math.ceil(tiles / PARCEL_TILES);

export function createLandRights(tilesX: number, tilesZ: number): LandRights {
  const parcelsX = parcelsAcross(tilesX);
  const parcelsZ = parcelsAcross(tilesZ);
  return { parcelsX, parcelsZ, owned: new Uint8Array(parcelsX * parcelsZ), version: 0 };
}

export function rightsOf(grid: LandGrid): LandRights {
  return {
    parcelsX: grid.parcelsX,
    parcelsZ: grid.parcelsZ,
    owned: grid.owned.slice(),
    version: 0,
  };
}

export function fitsWorld(grid: LandGrid, world: World): boolean {
  return (
    grid.parcelsX === parcelsAcross(world.tilesX) &&
    grid.parcelsZ === parcelsAcross(world.tilesZ) &&
    grid.owned.length === grid.parcelsX * grid.parcelsZ
  );
}

export function parcelOf(tileX: number, tileZ: number): { px: number; pz: number } {
  return { px: Math.floor(tileX / PARCEL_TILES), pz: Math.floor(tileZ / PARCEL_TILES) };
}

export function parcelRect(px: number, pz: number): TileRect {
  return {
    x0: px * PARCEL_TILES,
    x1: (px + 1) * PARCEL_TILES - 1,
    z0: pz * PARCEL_TILES,
    z1: (pz + 1) * PARCEL_TILES - 1,
  };
}

const insideGrid = (rights: LandGrid, px: number, pz: number): boolean =>
  px >= 0 && pz >= 0 && px < rights.parcelsX && pz < rights.parcelsZ;

function ownsParcel(rights: LandGrid, px: number, pz: number): boolean {
  return insideGrid(rights, px, pz) && rights.owned[pz * rights.parcelsX + px] === 1;
}

// Without rights even the apron past the plot is owned, so a generated resort builds and digs there
// as it always has.
export function ownsTile(
  rights: LandGrid | null,
  world: World,
  tileX: number,
  tileZ: number,
): boolean {
  if (!rights) return true;
  if (tileX < 0 || tileZ < 0 || tileX >= world.tilesX || tileZ >= world.tilesZ) return false;
  const { px, pz } = parcelOf(tileX, tileZ);
  return ownsParcel(rights, px, pz);
}

export interface TileBox {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

// A square footprint has no long side, so any side counts.
export function facesUnowned(rights: LandGrid, footprint: TileBox, world: World): boolean {
  const { tileX, tileZ, tilesX, tilesZ } = footprint;
  const unowned = (x: number, z: number): boolean => !ownsTile(rights, world, x, z);
  const row = (z: number): boolean =>
    Array.from({ length: tilesX }, (_, dx) => tileX + dx).every((x) => unowned(x, z));
  const column = (x: number): boolean =>
    Array.from({ length: tilesZ }, (_, dz) => tileZ + dz).every((z) => unowned(x, z));
  if (tilesX >= tilesZ && (row(tileZ - 1) || row(tileZ + tilesZ))) return true;
  return tilesZ >= tilesX && (column(tileX - 1) || column(tileX + tilesX));
}

export function forSale(rights: LandGrid, px: number, pz: number): boolean {
  if (!insideGrid(rights, px, pz) || ownsParcel(rights, px, pz)) return false;
  return (
    ownsParcel(rights, px - 1, pz) ||
    ownsParcel(rights, px + 1, pz) ||
    ownsParcel(rights, px, pz - 1) ||
    ownsParcel(rights, px, pz + 1)
  );
}

export function buyParcel(rights: LandRights, px: number, pz: number): void {
  if (!forSale(rights, px, pz)) return;
  rights.owned[pz * rights.parcelsX + px] = 1;
  rights.version++;
}

function clipped(rect: TileRect, world: World): TileRect {
  return {
    x0: rect.x0,
    x1: Math.min(rect.x1, world.tilesX - 1),
    z0: rect.z0,
    z1: Math.min(rect.z1, world.tilesZ - 1),
  };
}

// An empty grid answers the whole world rather than nothing, so a broken save still frames the plot.
export function ownedBounds(rights: LandGrid | null, world: World): TileRect {
  const whole = { x0: 0, x1: world.tilesX - 1, z0: 0, z1: world.tilesZ - 1 };
  if (!rights) return whole;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let pz = 0; pz < rights.parcelsZ; pz++) {
    for (let px = 0; px < rights.parcelsX; px++) {
      if (!ownsParcel(rights, px, pz)) continue;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      z0 = Math.min(z0, pz);
      z1 = Math.max(z1, pz);
    }
  }
  if (x0 === Infinity) return whole;
  const from = parcelRect(x0, z0);
  const to = parcelRect(x1, z1);
  return clipped({ x0: from.x0, x1: to.x1, z0: from.z0, z1: to.z1 }, world);
}

// Columns, end exclusive. A range, not a mask: owned land is one piece, so a gap is rare.
export interface TileSpan {
  readonly from: number;
  readonly to: number;
}

export function ownedSpan(rights: LandGrid | null, world: World): TileSpan {
  const bounds = ownedBounds(rights, world);
  return { from: bounds.x0, to: bounds.x1 + 1 };
}

export function ownedArea(rights: LandGrid | null, world: World): number {
  if (!rights) return world.tilesX * world.tilesZ;
  let area = 0;
  for (let pz = 0; pz < rights.parcelsZ; pz++) {
    for (let px = 0; px < rights.parcelsX; px++) {
      if (!ownsParcel(rights, px, pz)) continue;
      const rect = clipped(parcelRect(px, pz), world);
      area += (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
    }
  }
  return area;
}

export function tileMaskInto(rights: LandGrid | null, world: World, out: Uint8Array): void {
  const { tilesX, tilesZ } = world;
  if (!rights) {
    out.fill(TILE_OWNED, 0, tilesX * tilesZ);
    return;
  }
  for (let z = 0; z < tilesZ; z++) {
    const pz = Math.floor(z / PARCEL_TILES);
    for (let x = 0; x < tilesX; x++) {
      const px = Math.floor(x / PARCEL_TILES);
      out[z * tilesX + x] = ownsParcel(rights, px, pz)
        ? TILE_OWNED
        : forSale(rights, px, pz)
          ? TILE_FOR_SALE
          : TILE_UNOWNED;
    }
  }
}

export interface LandView {
  readonly forSale: number;
  readonly price: number;
  readonly owned: number;
}

export function landViewOf(rights: LandGrid | null, price: number): LandView {
  if (!rights) return { forSale: 0, price, owned: 0 };
  let sale = 0;
  let owned = 0;
  for (let pz = 0; pz < rights.parcelsZ; pz++) {
    for (let px = 0; px < rights.parcelsX; px++) {
      if (ownsParcel(rights, px, pz)) owned++;
      else if (forSale(rights, px, pz)) sale++;
    }
  }
  return { forSale: sale, price, owned };
}

// The block reaches down to the last row, so it owns its stretch of sea for piers.
export function startingLand(tilesX: number, tilesZ: number, spec?: ShoreSpec): LandGrid {
  const rights = createLandRights(tilesX, tilesZ);
  const wide = Math.min(START_PARCELS_WIDE, rights.parcelsX);
  const px0 = Math.floor((rights.parcelsX - wide) / 2);
  const shore = spec ? shoreFor({ tilesX, tilesZ, shore: spec }) : null;
  let top = tilesZ - START_LAND_TILES;
  if (shore) {
    let water = Infinity;
    const x1 = Math.min(tilesX, (px0 + wide) * PARCEL_TILES);
    for (let x = px0 * PARCEL_TILES; x < x1; x++) water = Math.min(water, waterEdgeZ(shore, x));
    top = Math.floor(water) - shore.spec.beach - START_LAND_TILES;
  }
  const pz0 = Math.min(rights.parcelsZ - 1, Math.max(0, Math.floor(top / PARCEL_TILES)));
  for (let pz = pz0; pz < rights.parcelsZ; pz++) {
    for (let px = px0; px < px0 + wide; px++) rights.owned[pz * rights.parcelsX + px] = 1;
  }
  return { parcelsX: rights.parcelsX, parcelsZ: rights.parcelsZ, owned: rights.owned };
}
