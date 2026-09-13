/**
 * Which tiles of a crossing are its ends, and which way the crossing runs.
 *
 * The fourth of the rules that read the ground rather than the plan, and the
 * exact shape of the first: `ground.ts` decides what a tile is paved *with*,
 * `stairs.ts` decides where that paving climbs, `railings.ts` decides where it
 * needs holding on to, and this decides where a span comes ashore. All of them
 * are derived, so a path drawn by hand crosses a river the way a generated one
 * does and nothing is authored twice.
 *
 * **A bridge is raised, and that is the whole reason this module exists.** A
 * jetty stands at the sea's own height and needs no rule: every tile of a pier
 * is the same tile. A bridge's deck stands `BRIDGE_VOXELS` up — see
 * `voxel-gen/voxelgen.ts` for why a metre, and `models/bridge.ts` for what it
 * buys — so a crossing has *ends*, and an end is a different model from a
 * middle. This is the question that tells them apart:
 *
 * - **A ramp** is a tile of the span with paved ground that is not itself span
 *   beside it: the bank. It is turned to face that bank, and it carries the
 *   climb from the paving up to the deck.
 * - **A deck** is every other tile of the span — the level middle. It is turned
 *   along the crossing, so its planks lie across the run. Its parapets are not
 *   its own: `railings.ts` stands them along whichever edges are open, which is
 *   what leaves a junction of two crossings, or a platform, open in the middle.
 *
 * A crossing of the river a bare plot is handed is two tiles wide, so it is two
 * ramps meeting at their heads and no deck at all. Decks are what a lake three
 * tiles or more across takes in the middle. Both cases fall out of the one rule
 * rather than being written down.
 *
 * **The turn points at the bank, not at the climb.** That is the one place this
 * reads backwards from `stairs.ts`, and it is deliberate: a flight is named by
 * the higher ground it climbs *to*, and there is only ever one of those, where a
 * ramp is named by the shore it comes *off* and the deck it climbs to is simply
 * the rest of the span. `bridge-ramp.ts` is authored with its bank to the north
 * for the same reason a flight is authored climbing north.
 *
 * **A tile with banks on two sides is still a ramp**, facing the first of them
 * in compass order. That is the one-tile channel, and it is the L-bend of
 * `stairs.ts` a second time: one tile cannot come ashore twice, the fudge is
 * visible only where a path crosses a ditch a single tile wide, and a corner is
 * not a reason to refuse a whole resort.
 */

import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';
import { CLIMBS, type PavedProvider } from './stairs';

/**
 * Whether the ground under a tile is water a span would be *raised* over.
 *
 * Inland water and not the bay, which is the same question `paving.ts` asks to
 * choose between a bridge and a pier: the sea's span lies flat on it. Asked of
 * the ground rather than of what is standing there, so the answer does not
 * depend on the order a crossing was drawn in.
 */
export interface SpanProvider {
  (tileX: number, tileZ: number): boolean;
}

/** What a tile of a crossing is: its bank end, or the level middle. */
export type SpanKind = 'ramp' | 'deck';

/** A tile of a crossing, once the ground around it has said which kind it is. */
export interface SpanTile {
  readonly tile: Tile;
  /**
   * Quarter turns pointing at the bank for a ramp, and along the crossing for a
   * deck. A deck is symmetric about its own axis, so only the axis is read off
   * it and either of the two turns along it will do.
   */
  readonly rotation: Rotation;
  readonly kind: SpanKind;
}

/**
 * What the span on one tile is, and the way it faces.
 *
 * The whole rule, and the only place it lives. The tile itself is not asked
 * whether it is span or paved — every caller only ever asks about a tile it
 * already knows is both.
 */
export function spanAt(tile: Tile, isPaved: PavedProvider, isSpan: SpanProvider): SpanTile {
  const spanned = (dx: number, dz: number): boolean =>
    isPaved(tile.x + dx, tile.z + dz) && isSpan(tile.x + dx, tile.z + dz);
  const bank = CLIMBS.find(
    ({ dx, dz }) => isPaved(tile.x + dx, tile.z + dz) && !isSpan(tile.x + dx, tile.z + dz),
  );
  if (bank) return { tile, rotation: bank.rotation, kind: 'ramp' };

  // The crossing's own axis: the one with span on *both* sides, which is what
  // tells the run apart from the lane beside it where a crossing is two tiles
  // wide. Failing that, whichever single neighbour there is — a span one tile
  // long with nothing paved around it yet has no axis to read, and is laid
  // unturned until the tile beside it goes down. See `relaidBy` in `paving.ts`.
  const axis =
    CLIMBS.find(({ dx, dz }) => spanned(dx, dz) && spanned(-dx, -dz)) ??
    CLIMBS.find(({ dx, dz }) => spanned(dx, dz));
  return { tile, rotation: axis?.rotation ?? 0, kind: 'deck' };
}

/**
 * The spans among a set of paved tiles, in the order the tiles came in.
 *
 * Every tile is classified against the same set of paved tiles and the same
 * ground, so the answer does not depend on where the walk started: a tile of a
 * crossing either has a bank beside it or it does not.
 */
export function spanTilesFor(paved: readonly Tile[], isSpan: SpanProvider): SpanTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  return paved
    .filter((tile) => isSpan(tile.x, tile.z))
    .map((tile) => spanAt(tile, isPaved, isSpan));
}
