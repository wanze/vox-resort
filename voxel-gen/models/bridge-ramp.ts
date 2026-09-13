/**
 * Bridge ramp tile: the end of a span — four treads of decking climbing off the
 * bank to the height `bridge.ts` runs level at, on an abutment rather than on
 * trestles, with the parapet stepping up beside them.
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
 * buggy can get up and is nothing like the 1-in-2 a terrace step takes. A
 * crossing two tiles wide is two of these meeting at their heads, and there the
 * pitch matters: back to back they are a 2 m rise and fall across 8 m, and any
 * steeper would be a humpback.
 *
 * **The abutment is solid where the deck is open.** The trestles under
 * `bridge.ts` stop at the bed of the channel and the middle is left open so the
 * water runs visibly under the span; here the same stringers run down to the bed
 * and the bank end is filled in behind them, because what a ramp lands on is
 * ground rather than water.
 *
 * Nobody picks it either: it is what a path becomes on the last tile of water
 * before the bank. See `groundDecides` below, and `spans.ts` for the rule.
 */
import { PALETTE } from '../palette.ts';
import { spanDeck } from '../parts/span.ts';
import {
  BRIDGE_VOXELS,
  defineModel,
  PAVING_VOXELS,
  TILE_VOXELS,
  type VoxelBuilder,
} from '../voxelgen.ts';

/**
 * Treads in the climb, and so the rise of each one.
 *
 * The lowest plank sits one voxel above the paving and the highest is the
 * deck's, which is `BRIDGE_VOXELS - PAVING_VOXELS` voxels of rise over as many
 * treads — four, which divides the tile into four treads of four voxels.
 */
const TREADS = BRIDGE_VOXELS - PAVING_VOXELS;

/** How deep one tread is, so the climb fills the tile exactly. */
const GOING = TILE_VOXELS / TREADS;

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

    // Lowest tread at the north edge, climbing away from the bank. The planks
    // of tread `step` sit in the layer below that tread's walking surface, so
    // the last one lands in the layer `bridge.ts` lays its deck in.
    for (let step = 0; step < TREADS; step++) {
      const z0 = step * GOING;
      spanDeck(b, {
        y: PAVING_VOXELS + step,
        z0,
        z1: z0 + GOING - 1,
        foot: 0,
      });
    }

    // The abutment: every layer under the lowest tread's beam, filled in across
    // the whole width, because what the bank end lands on is ground rather than
    // the channel the rest of the span crosses.
    b.box(0, N, 0, PAVING_VOXELS - 2, 0, GOING - 1, teak.deep);
  },
});
