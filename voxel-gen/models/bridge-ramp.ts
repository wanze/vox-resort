/**
 * Bridge ramp tile: the end of a span — four treads of decking climbing off the
 * bank to the height `bridge.ts` runs level at, on an abutment at the bank end
 * and piles under the rest.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * **Where it stands.** On the tile of *water* nearest the bank, turned so that
 * its turn points at the bank. Unturned the bank is to the north (z = 0), and a
 * turn of one swings that round to the west — the same convention `stairs.ts`
 * climbs by and `railing.ts` guards by, so one model and a quarter turn cover
 * all four ways a crossing can come ashore. Note that the turn points at the
 * **foot** of this climb where a flight's points at its head: a flight is named
 * by what it climbs to, and a ramp by the bank it comes off.
 *
 * **Why it lines up.** Both ends are derived rather than typed in:
 *
 * - The lowest tread stands one voxel above `path.ts`'s slab, exactly as the
 *   lowest tread of `stairs.ts` does, so you step up onto it off the paving that
 *   runs into it.
 * - The highest is `BRIDGE_VOXELS`, which is what `bridge.ts` lays its planks
 *   at, so a ramp and the deck it hands over to are one surface.
 *
 * Between them that is a rise of four voxels in four treads of four voxels'
 * going — a metre up over four metres, which is a ramp somebody pushing a
 * buggy can get up and is nothing like the 1-in-2 a terrace step takes.
 *
 * **Its parapets are two models of their own**, `bridge-ramp-railing-left` and
 * `-right`, stood by `railings.ts` on whichever flank has nothing paved beside
 * it. Two rather than one turned, because the parapet up one flank of a climb is
 * the mirror of the one up the other, and no quarter turn is a mirror. See
 * `parts/span.ts`.
 *
 * Nobody picks it either: it is what a path becomes on the last tile of water
 * before the bank. See `groundDecides` below, and `spans.ts` for the rule.
 */
import { PALETTE } from '../palette.ts';
import {
  FLANK,
  RAMP_GOING,
  RAMP_TREADS,
  rampPlanksAt,
  spanDeck,
  spanPiles,
} from '../parts/span.ts';
import { defineModel, PAVING_VOXELS, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'bridge-ramp',
  label: 'Bridge Ramp',
  category: 'grounds',
  // Never picked: a ramp is what the bank end of a crossing becomes, so the
  // palette leaves it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { teak } = PALETTE;
    const N = TILE_VOXELS - 1;

    // Lowest tread at the north edge, climbing away from the bank.
    for (let step = 0; step < RAMP_TREADS; step++) {
      const z0 = step * RAMP_GOING;
      spanDeck(b, { y: rampPlanksAt(z0), z0, z1: z0 + RAMP_GOING - 1 });
    }

    // The abutment: every layer under the lowest tread's beam, because what the
    // bank end lands on is ground rather than the channel. Held in off both
    // flanks by the depth of a railing's trestle, which stands in exactly those
    // columns wherever the flank is railed.
    b.box(FLANK, N - FLANK, 0, PAVING_VOXELS - 2, 0, RAMP_GOING - 1, teak.deep);

    // One row of piles under each of the two highest treads, which are the ones
    // with enough air under them to need holding up.
    for (const step of [RAMP_TREADS - 2, RAMP_TREADS - 1]) {
      const z0 = step * RAMP_GOING;
      spanPiles(b, { beam: rampPlanksAt(z0) - 1, rows: [z0] });
    }
  },
});
