/**
 * What a bulldozer click takes away.
 *
 * A tile in, the key of the thing standing on it out — or null where nothing is.
 * The occupancy index is the only thing that knows, which is why it is kept as a
 * map rather than a set; see `tileOccupancy.ts`.
 *
 * Here rather than in the pointer because it is a rule, not a gesture: what may
 * and may not be taken away is a fact about the plot, and a rule in `domain/` is
 * one that can be tested without a canvas.
 *
 * **Everything that claims a tile may go**, and nothing else is ever offered.
 * Handrails claim no tile — a rail stands on the paving it guards — so no tile
 * answers with one, and none needs refusing: a rail comes and goes with the
 * paving under it, which is `handrails.ts` re-asked once that paving is up. The
 * ground is not demolished either; the spade already lowers it.
 */

import type { Tile } from '../../layout/domain/resortLayout';
import type { TileOccupancy } from './tileOccupancy';

export function demolishAt(tile: Tile, occupancy: TileOccupancy): string | null {
  return occupancy.keyAt(tile) ?? null;
}
