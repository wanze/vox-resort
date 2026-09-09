/**
 * What stands where, as the plot is edited.
 *
 * The layout's own `occupiedTiles` answers this for an *authored plan*, and it
 * throws when two things collide, because a plan that overlaps is a bug in the
 * plan. A build mode needs the other shape of the same question: a live index
 * that changes one placement at a time, and that answers "can this go here?"
 * with a boolean rather than an exception — the pointer is over an occupied tile
 * for most of the time it is moving, and that is not an error, it is the cursor
 * turning red.
 *
 * One tile holds one thing, which is the invariant the layout already keeps: a
 * path is never paved under a building, and the dressing is scattered on tiles
 * that are neither. Footprints are what is indexed, so a 2x3 cottage blocks all
 * six of its tiles and not just its corner.
 *
 * Ground that can never hold anything — the sea — is seeded as reserved rather
 * than left out, so the pointer refuses it by the ordinary rule instead of by a
 * second one written next to the first.
 */

import { tileKey, type Placement, type Tile } from '../../layout/domain/resortLayout';

/**
 * The key tiles nothing can ever be built on are held under.
 *
 * A tile of sea is not free and is not something standing there either, so it
 * needs a holder of its own: the pointer asks the same question of it that it
 * asks of a cottage's tile, and gets the same answer.
 */
export const RESERVED_KEY = 'reserved';

/** A footprint on the tile grid: where it starts and how many tiles it claims. */
export interface Footprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

/** Every tile a footprint covers, row by row. */
export function footprintTiles(footprint: Footprint): Tile[] {
  const tiles: Tile[] = [];
  for (let z = footprint.tileZ; z < footprint.tileZ + footprint.tilesZ; z++) {
    for (let x = footprint.tileX; x < footprint.tileX + footprint.tilesX; x++) {
      tiles.push({ x, z });
    }
  }
  return tiles;
}

/**
 * The live tile index: tile -> key of the placement covering it.
 *
 * Kept as a map rather than a set so a future bulldozer can ask what it is about
 * to demolish, and so a double-booked tile is traceable to the two things that
 * wanted it.
 */
export interface TileOccupancy {
  /** Whether every tile of a footprint is free. */
  isFree(footprint: Footprint): boolean;
  /** The placement standing on a tile, if any. */
  keyAt(tile: Tile): string | undefined;
  /** Claims a footprint's tiles. Throws if any of them is already taken. */
  claim(footprint: Footprint, key: string): void;
  /** Gives a footprint's tiles back. Tiles held by something else are left alone. */
  release(footprint: Footprint, key: string): void;
  /** Tiles currently claimed. */
  readonly size: number;
}

export function createTileOccupancy(
  placements: readonly Placement[] = [],
  reserved: readonly Tile[] = [],
): TileOccupancy {
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

  // Reserved ground goes in first and is not checked: it is not a placement, and
  // a plan that stands something on the water has already been refused by
  // `layoutResort` long before an index is built over it.
  for (const tile of reserved) byTile.set(tileKey(tile.x, tile.z), RESERVED_KEY);
  // Seeding through `claim` means the resort's own placements are checked by the
  // same rule an edit is: a plan that overlaps fails here rather than quietly
  // making a tile un-buildable later.
  for (const placement of placements) occupancy.claim(placement, placement.key);
  return occupancy;
}
