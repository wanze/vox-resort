import { tileKey, type Placement, type Tile } from '../../layout/domain/resortLayout';

export interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export function footprintTiles(footprint: Footprint): Tile[] {
  const tiles: Tile[] = [];
  for (let z = footprint.tileZ; z < footprint.tileZ + footprint.tilesZ; z++) {
    for (let x = footprint.tileX; x < footprint.tileX + footprint.tilesX; x++) {
      tiles.push({ x, z });
    }
  }
  return tiles;
}

// A map rather than a set, so a double-booked tile names both claimants.
export interface TileOccupancy {
  isFree(footprint: Footprint): boolean;
  keyAt(tile: Tile): string | undefined;
  claim(footprint: Footprint, key: string): void;
  release(footprint: Footprint, key: string): void;
  readonly size: number;
}

export function createTileOccupancy(placements: readonly Placement[] = []): TileOccupancy {
  const byTile = new Map<string, string>();

  const occupancy: TileOccupancy = {
    isFree(footprint) {
      return footprintTiles(footprint).every((tile) => !byTile.has(tileKey(tile.x, tile.z)));
    },
    keyAt(tile) {
      return byTile.get(tileKey(tile.x, tile.z));
    },
    claim(footprint, key) {
      const tiles = footprintTiles(footprint);
      for (const tile of tiles) {
        const taken = byTile.get(tileKey(tile.x, tile.z));
        if (taken) throw new Error(`"${key}" wants tile ${tile.x},${tile.z}, "${taken}" has it`);
      }
      for (const tile of tiles) byTile.set(tileKey(tile.x, tile.z), key);
    },
    release(footprint, key) {
      for (const tile of footprintTiles(footprint)) {
        const cell = tileKey(tile.x, tile.z);
        if (byTile.get(cell) === key) byTile.delete(cell);
      }
    },
    get size() {
      return byTile.size;
    },
  };

  // Seeding through `claim` makes an overlapping plan fail here instead of silently
  // leaving a tile un-buildable.
  for (const placement of placements) occupancy.claim(placement, placement.key);
  return occupancy;
}
