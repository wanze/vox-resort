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
 * **Only what is standing.** The sea used to be seeded in here as ground held by
 * nobody, so the pointer refused it by the ordinary "something is already there"
 * rule rather than by a second rule written beside the first. A pier is what took
 * that away: once one thing can stand on water, what a tile of sea will take is a
 * fact about the *object*, and an index of tiles cannot hold a fact about
 * objects. The rule moved to `paving.ts` and `buildPlan.ts`, and this went back
 * to answering the one question it can answer — what is on a tile.
 */

import { tileKey, type Placement, type Tile } from '../../layout/domain/resortLayout';

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

  // Seeding through `claim` means the resort's own placements are checked by the
  // same rule an edit is: a plan that overlaps fails here rather than quietly
  // making a tile un-buildable later.
  for (const placement of placements) occupancy.claim(placement, placement.key);
  return occupancy;
}
