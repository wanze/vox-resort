// Rails claim no tile, so the occupancy index cannot find them. This index is the
// only writer of the plot's rail array, so the two can never disagree.

import type { Placement } from '../../layout/domain/resortLayout';
import { tileKey } from '../../layout/domain/resortLayout';

export interface RailIndex {
  at(tileX: number, tileZ: number): readonly Placement[];
  add(rail: Placement): void;
  remove(rail: Placement): boolean;
}

const EMPTY: readonly Placement[] = Object.freeze([]);

// Mutates the plot's own array in place so the plot sees every change; removal
// swaps the last rail into the hole because rail order carries no meaning.
export function createRailIndex(rails: Placement[]): RailIndex {
  const byTile = new Map<string, Placement[]>();
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
      // The standing rail's tile, not the argument's: a stale copy under the same
      // key still takes down what is actually there.
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
