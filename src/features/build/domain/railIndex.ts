/**
 * The rails on the plot, keyed by the tile they guard.
 *
 * A rail claims no tile, so it is not in the occupancy index and there is
 * nowhere else it could be looked up — see `handrails.ts`. Scanning the plot's
 * whole rail list instead costs the size of the resort five times over per
 * edited tile, and a drag edits a tile per pointer move.
 *
 * The index is the only writer of the list it is built over. The plot keeps its
 * rails as a plain array because everything else iterates them, and two tables
 * kept in step by every caller are two tables waiting to disagree — so a rail
 * goes up or comes down here, and the array follows.
 */

import type { Placement } from '../../layout/domain/resortLayout';
import { tileKey } from '../../layout/domain/resortLayout';

export interface RailIndex {
  /** The rails standing on one tile, or an empty list. */
  at(tileX: number, tileZ: number): readonly Placement[];
  /** Stands one rail, appending it to the list the index was built over. */
  add(rail: Placement): void;
  /** Takes one rail out by key. False if nothing stood under it. */
  remove(rail: Placement): boolean;
}

/** Shared by every tile with nothing on it, so asking allocates nothing. */
const EMPTY: readonly Placement[] = Object.freeze([]);

/**
 * Indexes `rails` by tile, and keeps that same array current from then on.
 *
 * The array is mutated in place rather than copied: it is the plot's own list,
 * and the point is that the plot sees every change. A removal moves the last rail
 * into the hole rather than shuffling the rest down, because the order rails are
 * listed in carries no meaning — the same bargain `instancedWorld.ts` makes.
 */
export function createRailIndex(rails: Placement[]): RailIndex {
  const byTile = new Map<string, Placement[]>();
  // Where each key sits in `rails`, so a removal needs no scan of the plot.
  const positions = new Map<string, number>();

  const file = (rail: Placement, position: number): void => {
    if (positions.has(rail.key)) throw new Error(`A rail already stands under "${rail.key}"`);
    positions.set(rail.key, position);
    const tile = tileKey(rail.tileX, rail.tileZ);
    const onTile = byTile.get(tile);
    if (onTile) onTile.push(rail);
    else byTile.set(tile, [rail]);
  };

  for (const [position, rail] of rails.entries()) file(rail, position);

  return {
    at: (tileX, tileZ) => byTile.get(tileKey(tileX, tileZ)) ?? EMPTY,
    add(rail) {
      file(rail, rails.length);
      rails.push(rail);
    },
    remove(rail) {
      const position = positions.get(rail.key);
      if (position === undefined) return false;
      // The tile is the standing rail's, not the argument's: a caller holding a
      // stale copy under the same key still takes down what is actually there.
      const standing = rails[position]!;
      const last = rails.length - 1;
      if (position !== last) {
        const moved = rails[last]!;
        rails[position] = moved;
        positions.set(moved.key, position);
      }
      rails.length = last;
      positions.delete(rail.key);

      const tile = tileKey(standing.tileX, standing.tileZ);
      const onTile = byTile.get(tile)!;
      onTile.splice(
        onTile.findIndex((other) => other.key === rail.key),
        1,
      );
      if (onTile.length === 0) byTile.delete(tile);
      return true;
    },
  };
}
