/**
 * Bridge tile: the middle of the span a path becomes where it crosses a river or
 * a lake — a boarded timber deck a metre above the water, on piles standing in
 * it.
 * 16x16 footprint, fits a 1x1 ground tile.
 *
 * **It stands `BRIDGE_VOXELS` proud of the tile rather than `PAVING_VOXELS`**,
 * which is the one thing it does not share with the other four pavings. The
 * water inland is flush with the banks either side of it — see
 * `layout/domain/terrain.ts` for why it is flush and not dug — so a deck at the
 * path's own height is a path with blue painted under it. Lifted a metre you can
 * see the river run beneath it, and `bridge-ramp.ts` is the tile that climbs to
 * it off either bank. Between them a crossing comes out as a stepped approach, a
 * level deck and a stepped approach: the middle is off the ground, which is what
 * makes it read as a bridge from the side rather than as blue paving.
 *
 * A two-tile crossing — which is every crossing of the river a bare plot is
 * handed, because `river.ts` runs a channel two tiles wide — is two ramps
 * meeting at their heads and no tile of this at all. This is what the middle of
 * a wider lake takes, and every tile of a platform or a junction.
 *
 * **It is turned along the crossing**, so the deck can be planked *across* the
 * run the way a real one is. That is what `spans.ts` buys. Unturned the crossing
 * runs along z, which is the axis `bridge-ramp.ts` climbs.
 *
 * **It carries no parapet.** `railings.ts` stands a `bridge-railing` along each
 * edge with nothing paved beyond it, so a crossing is railed down its flanks, a
 * junction of two crossings is open all four ways, and a platform is railed round
 * its rim and nowhere in its middle. See `parts/span.ts`.
 *
 * Nobody picks it: the palette offers `path`, and a path drawn over inland water
 * comes out as this. See `groundDecides` below, and `jetty.ts`, which is the
 * span the *sea* takes.
 */
import { PILE_ROWS, spanDeck, spanPiles } from '../parts/span.ts';
import { BRIDGE_VOXELS, defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'bridge',
  label: 'Bridge',
  category: 'grounds',
  // Never picked: a bridge is what a path becomes over a river, so the palette
  // leaves it out and the paving lays it. See `groundDecides`.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    // Planks in the layer under the walking surface, on piles driven into the
    // bed of the channel.
    const planks = BRIDGE_VOXELS - 1;
    spanDeck(b, { y: planks, z0: 0, z1: TILE_VOXELS - 1 });
    spanPiles(b, { beam: planks - 1, rows: PILE_ROWS });
  },
});
